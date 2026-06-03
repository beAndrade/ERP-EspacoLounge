/** Taxa de gateway em reais (percentual + fixa), alinhado à API. */
export function calcularTaxaReais(
  bruto: number,
  taxaPct: number,
  taxaFixa: number,
): number {
  const b = Number.isFinite(bruto) ? bruto : 0;
  const pctPart = (b * taxaPct) / 100;
  const total = pctPart + taxaFixa;
  return Math.round(total * 100) / 100;
}

/** Valor líquido de receita após taxas da forma de pagamento. */
export function calcularValorLiquidoReceita(
  bruto: number,
  taxaPct: number,
  taxaFixa: number,
): number {
  const taxaReais = calcularTaxaReais(bruto, taxaPct, taxaFixa);
  return Math.max(0, Math.round((bruto - taxaReais) * 100) / 100);
}
