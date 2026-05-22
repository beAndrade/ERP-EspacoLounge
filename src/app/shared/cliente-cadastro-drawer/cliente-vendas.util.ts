import type { AtendimentoListaItem } from '../../core/models/api.models';
import { linhaResumoAtendimentoLista } from '../../core/utils/atendimento-display';
import {
  agruparAtendimentosEmComandas,
  cobrancaFinalizadaItem,
  idClienteDoGrupo,
  type ComandaGrupoResumo,
} from '../../core/utils/comanda-status.util';
import {
  ymdFimFiltroAgendamentosPadrao,
  ymdInicioFiltroAgendamentosPadrao,
} from './cliente-agendamentos.util';

export type ClienteVendaHistoricoLinha = {
  idAtendimento: string;
  dataYmd: string;
  dataExibicao: string;
  descricao: string;
  valorTotal: number;
  profissional: string;
  numeroComanda: number | null;
};

export const ymdInicioFiltroVendasPadrao = ymdInicioFiltroAgendamentosPadrao;
export const ymdFimFiltroVendasPadrao = ymdFimFiltroAgendamentosPadrao;

function ymdParaExibicaoDdMmYyyy(ymd: string): string {
  const y = String(ymd ?? '').trim().slice(0, 10);
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(y);
  if (!m) return y || '—';
  return `${m[3]}/${m[2]}/${m[1]}`;
}

function descricaoVendasGrupo(g: ComandaGrupoResumo): string {
  const counts = new Map<string, number>();
  for (const l of g.linhas) {
    const label = linhaResumoAtendimentoLista(l).trim();
    if (!label || label === '—') continue;
    counts.set(label, (counts.get(label) ?? 0) + 1);
  }
  if (counts.size === 0) return '—';
  return [...counts.entries()]
    .map(([label, n]) => `(${n}x) ${label}`)
    .join(', ');
}

function profissionalExibicaoGrupo(g: ComandaGrupoResumo): string {
  for (const l of g.linhas) {
    const p = String(l.profissional ?? '').trim();
    if (p) return p;
  }
  return '—';
}

function valorTotalGrupo(g: ComandaGrupoResumo): number {
  const v = g.valorTotal;
  if (typeof v === 'number' && Number.isFinite(v) && v >= 0) return v;
  return 0;
}

/**
 * Vendas do cliente: uma linha por comanda faturada (`id_atendimento`).
 */
export function historicoVendasClienteFromAtendimentos(
  clienteId: string,
  items: AtendimentoListaItem[],
  filtroInicioYmd: string,
  filtroFimYmd: string,
): ClienteVendaHistoricoLinha[] {
  const cid = String(clienteId ?? '').trim();
  if (!cid) return [];

  const ini = String(filtroInicioYmd ?? '').trim().slice(0, 10);
  const fim = String(filtroFimYmd ?? '').trim().slice(0, 10);

  const grupos = agruparAtendimentosEmComandas(items).filter((g) => {
    if (idClienteDoGrupo(g) !== cid) return false;
    const l0 = g.linhas[0];
    if (!l0 || !cobrancaFinalizadaItem(l0)) return false;
    const d = (g.data || '').slice(0, 10);
    if (!/^\d{4}-\d{2}-\d{2}$/.test(d)) return false;
    if (ini && d < ini) return false;
    if (fim && d > fim) return false;
    return true;
  });

  const linhas: ClienteVendaHistoricoLinha[] = grupos.map((g) => {
    const l0 = g.linhas[0];
    const idAt = String(l0?.id ?? '').trim();
    const n = l0?.numeroComanda;
    return {
      idAtendimento: idAt,
      dataYmd: (g.data || '').slice(0, 10),
      dataExibicao: ymdParaExibicaoDdMmYyyy(g.data),
      descricao: descricaoVendasGrupo(g),
      valorTotal: valorTotalGrupo(g),
      profissional: profissionalExibicaoGrupo(g),
      numeroComanda:
        typeof n === 'number' && Number.isFinite(n) && n > 0 ? n : null,
    };
  });

  linhas.sort((a, b) => b.dataYmd.localeCompare(a.dataYmd));

  return linhas.filter((r) => r.idAtendimento.length > 0);
}
