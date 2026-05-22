import type { FinTransacaoItem } from '../../../../core/models/api.models';

export interface FinTransacaoLinhaUi {
  id: number;
  dataYmd: string;
  titular: string;
  subtitulo: string;
  origem: string;
  formaPagamento: string;
  categoria: string;
  valorBruto: number;
  valorLiquido: number;
  conta: 'Caixa' | 'Banco';
  status: 'pago' | 'atrasado';
  pagoToggle: boolean;
  linhaReceita?: boolean;
  idAtendimento?: string | null;
  movimentacaoId?: number | null;
  origemApi?: string;
  editavel?: boolean;
  tipoLinha?: 'movimentacao' | 'pendencia';
}

function valorNum(s: string): number {
  const n = parseFloat(String(s).replace(',', '.'));
  return Number.isFinite(n) ? n : 0;
}

/** Dinheiro/Pix → Caixa; cartão/transferência/débito/crédito → Banco. */
export function contaFromMetodo(metodo: string | null | undefined): 'Caixa' | 'Banco' {
  const m = String(metodo ?? '')
    .trim()
    .toLowerCase();
  if (!m) return 'Caixa';
  if (
    m.includes('cartão') ||
    m.includes('cartao') ||
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
  const nome = String(item.nome_cliente ?? '').trim();
  if (nome) return nome;
  const d = String(item.descricao ?? '').trim();
  if (d) {
    const m1 = /^Pagamento comanda — (.+)$/i.exec(d);
    if (m1?.[1]) return m1[1].trim();
    const m2 = /^Crédito cliente \(excesso de pagamento\) — (.+)$/i.exec(d);
    if (m2?.[1]) return m2[1].trim();
    if (d.length <= 80) return d;
  }
  return String(item.categoria_nome ?? '').trim() || '—';
}

export function mapFinTransacaoItemToUi(item: FinTransacaoItem): FinTransacaoLinhaUi {
  const v = valorNum(item.valor);
  const forma = String(item.metodo_pagamento ?? '').trim() || '—';
  return {
    id: item.id_ui,
    dataYmd: String(item.data_mov).slice(0, 10),
    titular: titularFromItem(item),
    subtitulo: String(item.subtitulo ?? '').trim() || '—',
    origem: String(item.origem_label ?? '').trim() || '—',
    formaPagamento: forma,
    categoria: String(item.categoria_nome ?? '').trim() || '—',
    valorBruto: v,
    valorLiquido: v,
    conta: contaFromMetodo(item.metodo_pagamento),
    status: item.status,
    pagoToggle: item.status === 'pago',
    linhaReceita: item.natureza === 'receita',
    idAtendimento: item.id_atendimento,
    movimentacaoId: item.movimentacao_id,
    origemApi: item.origem,
    editavel: item.editavel,
    tipoLinha: item.tipo,
  };
}
