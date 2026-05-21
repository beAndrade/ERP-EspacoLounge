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

/** Data civil de hoje no fuso local (AAAA-MM-DD). */
export function ymdHojeCivil(): string {
  const d = new Date();
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

/** `dataYmd` estritamente anterior ao dia de hoje. */
export function dataYmdAnteriorAHoje(dataYmd: string): boolean {
  const y = String(dataYmd ?? '').trim().slice(0, 10);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(y)) return false;
  return y < ymdHojeCivil();
}

/**
 * Comanda com parcelas em `comanda_pagamentos` ou pagamento parcial já registado.
 * Nestes casos o vencimento segue a data da prestação, não a data da comanda.
 */
export function itemTemParcelasOuPagamentoParcial(
  l: AtendimentoListaItem,
): boolean {
  const menor = (l.pagamento_prestacao_menor_data ?? '').trim().slice(0, 10);
  if (/^\d{4}-\d{2}-\d{2}$/.test(menor)) return true;
  const ps = String(l.pagamentoStatus ?? '').trim().toLowerCase();
  if (ps === 'parcial') return true;
  const pago = Number(l.total_pago ?? 0);
  if (ps === 'pendente' && Number.isFinite(pago) && pago > EPS_MOEDA) {
    return true;
  }
  return false;
}

/** Prestação `pendente` com `data_pagamento` da parcela já vencida (antes de hoje). */
export function prestacaoPendenteVencidaItem(l: AtendimentoListaItem): boolean {
  if (l.pagamento_prestacao_pendente_atrasada === true) return true;
  const menor = (l.pagamento_prestacao_menor_data ?? '').trim().slice(0, 10);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(menor)) return false;
  return dataYmdAnteriorAHoje(menor);
}

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
 * Comanda faturada com saldo em aberto exibida como «Atrasado».
 * Com parcelas: só se alguma prestação `pendente` tiver data de vencimento &lt; hoje.
 * Sem parcelas: data da comanda passada e pagamento único ainda não quitado.
 */
export function pagamentoEmAtrasoParaExibicao(
  l: AtendimentoListaItem,
  dataComandaYmd: string,
): boolean {
  if (itemTemParcelasOuPagamentoParcial(l)) {
    return prestacaoPendenteVencidaItem(l);
  }
  const dataComanda = String(dataComandaYmd ?? '').trim().slice(0, 10);
  if (!dataYmdAnteriorAHoje(dataComanda)) return false;
  const metodo = String(l.pagamentoMetodo ?? '').trim().toLowerCase();
  if (!metodo) return true;
  return metodo === 'pendente';
}

/**
 * Coluna Pagamento: Pago | Em aberto | Atrasado.
 * Retorna `null` se a cobrança ainda não foi finalizada (ver `pagamentoColunaFromGrupo`).
 * Pode passar `jaQuitadaNasCifras` quando a lista usa regra de quitada mais rica que a do util.
 */
export function pagamentoColunaFromItem(
  l: AtendimentoListaItem,
  valorTotalGrupo: number | null,
  opts?: { jaQuitadaNasCifras?: boolean; dataComanda?: string },
): PagamentoColuna | null {
  if (!cobrancaFinalizadaItem(l)) return null;
  const quitada =
    opts?.jaQuitadaNasCifras ??
    comandaQuitadaNasCifrasItem(l, valorTotalGrupo);
  if (quitada) return 'pago';
  const dataRef = (opts?.dataComanda ?? l.data ?? '').trim().slice(0, 10);
  if (pagamentoEmAtrasoParaExibicao(l, dataRef)) return 'atrasado';
  if (itemTemDividaNaoQuitada(l)) return 'em_aberto';
  return 'pago';
}

/** Coluna Pagamento da lista (inclui comanda ainda não faturada). */
export function pagamentoColunaFromGrupo(
  g: ComandaGrupoResumo,
  opts?: { jaQuitadaNasCifras?: boolean },
): PagamentoColuna {
  const l0 = g.linhas[0];
  const quitada =
    opts?.jaQuitadaNasCifras ?? comandaQuitadaNasCifrasItem(l0, g.valorTotal);
  if (quitada) return 'pago';
  const pc = pagamentoColunaFromItem(l0, g.valorTotal, {
    jaQuitadaNasCifras: quitada,
    dataComanda: g.data,
  });
  if (pc != null) return pc;
  if (dataYmdAnteriorAHoje(g.data)) return 'atrasado';
  return 'em_aberto';
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
  /** Comandas com status «Pendente» (cobrança não finalizada), como na lista. */
  comandasPendente: number;
  /** Comandas faturadas com pagamento «Atrasado» na lista. */
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
    if (statusComandaColunaFromGrupo(g) === 'pendente') {
      comandasPendente += 1;
    }
    if (
      cobrancaFinalizadaItem(l0) &&
      !comandaQuitadaNasCifrasGrupo(g) &&
      pagamentoEmAtrasoParaExibicao(l0, g.data)
    ) {
      pagamentosAtrasados += 1;
    }
  }
  return { comandasPendente, pagamentosAtrasados };
}

