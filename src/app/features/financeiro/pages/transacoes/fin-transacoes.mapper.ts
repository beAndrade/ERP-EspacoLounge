import type { FinTransacaoItem } from '../../../../core/models/api.models';
import { calcularValorLiquidoReceita } from '../../../../core/utils/fin-taxa.util';

export interface FinTransacaoLinhaUi {
  id: number;
  dataYmd: string;
  /** Data de criação do lançamento (competência). */
  criadoEmYmd: string;
  titular: string;
  subtitulo: string;
  origem: string;
  formaPagamento: string;
  categoria: string;
  categoriaId?: number;
  descricao?: string | null;
  valorBruto: number;
  valorLiquido: number;
  conta: 'Caixa' | 'Banco';
  status: 'pago' | 'atrasado' | 'em_aberto';
  pagoToggle: boolean;
  linhaReceita?: boolean;
  idAtendimento?: string | null;
  clienteId?: string | null;
  numeroComanda?: number | null;
  comandaPagamentoId?: number | null;
  movimentacaoId?: number | null;
  origemApi?: string;
  editavel?: boolean;
  tipoLinha?: 'movimentacao' | 'pendencia';
  /** Forma com baixa automática (cadastro financeiro). */
  metodoBaixaAutomatica?: boolean;
  pagoEmYmd?: string | null;
}

function valorNum(s: string): number {
  const n = parseFloat(String(s).replace(',', '.'));
  return Number.isFinite(n) ? n : 0;
}

function calcularValorLiquido(
  bruto: number,
  natureza: 'receita' | 'despesa',
  taxaPct: number,
  taxaFixa: number,
): number {
  if (natureza !== 'receita') return bruto;
  return calcularValorLiquidoReceita(bruto, taxaPct, taxaFixa);
}

/** Dinheiro/Pix → Caixa; cartão/transferência/débito/crédito/a receber cartão → Banco. */
export function contaFromMetodo(metodo: string | null | undefined): 'Caixa' | 'Banco' {
  const m = String(metodo ?? '')
    .trim()
    .toLowerCase();
  if (!m) return 'Caixa';
  if (
    m.includes('cartão') ||
    m.includes('cartao') ||
    m.includes('a receber') ||
    m.includes('crédito') ||
    m.includes('credito') ||
    m.includes('débito') ||
    m.includes('debito') ||
    m.includes('transfer')
  ) {
    return 'Banco';
  }
  return 'Caixa';
}

function titularFromItem(item: FinTransacaoItem): string {
  const d = String(item.descricao ?? '').trim();
  if (d) {
    const mComissao = /^Pagamento de comiss[aã]o para (.+)$/i.exec(d);
    if (mComissao?.[1]) return mComissao[1].trim();
    const m1 = /^Pagamento comanda — (.+)$/i.exec(d);
    if (m1?.[1]) return m1[1].trim();
    const m2 = /^Crédito cliente \(excesso de pagamento\) — (.+)$/i.exec(d);
    if (m2?.[1]) return m2[1].trim();
  }
  const nome = String(item.nome_cliente ?? '').trim();
  if (nome) return nome;
  if (d) {
    if (d.length <= 80) return d;
  }
  return String(item.categoria_nome ?? '').trim();
}

export function mapFinTransacaoItemToUi(item: FinTransacaoItem): FinTransacaoLinhaUi {
  const v = valorNum(item.valor);
  const forma = String(item.metodo_pagamento ?? '').trim();
  const taxaPct = item.taxa_percentual ?? 0;
  const taxaFixa = item.taxa_fixa ?? 0;
  const valorLiquido = calcularValorLiquido(v, item.natureza, taxaPct, taxaFixa);
  return {
    id: item.id_ui,
    dataYmd: String(item.data_mov).slice(0, 10),
    criadoEmYmd: String(item.criado_em ?? item.data_mov).slice(0, 10),
    titular: titularFromItem(item),
    subtitulo: String(item.subtitulo ?? '').trim(),
    origem: String(item.origem_label ?? '').trim(),
    formaPagamento: forma,
    categoria: String(item.categoria_nome ?? '').trim(),
    categoriaId: item.categoria_id,
    descricao: item.descricao,
    valorBruto: v,
    valorLiquido,
    conta: contaFromMetodo(item.metodo_pagamento),
    status: item.status,
    pagoToggle: item.status === 'pago',
    linhaReceita: item.natureza === 'receita',
    idAtendimento: item.id_atendimento,
    clienteId: item.id_cliente,
    numeroComanda: item.numero_comanda,
    movimentacaoId: item.movimentacao_id,
    comandaPagamentoId: item.comanda_pagamento_id,
    origemApi: item.origem,
    editavel: item.editavel,
    tipoLinha: item.tipo,
    metodoBaixaAutomatica: item.metodo_baixa_automatica === true,
    pagoEmYmd: item.pago_em ? String(item.pago_em).slice(0, 10) : null,
  };
}
