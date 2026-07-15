/** Ponto de série para sparkline do painel (API futura). */
export type PainelSparkPoint = {
  /** Data YYYY-MM-DD. */
  ymd: string;
  value: number;
  /** Rótulo formatado opcional (ex.: "R$ 120,00"). */
  label?: string;
};

/** Ponto genérico para gráficos grandes (SVG). */
export type PainelChartPoint = {
  label: string;
  value: number;
  ymd?: string;
  /** Variação vs período anterior (%). */
  deltaPct?: number | null;
  /** Observação / categoria auxiliar. */
  nota?: string | null;
  /** Meta livre (hora, conversão, etc.). */
  meta?: Record<string, string | number | null | undefined>;
};

export type PainelAgendaProximoItem = {
  hora: string;
  nome: string;
  /** Status confirmado → mostra ✔ no hover. */
  confirmado?: boolean;
};

export type PainelFaturamentoMetodoLinha = {
  rotulo: string;
  valor: number;
};

export type PainelFaturamentoCardVm = {
  total: number | null;
  despesas: number | null;
  lucro: number | null;
  qtdVendas: number | null;
  ticketMedio: number | null;
  /** Variação percentual vs ontem (ex.: 12 = +12%). */
  vsOntemPct: number | null;
  /** Breakdown por método de pagamento (hover). */
  metodos: PainelFaturamentoMetodoLinha[];
  spark: PainelSparkPoint[];
};

export type PainelAgendaCardVm = {
  /** Quantidade de atendimentos hoje. */
  total: number | null;
  proximos: PainelAgendaProximoItem[];
  spark: PainelSparkPoint[];
};

export type PainelClientesCardVm = {
  total: number | null;
  aniversariosHoje: number | null;
  novosSemana: number | null;
  inativos: number | null;
  spark: PainelSparkPoint[];
};

export type PainelProfissionaisCardVm = {
  total: number | null;
  maiorFaturamentoLabel: string | null;
  maiorComissaoLabel: string | null;
  maisAtendimentosLabel: string | null;
  spark: PainelSparkPoint[];
};

export type PainelEstoqueCardVm = {
  total: number | null;
  criticos: number | null;
  maisVendidosLabel: string | null;
  alertaBaixo: number | null;
  spark: PainelSparkPoint[];
};

export type PainelProfissionalRankingLinha = {
  rank: number;
  nome: string;
  servicos: number;
  valorMedio: number | null;
};

/** Ranking de profissionais na seção «Análise do período». */
export type PainelProfissionaisPeriodoVm = {
  totalAtendimentos: number;
  vsAnteriorPct: number | null;
  spark: PainelSparkPoint[];
  linhas: PainelProfissionalRankingLinha[];
};

/** Ticket médio de comandas faturadas no período. */
export type PainelTicketMedioVm = {
  ticketAtual: number | null;
  vsAnteriorPct: number | null;
  periodoAnterior: number | null;
  periodoAtual: number | null;
};

export type PainelVendasCategoriaLinha = {
  label: string;
  valor: number;
  pct: number;
  cor: string;
};

/** Vendas por categoria (comandas faturadas no período). */
export type PainelVendasCategoriaVm = {
  total: number;
  linhas: PainelVendasCategoriaLinha[];
};

/** Séries dos painéis de gráfico (vazias até API). */
export type PainelChartsVm = {
  tendencia: PainelChartPoint[];
  status: PainelChartPoint[];
  funil: PainelChartPoint[];
  heatmap: PainelChartPoint[];
};

/** VMs vazias — estrutura pronta sem dados fictícios. */
export function emptyFaturamentoCardVm(): PainelFaturamentoCardVm {
  return {
    total: null,
    despesas: null,
    lucro: null,
    qtdVendas: null,
    ticketMedio: null,
    vsOntemPct: null,
    metodos: [],
    spark: [],
  };
}

export function emptyAgendaCardVm(): PainelAgendaCardVm {
  return {
    total: null,
    proximos: [],
    spark: [],
  };
}

export function emptyClientesCardVm(): PainelClientesCardVm {
  return {
    total: null,
    aniversariosHoje: null,
    novosSemana: null,
    inativos: null,
    spark: [],
  };
}

export function emptyProfissionaisCardVm(): PainelProfissionaisCardVm {
  return {
    total: null,
    maiorFaturamentoLabel: null,
    maiorComissaoLabel: null,
    maisAtendimentosLabel: null,
    spark: [],
  };
}

export function emptyEstoqueCardVm(): PainelEstoqueCardVm {
  return {
    total: null,
    criticos: null,
    maisVendidosLabel: null,
    alertaBaixo: null,
    spark: [],
  };
}

export function emptyChartsVm(): PainelChartsVm {
  return {
    tendencia: [],
    status: [],
    funil: [],
    heatmap: [],
  };
}

export function emptyTicketMedioVm(): PainelTicketMedioVm {
  return {
    ticketAtual: null,
    vsAnteriorPct: null,
    periodoAnterior: null,
    periodoAtual: null,
  };
}

export function emptyProfissionaisPeriodoVm(): PainelProfissionaisPeriodoVm {
  return {
    totalAtendimentos: 0,
    vsAnteriorPct: null,
    spark: [],
    linhas: [],
  };
}

export function emptyVendasCategoriaVm(): PainelVendasCategoriaVm {
  return {
    total: 0,
    linhas: [],
  };
}
