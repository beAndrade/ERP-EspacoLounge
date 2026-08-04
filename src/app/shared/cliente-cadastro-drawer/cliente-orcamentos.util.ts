import type { AtendimentoListaItem } from '../../core/models/api.models';
import { linhaResumoAtendimentoLista } from '../../core/utils/atendimento-display';
import {
  agruparAtendimentosEmComandas,
  idClienteDoGrupo,
  type ComandaGrupoResumo,
} from '../../core/utils/comanda-status.util';
import {
  ymdFimFiltroAgendamentosPadrao,
  ymdInicioFiltroAgendamentosPadrao,
} from './cliente-agendamentos.util';

export type OrcamentoStatusUi = 'rascunho' | 'enviado' | 'arquivado';

export type ClienteOrcamentoHistoricoLinha = {
  idAtendimento: string;
  dataYmd: string;
  dataExibicao: string;
  servico: string;
  statusId: OrcamentoStatusUi;
  statusLabel: string;
  valorTotal: number;
  /** Número do orçamento (`numero_orcamento`); fallback legado em `numeroComanda`. */
  numeroOrcamento: number | null;
};

export const ymdInicioFiltroOrcamentosPadrao = ymdInicioFiltroAgendamentosPadrao;
export const ymdFimFiltroOrcamentosPadrao = ymdFimFiltroAgendamentosPadrao;

const STATUS_LABEL: Record<OrcamentoStatusUi, string> = {
  rascunho: 'Rascunho',
  enviado: 'Enviado',
  arquivado: 'Arquivado',
};

function ymdParaExibicaoDdMmYyyy(ymd: string): string {
  const y = String(ymd ?? '').trim().slice(0, 10);
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(y);
  if (!m) return y || '';
  return `${m[3]}/${m[2]}/${m[1]}`;
}

function normalizarStatusOrcamento(
  raw: string | null | undefined,
): OrcamentoStatusUi {
  const st = String(raw ?? 'rascunho').trim().toLowerCase();
  if (st === 'arquivado') return 'arquivado';
  /** `aceito` legado → tratado como enviado. */
  if (st === 'enviado' || st === 'aceito') return 'enviado';
  return 'rascunho';
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

function valorTotalGrupo(g: ComandaGrupoResumo): number {
  const l0 = g.linhas[0];
  if (l0?.total != null && Number.isFinite(Number(l0.total))) {
    return Math.max(0, Number(l0.total));
  }
  if (typeof g.valorTotal === 'number' && Number.isFinite(g.valorTotal)) {
    return Math.max(0, g.valorTotal);
  }
  return 0;
}

/**
 * Histórico de orçamentos do cliente (um registo por `id_atendimento`).
 */
export function historicoOrcamentosClienteFromAtendimentos(
  clienteId: string,
  items: AtendimentoListaItem[],
  filtroInicioYmd: string,
  filtroFimYmd: string,
): ClienteOrcamentoHistoricoLinha[] {
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
    return true;
  });

  const linhas: ClienteOrcamentoHistoricoLinha[] = grupos.map((g) => {
    const l0 = g.linhas[0];
    const idAt = String(l0?.id ?? '').trim();
    const statusId = normalizarStatusOrcamento(l0?.orcamento_status);
    const nRaw = l0?.numeroOrcamento ?? l0?.numeroComanda;
    const numeroOrcamento =
      typeof nRaw === 'number' && Number.isFinite(nRaw) && nRaw > 0
        ? nRaw
        : null;
    return {
      idAtendimento: idAt,
      dataYmd: (g.data || '').slice(0, 10),
      dataExibicao: ymdParaExibicaoDdMmYyyy(g.data || ''),
      servico: servicoExibicaoGrupo(g),
      statusId,
      statusLabel: STATUS_LABEL[statusId],
      valorTotal: valorTotalGrupo(g),
      numeroOrcamento,
    };
  });

  linhas.sort((a, b) => {
    const cmpData = b.dataYmd.localeCompare(a.dataYmd);
    if (cmpData !== 0) return cmpData;
    return b.idAtendimento.localeCompare(a.idAtendimento);
  });

  return linhas.filter((r) => r.idAtendimento.length > 0);
}

/** Contagem de orçamentos distintos do cliente (sidebar Informações). */
export function contarOrcamentosCliente(
  clienteId: string,
  items: AtendimentoListaItem[],
): number {
  const cid = String(clienteId ?? '').trim();
  if (!cid) return 0;
  const ids = new Set<string>();
  for (const it of items) {
    if (String(it.idCliente ?? '').trim() !== cid) continue;
    const id = String(it.id ?? '').trim();
    if (id) ids.add(id);
  }
  return ids.size;
}
