/** Máscara e formatação pt-BR para campos do resumo da comanda. */

import {
  formataMoedaBrl,
  moedaAPartirDosDigitos,
} from '../../core/utils/brl-digit-input';

export const PLACEHOLDER_MOEDA_RESUMO = 'R$ 0,00';

export function formataMoedaBrlResumo(n: number): string {
  return formataMoedaBrl(n);
}

/** Entrada por dígitos (centavos em cadeia), ex.: 150 → R$ 1,50. */
export function moedaResumoAPartirDosDigitos(raw: string): string {
  return moedaAPartirDosDigitos(raw);
}
