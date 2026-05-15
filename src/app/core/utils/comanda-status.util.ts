import type { AtendimentoListaItem } from '../models/api.models';
import {
  ordenarLinhasAtendimentoInPlace,
  valorMonetarioParaNumero,
} from './atendimento-display';

export type StatusComandaColuna = 'pendente' | 'finalizado';
export type PagamentoColuna = 'pago' | 'em_aberto' | 'atrasado';

/** Um pedido (`id_atendimento`) com linhas agregadas — espelho da lista de comandas. */
export interface ComandaGrupoResumo {
  id: string;
  data: string;
  linhas: AtendimentoListaItem[];
  valorTotal: number | null;
}

const EPS_MOEDA = 0.005;

export function cobrancaFinalizadaItem(l: AtendimentoListaItem): boolean {
  return String(l.cobrancaStatus ?? '').trim().toLowerCase() === 'finalizada';
}

/** Coluna Status: só Pendente (não faturada) ou Finalizado. */
export function statusComandaColunaFromItem(
  l: AtendimentoListaItem,
): StatusComandaColuna {
  return cobrancaFinalizadaItem(l) ? 'finalizado' : 'pendente';
}

export function statusComandaColunaFromGrupo(
  g: ComandaGrupoResumo,
): StatusComandaColuna {
  return statusComandaColunaFromItem(g.linhas[0]);
}

/** `pagamento_status` = pendente (dívida agendada / parcelas futuras). */
export function comandaPagamentoPendenteDividaItem(
  l: AtendimentoListaItem,
): boolean {
  const ps = String(l.pagamentoStatus ?? '').trim().toLowerCase();
  return ps === 'pendente';
}

export function comandaPagamentoPendenteDividaGrupo(
  g: ComandaGrupoResumo,
): boolean {
  return comandaPagamentoPendenteDividaItem(g.linhas[0]);
}

function totalDevidoItem(
  l: AtendimentoListaItem,
  valorTotalGrupo: number | null,
): number {
  const apiTotal = Number(l?.total);
  if (Number.isFinite(apiTotal) && apiTotal >= 0) return apiTotal;
  if (
    valorTotalGrupo != null &&
    Number.isFinite(valorTotalGrupo)
  ) {
    return valorTotalGrupo;
  }
  return NaN;
}

export function comandaQuitadaNasCifrasItem(
  l: AtendimentoListaItem,
  valorTotalGrupo: number | null,
): boolean {
  if (comandaPagamentoPendenteDividaItem(l)) return false;
  if (l?.status_cobranca === 'pago') return true;
  const pago = Number(l?.total_pago ?? 0);
  const saldo = Number(l?.saldo);
  if (Number.isFinite(saldo) && saldo <= EPS_MOEDA && pago > EPS_MOEDA) {
    return true;
  }
  const total = totalDevidoItem(l, valorTotalGrupo);
  if (
    Number.isFinite(total) &&
    total > 0 &&
    Number.isFinite(pago) &&
    pago + EPS_MOEDA >= total
  ) {
    return true;
  }
  const bruto = Number(l?.total_bruto);
  const desc = l?.desconto_num;
  if (
    Number.isFinite(bruto) &&
    bruto > EPS_MOEDA &&
    typeof desc === 'number' &&
    desc > EPS_MOEDA &&
    Number.isFinite(pago) &&
    pago + EPS_MOEDA >= bruto - desc
  ) {
    return true;
  }
  if (Number.isFinite(saldo) && saldo <= EPS_MOEDA) return true;
  return false;
}

export function comandaQuitadaNasCifrasGrupo(
  g: ComandaGrupoResumo,
): boolean {
  return comandaQuitadaNasCifrasItem(g.linhas[0], g.valorTotal);
}

function itemTemDividaNaoQuitada(l: AtendimentoListaItem): boolean {
  const ps = String(l.pagamentoStatus ?? '').trim().toLowerCase();
  if (ps === 'pendente' || ps === 'parcial') return true;
  const saldo = Number(l.saldo ?? 0);
  if (Number.isFinite(saldo) && saldo > EPS_MOEDA) return true;
  const md = (l.pagamento_prestacao_menor_data ?? '').trim();
  if (/^\d{4}-\d{2}-\d{2}$/.test(md)) return true;
  return false;
}

