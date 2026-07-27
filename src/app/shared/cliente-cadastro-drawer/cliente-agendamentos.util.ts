import type { AtendimentoListaItem } from '../../core/models/api.models';
import {
  AGENDA_STATUS_META,
  normalizarAgendaStatusId,
  type AgendaStatusId,
} from '../../core/utils/agenda-status-card';
import {
  diaCivilReferenciaHorarioGrupo,
  horaInicialMenorDasLinhasAtendimento,
  linhaResumoAtendimentoLista,
  pedidoTemHorarioAgendadoNasLinhas,
} from '../../core/utils/atendimento-display';
import {
  agruparAtendimentosEmComandas,
  idClienteDoGrupo,
  type ComandaGrupoResumo,
} from '../../core/utils/comanda-status.util';

export type ClienteAgendamentoHistoricoLinha = {
  idAtendimento: string;
  dataYmd: string;
  dataHoraExibicao: string;
  servico: string;
  statusId: AgendaStatusId;
  statusLabel: string;
  profissional: string;
  numeroComanda: number | null;
};

function ymdParaExibicaoDdMmYyyy(ymd: string): string {
  const y = String(ymd ?? '').trim().slice(0, 10);
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(y);
  if (!m) return y || '';
  return `${m[3]}/${m[2]}/${m[1]}`;
}

function horaExibicaoGrupo(g: ComandaGrupoResumo): string {
  const dia = diaCivilReferenciaHorarioGrupo(
    g.linhas,
    (g.data || '').slice(0, 10),
  );
  const hhmm = horaInicialMenorDasLinhasAtendimento(g.linhas, dia);
  if (!hhmm) return '';
  const [h, mi] = hhmm.split(':');
  return `${h}:${mi}`;
}

function dataHoraExibicaoGrupo(g: ComandaGrupoResumo): string {
  const dia = diaCivilReferenciaHorarioGrupo(
    g.linhas,
    (g.data || '').slice(0, 10),
  );
  const data = ymdParaExibicaoDdMmYyyy(dia || g.data);
  const hora = horaExibicaoGrupo(g);
  return hora ? `${data} às ${hora}` : data;
}

function rotuloStatusAgenda(id: string | null | undefined): {
  statusId: AgendaStatusId;
  statusLabel: string;
} {
  const statusId = normalizarAgendaStatusId(id);
  const hit = AGENDA_STATUS_META.find((x) => x.id === statusId);
  return { statusId, statusLabel: hit?.label ?? 'Confirmado' };
}

function servicoExibicaoGrupo(g: ComandaGrupoResumo): string {
  const l0 = g.linhas[0];
  if (!l0) return '';
  const partes = new Set<string>();
  for (const l of g.linhas) {
    const t = String(l.tipo ?? '').trim().toLowerCase();
    if (t === 'mega' || t === 'pacote') {
      const pac = String(l.pacote ?? '').trim();
      if (pac) {
        partes.add(pac);
        continue;
      }
    }
    const r = linhaResumoAtendimentoLista(l).trim();
    if (r && r !== '—') partes.add(r);
  }
  if (partes.size === 0) {
    return linhaResumoAtendimentoLista(l0).trim();
  }
  return [...partes].join(' · ');
}

function profissionalExibicaoGrupo(g: ComandaGrupoResumo): string {
  for (const l of g.linhas) {
    const p = String(l.profissional ?? '').trim();
    if (p) return p;
  }
  return '';
}

/**
 * Histórico de agendamentos do cliente (um registo por `id_atendimento`).
 */
export function historicoAgendamentosClienteFromAtendimentos(
  clienteId: string,
  items: AtendimentoListaItem[],
  filtroInicioYmd: string,
  filtroFimYmd: string,
): ClienteAgendamentoHistoricoLinha[] {
  const cid = String(clienteId ?? '').trim();
  if (!cid) return [];

  const ini = String(filtroInicioYmd ?? '').trim().slice(0, 10);
  const fim = String(filtroFimYmd ?? '').trim().slice(0, 10);

  const grupos = agruparAtendimentosEmComandas(items).filter((g) => {
    if (idClienteDoGrupo(g) !== cid) return false;
    const d = (g.data || '').slice(0, 10);
    if (!/^\d{4}-\d{2}-\d{2}$/.test(d)) return false;
    if (ini && d < ini) return false;
    if (fim && d > fim) return false;
    /** Só agendamento com horário (`atendimentos.inicio`); comanda walk-in fica de fora. */
    if (!pedidoTemHorarioAgendadoNasLinhas(g.linhas, d)) return false;
    return true;
  });

  const linhas: ClienteAgendamentoHistoricoLinha[] = grupos.map((g) => {
    const l0 = g.linhas[0];
    const idAt = String(l0?.id ?? '').trim();
    const st = rotuloStatusAgenda(l0?.agenda_status);
    const n = l0?.numeroComanda;
    return {
      idAtendimento: idAt,
      dataYmd: (g.data || '').slice(0, 10),
      dataHoraExibicao: dataHoraExibicaoGrupo(g),
      servico: servicoExibicaoGrupo(g),
      statusId: st.statusId,
      statusLabel: st.statusLabel,
      profissional: profissionalExibicaoGrupo(g),
      numeroComanda:
        typeof n === 'number' && Number.isFinite(n) && n > 0 ? n : null,
    };
  });

  linhas.sort((a, b) => {
    const cmpData = b.dataYmd.localeCompare(a.dataYmd);
    if (cmpData !== 0) return cmpData;
    return b.dataHoraExibicao.localeCompare(a.dataHoraExibicao, 'pt-BR');
  });

  return linhas.filter((r) => r.idAtendimento.length > 0);
}

export function ymdInicioFiltroAgendamentosPadrao(): string {
  const n = new Date();
  const d = new Date(n.getFullYear(), n.getMonth() - 2, 1);
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

export function ymdFimFiltroAgendamentosPadrao(): string {
  const n = new Date();
  const d = new Date(n.getFullYear(), n.getMonth() + 1, 0);
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

export function ymdParaInputDate(ddMmYyyy: string): string {
  const t = String(ddMmYyyy ?? '').trim();
  const br = /^(\d{2})\/(\d{2})\/(\d{4})$/.exec(t);
  if (br) return `${br[3]}-${br[2]}-${br[1]}`;
  if (/^\d{4}-\d{2}-\d{2}$/.test(t.slice(0, 10))) return t.slice(0, 10);
  return '';
}

export function ymdParaExibicaoBrFromInput(ymd: string): string {
  return ymdParaExibicaoDdMmYyyy(ymd);
}
