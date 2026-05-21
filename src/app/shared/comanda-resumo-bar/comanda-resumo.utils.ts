/** Máscara e formatação pt-BR para campos do resumo da comanda. */

export const PLACEHOLDER_MOEDA_RESUMO = 'R$0,00';

export function formataMoedaBrlResumo(n: number): string {
  return new Intl.NumberFormat('pt-BR', {
    style: 'currency',
    currency: 'BRL',
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(n);
}

/** Entrada por dígitos (centavos em cadeia), ex.: 150 → R$ 1,50. */
export function moedaResumoAPartirDosDigitos(raw: string): string {
  const digits = String(raw ?? '').replace(/\D/g, '');
  const MAX_DIG = 12;
  const trimmed = digits.length > MAX_DIG ? digits.slice(-MAX_DIG) : digits;
  const centInt =
    trimmed === '' ? 0 : Math.min(parseInt(trimmed, 10), 999999999999);
  const n =
    Number.isFinite(centInt) && centInt >= 0 ? Math.round(centInt) / 100 : 0;
  return formataMoedaBrlResumo(n);
}