/**
 * Coluna Pagamento (só comanda faturada): Pago | Em aberto | Atrasado.
 * Pode passar `jaQuitadaNasCifras` quando a lista usa regra de quitada mais rica que a do util.
 */
export function pagamentoColunaFromItem(
  l: AtendimentoListaItem,
  valorTotalGrupo: number | null,
  opts?: { jaQuitadaNasCifras?: boolean },
): PagamentoColuna | null {
  if (!cobrancaFinalizadaItem(l)) return null;
  const quitada =
    opts?.jaQuitadaNasCifras ??
    comandaQuitadaNasCifrasItem(l, valorTotalGrupo);
  if (quitada) return 'pago';
  if (l.pagamento_prestacao_pendente_atrasada === true) return 'atrasado';
  if (itemTemDividaNaoQuitada(l)) return 'em_aberto';
  return 'pago';
}

export function pagamentoColunaFromGrupo(
  g: ComandaGrupoResumo,
): PagamentoColuna | null {
  return pagamentoColunaFromItem(g.linhas[0], g.valorTotal);
}

export function agruparAtendimentosEmComandas(
  items: AtendimentoListaItem[],
): ComandaGrupoResumo[] {
  const map = new Map<string, AtendimentoListaItem[]>();
  let legacyIdx = 0;
  for (const a of items) {
    const ymd = (a.data || '').slice(0, 10);
    const idAt = String(a.id || '').trim();
    const nome = (a.nomeCliente || '').trim().toLowerCase();
    const key = idAt ? `id:${idAt}` : `${ymd}\u0001legacy:${nome}:${legacyIdx++}`;
    if (!map.has(key)) map.set(key, []);
    map.get(key)!.push(a);
  }

  const grupos: ComandaGrupoResumo[] = [];
  for (const [key, linhas] of map) {
    ordenarLinhasAtendimentoInPlace(linhas);
    const data = (linhas[0].data || '').slice(0, 10);
    let sum = 0;
    let temValor = false;
    for (const l of linhas) {
      const v = valorMonetarioParaNumero(l.valor);
      if (v !== null) {
        sum += v;
        temValor = true;
      }
    }
    const subtotal = temValor ? sum : null;
    const dn = linhas[0]?.desconto_num;
    const descontoApi =
      typeof dn === 'number' && Number.isFinite(dn) && dn > 0 ? dn : null;
    const descontoN = valorMonetarioParaNumero(linhas[0]?.desconto);
    const descontoValor =
      descontoApi ??
      (descontoN !== null && descontoN > 0 ? descontoN : null);
    const apiTotal = Number(linhas[0]?.total);
    let valorTotal = subtotal;
    if (Number.isFinite(apiTotal) && apiTotal >= 0) {
      valorTotal = apiTotal;
    } else if (subtotal !== null && descontoValor !== null) {
      valorTotal = Math.max(
        0,
        Math.round((subtotal - descontoValor) * 100) / 100,
      );
    }
    grupos.push({ id: key, data, linhas, valorTotal });
  }
  return grupos;
}

export function idClienteDoGrupo(g: ComandaGrupoResumo): string {
  return String(g.linhas[0]?.idCliente ?? '').trim();
}

export interface ContagensSidebarCliente {
  /** Comandas não faturadas (`cobranca_status` ≠ finalizada). */
  comandasPendente: number;
  /** Comandas faturadas com prestação pendente vencida (critério API / BD). */
  pagamentosAtrasados: number;
}

export function contagensSidebarParaCliente(
  clienteId: string,
  items: AtendimentoListaItem[],
): ContagensSidebarCliente {
  const cid = String(clienteId ?? '').trim();
  if (!cid) {
    return { comandasPendente: 0, pagamentosAtrasados: 0 };
  }
  const grupos = agruparAtendimentosEmComandas(items).filter(
    (g) => idClienteDoGrupo(g) === cid,
  );
  let comandasPendente = 0;
  let pagamentosAtrasados = 0;
  for (const g of grupos) {
    const l0 = g.linhas[0];
    if (!cobrancaFinalizadaItem(l0)) {
      comandasPendente += 1;
    }
    if (l0.pagamento_prestacao_pendente_atrasada === true) {
      pagamentosAtrasados += 1;
    }
  }
  return { comandasPendente, pagamentosAtrasados };
}