/** Linha da secção «Débitos» na ficha do cliente (pagamentos em atraso). */
export interface ClienteDebitoLinhaUi {
  idAtendimento: string;
  numeroComanda: number | null;
  descricao: string;
  vencimentoYmd: string;
  valorReais: number;
}

/** Linha da secção «Comandas em aberto» na ficha do cliente. */
export interface ClienteComandaAbertaLinhaUi {
  idAtendimento: string;
  numeroComanda: number | null;
  dataYmd: string;
  valorReais: number;
}

function valorMonetarioGrupoCliente(g: ComandaGrupoResumo): number {
  const l0 = g.linhas[0];
  if (statusComandaColunaFromGrupo(g) === 'pendente') {
    const total = g.valorTotal;
    if (total != null && Number.isFinite(total)) return total;
    const v = valorMonetarioParaNumero(l0.valor);
    return v != null && Number.isFinite(v) ? v : 0;
  }
  const saldo = Number(l0.saldo);
  if (Number.isFinite(saldo) && saldo >= 0) return saldo;
  const total = g.valorTotal ?? 0;
  const pago = Number(l0.total_pago ?? 0);
  const devido = Number.isFinite(total) ? total : 0;
  const p = Number.isFinite(pago) ? pago : 0;
  return Math.max(0, Math.round((devido - p) * 100) / 100);
}

function vencimentoDebitoGrupo(g: ComandaGrupoResumo): string {
  const l0 = g.linhas[0];
  const menor = (l0.pagamento_prestacao_menor_data ?? '').trim().slice(0, 10);
  if (/^\d{4}-\d{2}-\d{2}$/.test(menor)) return menor;
  return g.data;
}

function rotuloComandaDebito(
  numero: number | null,
  nomeCliente: string,
): string {
  const nome = String(nomeCliente ?? '').trim() || 'Cliente';
  const rotulo =
    numero != null && numero > 0 ? `comanda #${numero}` : 'comanda';
  return `Referente à ${rotulo} para ${nome}`;
}

/**
 * Agrupa atendimentos do cliente em linhas para a aba «Débitos» do drawer.
 */
export function painelDebitosClienteFromAtendimentos(
  clienteId: string,
  items: AtendimentoListaItem[],
): {
  debitos: ClienteDebitoLinhaUi[];
  comandasAberto: ClienteComandaAbertaLinhaUi[];
} {
  const cid = String(clienteId ?? '').trim();
  if (!cid) {
    return { debitos: [], comandasAberto: [] };
  }

  const grupos = agruparAtendimentosEmComandas(items).filter(
    (g) => idClienteDoGrupo(g) === cid,
  );

  const debitos: ClienteDebitoLinhaUi[] = [];
  const comandasAberto: ClienteComandaAbertaLinhaUi[] = [];

  for (const g of grupos) {
    const l0 = g.linhas[0];
    const idAt = String(l0?.id ?? '').trim();
    if (!idAt) continue;

    const numero = l0.numeroComanda ?? null;
    const nome = String(l0.nomeCliente ?? '').trim();

    if (statusComandaColunaFromGrupo(g) === 'pendente') {
      comandasAberto.push({
        idAtendimento: idAt,
        numeroComanda: numero,
        dataYmd: g.data,
        valorReais: valorMonetarioGrupoCliente(g),
      });
      continue;
    }

    if (
      cobrancaFinalizadaItem(l0) &&
      !comandaQuitadaNasCifrasGrupo(g) &&
      pagamentoEmAtrasoParaExibicao(l0, g.data)
    ) {
      debitos.push({
        idAtendimento: idAt,
        numeroComanda: numero,
        descricao: rotuloComandaDebito(numero, nome),
        vencimentoYmd: vencimentoDebitoGrupo(g),
        valorReais: valorMonetarioGrupoCliente(g),
      });
    }
  }

  const byVenc = (a: ClienteDebitoLinhaUi, b: ClienteDebitoLinhaUi) =>
    b.vencimentoYmd.localeCompare(a.vencimentoYmd);
  const byData = (a: ClienteComandaAbertaLinhaUi, b: ClienteComandaAbertaLinhaUi) =>
    b.dataYmd.localeCompare(a.dataYmd);

  debitos.sort(byVenc);
  comandasAberto.sort(byData);

  return { debitos, comandasAberto };
}

export function totalDebitosCliente(debitos: ClienteDebitoLinhaUi[]): number {
  return Math.round(
    debitos.reduce((s, d) => s + d.valorReais, 0) * 100,
  ) / 100;
}

export function totalComandasAbertoCliente(
  linhas: ClienteComandaAbertaLinhaUi[],
): number {
  return Math.round(
    linhas.reduce((s, d) => s + d.valorReais, 0) * 100,
  ) / 100;
}
