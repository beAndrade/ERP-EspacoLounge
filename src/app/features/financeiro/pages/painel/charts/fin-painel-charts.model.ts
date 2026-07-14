/** Ponto diário do fluxo de caixa (realizado). */
export interface FluxoDiaPonto {
  ymd: string;
  label: string;
  entradas: number;
  saidas: number;
  saldoAcumulado: number;
  qtdMovimentacoes: number;
  qtdRecebimentos: number;
  qtdPagamentos: number;
  recebidoPix: number;
  recebidoCartao: number;
  recebidoDinheiro: number;
}

/** Ponto diário de vendas (atendimentos). */
export interface VendasDiaPonto {
  ymd: string;
  label: string;
  receita: number;
  qtdVendas: number;
  ticketMedio: number;
  melhorProfissional: string | null;
  servicoMaisVendido: string | null;
  acimaDaMedia: boolean;
}

export type FinChartTooltipKind = 'fluxo' | 'vendas';

export interface FluxoTooltipPayload {
  kind: 'fluxo';
  ponto: FluxoDiaPonto;
  x: number;
  y: number;
}

export interface VendasTooltipPayload {
  kind: 'vendas';
  ponto: VendasDiaPonto;
  x: number;
  y: number;
}

export type FinChartTooltipPayload = FluxoTooltipPayload | VendasTooltipPayload;

export interface FinChartLayout {
  width: number;
  height: number;
  pad: { t: number; r: number; b: number; l: number };
}

/** Barra renderizada no SVG do fluxo (entrada ou saída). */
export interface FluxoBarGeom {
  ymd: string;
  i: number;
  xEntrada: number;
  xSaida: number;
  yEntrada: number;
  ySaida: number;
  w: number;
  hEntrada: number;
  hSaida: number;
  cx: number;
}

/** Barra renderizada no SVG de vendas. */
export interface VendasBarGeom {
  ymd: string;
  i: number;
  x: number;
  y: number;
  w: number;
  h: number;
  acimaDaMedia: boolean;
}

export interface ChartPoint2D {
  x: number;
  y: number;
}
