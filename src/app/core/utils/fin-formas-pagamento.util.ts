import type {
  FinFormaPagamentoOpcaoItem,
  MetodoPagamentoComanda,
} from '../models/api.models';

const COMANDA_METODOS = new Set<MetodoPagamentoComanda>([
  'dinheiro',
  'cartao_credito',
  'cartao_debito',
  'pix',
  'transferencia',
  'outros',
  'pendente',
  'a_receber_cartao',
]);

export type MetodoComandaGrupo = 'dinheiro' | 'cartao' | 'pix' | 'outros';

export interface MetodoComandaOpcaoUi {
  value: MetodoPagamentoComanda;
  rotulo: string;
  grupo: MetodoComandaGrupo;
  taxa_percentual: number;
  taxa_fixa: number;
}

export interface FormaTaxaConfig {
  pct: number;
  fixa: number;
}

export function grupoMetodoComanda(codigo: string): MetodoComandaGrupo {
  if (codigo === 'dinheiro') return 'dinheiro';
  if (codigo === 'pix') return 'pix';
  if (codigo === 'cartao_credito' || codigo === 'cartao_debito') return 'cartao';
  return 'outros';
}

export function mapFormasParaMetodosComanda(
  items: FinFormaPagamentoOpcaoItem[],
): MetodoComandaOpcaoUi[] {
  const out: MetodoComandaOpcaoUi[] = [];
  for (const i of items) {
    const c = i.codigo_interno as MetodoPagamentoComanda;
    if (!COMANDA_METODOS.has(c)) continue;
    out.push({
      value: c,
      rotulo: i.nome,
      grupo: grupoMetodoComanda(c),
      taxa_percentual: Number(i.taxa_percentual) || 0,
      taxa_fixa: Number(i.taxa_fixa) || 0,
    });
  }
  return out;
}

export function mapFormasParaNomes(items: FinFormaPagamentoOpcaoItem[]): string[] {
  return items.map((i) => i.nome);
}

export function taxaPorMetodoComanda(
  items: FinFormaPagamentoOpcaoItem[],
  metodo: MetodoPagamentoComanda,
): FormaTaxaConfig {
  const row = items.find((i) => i.codigo_interno === metodo);
  return {
    pct: row ? Number(row.taxa_percentual) || 0 : 0,
    fixa: row ? Number(row.taxa_fixa) || 0 : 0,
  };
}

export function taxaPorMetodoComandaUi(
  opcoes: MetodoComandaOpcaoUi[],
  metodo: MetodoPagamentoComanda,
): FormaTaxaConfig {
  const row = opcoes.find((o) => o.value === metodo);
  return {
    pct: row?.taxa_percentual ?? 0,
    fixa: row?.taxa_fixa ?? 0,
  };
}

export function taxaPorNomeForma(
  items: FinFormaPagamentoOpcaoItem[],
  nome: string,
): FormaTaxaConfig {
  const n = nome.trim().toLowerCase();
  if (!n) return { pct: 0, fixa: 0 };
  const row = items.find((i) => i.nome.trim().toLowerCase() === n);
  return {
    pct: row ? Number(row.taxa_percentual) || 0 : 0,
    fixa: row ? Number(row.taxa_fixa) || 0 : 0,
  };
}

export function rotulosMetodoComandaFromFormas(
  items: FinFormaPagamentoOpcaoItem[],
): Partial<Record<MetodoPagamentoComanda, string>> {
  const map: Partial<Record<MetodoPagamentoComanda, string>> = {};
  for (const i of items) {
    const c = i.codigo_interno as MetodoPagamentoComanda;
    if (COMANDA_METODOS.has(c)) map[c] = i.nome;
  }
  return map;
}

/** Fallback quando a API ainda não tem formas (ex.: migration pendente). */
export const METODOS_COMANDA_FALLBACK: MetodoComandaOpcaoUi[] = [
  {
    value: 'dinheiro',
    rotulo: 'Dinheiro',
    grupo: 'dinheiro',
    taxa_percentual: 0,
    taxa_fixa: 0,
  },
  {
    value: 'cartao_credito',
    rotulo: 'Cartão de crédito',
    grupo: 'cartao',
    taxa_percentual: 3,
    taxa_fixa: 0,
  },
  {
    value: 'cartao_debito',
    rotulo: 'Cartão de débito',
    grupo: 'outros',
    taxa_percentual: 1.5,
    taxa_fixa: 0,
  },
  { value: 'pix', rotulo: 'Pix', grupo: 'pix', taxa_percentual: 0, taxa_fixa: 0 },
  {
    value: 'pendente',
    rotulo: 'Pendente',
    grupo: 'outros',
    taxa_percentual: 0,
    taxa_fixa: 0,
  },
  {
    value: 'transferencia',
    rotulo: 'Transferência',
    grupo: 'outros',
    taxa_percentual: 0,
    taxa_fixa: 0,
  },
  { value: 'outros', rotulo: 'Outros', grupo: 'outros', taxa_percentual: 0, taxa_fixa: 0 },
];

export const METODOS_NOME_FALLBACK = [
  'Débito',
  'Crédito',
  'Dinheiro',
  'Pix',
  'Transferência',
  'Boleto',
];
