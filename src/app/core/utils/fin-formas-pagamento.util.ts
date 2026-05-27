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
]);

export type MetodoComandaGrupo = 'dinheiro' | 'cartao' | 'pix' | 'outros';

export interface MetodoComandaOpcaoUi {
  value: MetodoPagamentoComanda;
  rotulo: string;
  grupo: MetodoComandaGrupo;
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
    });
  }
  return out;
}

export function mapFormasParaNomes(items: FinFormaPagamentoOpcaoItem[]): string[] {
  return items.map((i) => i.nome);
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
  { value: 'dinheiro', rotulo: 'Dinheiro', grupo: 'dinheiro' },
  { value: 'cartao_credito', rotulo: 'Cartão de crédito', grupo: 'cartao' },
  { value: 'cartao_debito', rotulo: 'Cartão de débito', grupo: 'outros' },
  { value: 'pix', rotulo: 'Pix', grupo: 'pix' },
  { value: 'pendente', rotulo: 'Pendente', grupo: 'outros' },
  { value: 'transferencia', rotulo: 'Transferência', grupo: 'outros' },
  { value: 'outros', rotulo: 'Outros', grupo: 'outros' },
];

export const METODOS_NOME_FALLBACK = [
  'Débito',
  'Crédito',
  'Dinheiro',
  'Pix',
  'Transferência',
  'Boleto',
];
