import type {
  FinFormaPagamentoOpcaoItem,
  FinFormaPrazoFaixa,
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
  prazo_recebimento: number;
  prazos_faixas: FinFormaPrazoFaixa[];
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
      prazo_recebimento: Number(i.prazo_recebimento) || 0,
      prazos_faixas: i.prazos_faixas ?? [],
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

export function resolverFaixaParcelasUi(
  faixas: FinFormaPrazoFaixa[] | undefined,
  nParcelas: number,
): FinFormaPrazoFaixa | null {
  const n = Math.max(1, Math.floor(nParcelas));
  return (
    (faixas ?? []).find((f) => n >= f.parcelas_de && n <= f.parcelas_ate) ??
    null
  );
}

export function ymdAddDaysUi(ymd: string, days: number): string {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(String(ymd).trim().slice(0, 10));
  if (!m) return ymd;
  const dt = new Date(
    Number(m[1]),
    Number(m[2]) - 1,
    Number(m[3]) + Math.floor(days),
  );
  const mm = dt.getMonth() + 1;
  const dd = dt.getDate();
  return `${dt.getFullYear()}-${mm < 10 ? `0${mm}` : mm}-${dd < 10 ? `0${dd}` : dd}`;
}

/** Datas de vencimento cartão (espelha a API). */
export function calcularDatasParcelasCartaoUi(opts: {
  dataVendaYmd: string;
  nParcelas: number;
  faixa: FinFormaPrazoFaixa | null;
  prazoRecebimentoFallback?: number;
}): string[] {
  const n = Math.max(1, Math.floor(opts.nParcelas));
  const base = String(opts.dataVendaYmd).trim().slice(0, 10);
  if (opts.faixa) {
    return Array.from({ length: n }, (_, i) => {
      const offset =
        opts.faixa!.dias_ate_primeira + i * opts.faixa!.intervalo_dias;
      return ymdAddDaysUi(base, offset);
    });
  }
  const prazo = Math.max(0, Math.floor(opts.prazoRecebimentoFallback ?? 0));
  const intervalo = n > 1 ? 30 : 0;
  return Array.from({ length: n }, (_, i) =>
    ymdAddDaysUi(base, prazo + i * intervalo),
  );
}

export function ymdHojeUi(): string {
  const d = new Date();
  const m = d.getMonth() + 1;
  const day = d.getDate();
  return `${d.getFullYear()}-${m < 10 ? `0${m}` : m}-${day < 10 ? `0${day}` : day}`;
}

/** Fallback quando a API ainda não tem formas (ex.: migration pendente). */
export const METODOS_COMANDA_FALLBACK: MetodoComandaOpcaoUi[] = [
  {
    value: 'dinheiro',
    rotulo: 'Dinheiro',
    grupo: 'dinheiro',
    taxa_percentual: 0,
    taxa_fixa: 0,
    prazo_recebimento: 0,
    prazos_faixas: [],
  },
  {
    value: 'cartao_credito',
    rotulo: 'Cartão de crédito',
    grupo: 'cartao',
    taxa_percentual: 3,
    taxa_fixa: 0,
    prazo_recebimento: 30,
    prazos_faixas: [
      {
        parcelas_de: 1,
        parcelas_ate: 1,
        dias_ate_primeira: 30,
        intervalo_dias: 0,
        taxa_percentual: null,
        juros_cliente: false,
      },
      {
        parcelas_de: 2,
        parcelas_ate: 2,
        dias_ate_primeira: 30,
        intervalo_dias: 30,
        taxa_percentual: null,
        juros_cliente: false,
      },
      {
        parcelas_de: 3,
        parcelas_ate: 18,
        dias_ate_primeira: 30,
        intervalo_dias: 30,
        taxa_percentual: null,
        juros_cliente: true,
      },
    ],
  },
  {
    value: 'cartao_debito',
    rotulo: 'Cartão de débito',
    grupo: 'outros',
    taxa_percentual: 1.5,
    taxa_fixa: 0,
    prazo_recebimento: 0,
    prazos_faixas: [],
  },
  {
    value: 'pix',
    rotulo: 'Pix',
    grupo: 'pix',
    taxa_percentual: 0,
    taxa_fixa: 0,
    prazo_recebimento: 0,
    prazos_faixas: [],
  },
  {
    value: 'pendente',
    rotulo: 'Pendente',
    grupo: 'outros',
    taxa_percentual: 0,
    taxa_fixa: 0,
    prazo_recebimento: 0,
    prazos_faixas: [],
  },
  {
    value: 'transferencia',
    rotulo: 'Transferência',
    grupo: 'outros',
    taxa_percentual: 0,
    taxa_fixa: 0,
    prazo_recebimento: 0,
    prazos_faixas: [],
  },
  {
    value: 'outros',
    rotulo: 'Outros',
    grupo: 'outros',
    taxa_percentual: 0,
    taxa_fixa: 0,
    prazo_recebimento: 0,
    prazos_faixas: [],
  },
];

export const METODOS_NOME_FALLBACK = [
  'Débito',
  'Crédito',
  'Dinheiro',
  'Pix',
  'Transferência',
  'Boleto',
];
