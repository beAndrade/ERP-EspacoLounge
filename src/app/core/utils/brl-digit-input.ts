/** Máscara de valor por dígitos (centavos em cadeia), padrão do ERP. */

import { valorMonetarioParaNumero } from './atendimento-display';

/**
 * Formato canónico de moeda no UI e em colunas `text` gravadas pelo front:
 * `R$ 1.234,56` (espaço ASCII, vírgula decimal). Evita NBSP do `style: currency`.
 */
export function formataMoedaBrl(n: number): string {
  if (!Number.isFinite(n)) n = 0;
  const sign = n < 0 ? '-' : '';
  const formatted = Math.abs(n).toLocaleString('pt-BR', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
  return `${sign}R$ ${formatted}`;
}

/** Ex.: digitar 150 → `R$ 1,50`. */
export function moedaAPartirDosDigitos(raw: string, maxDigits = 12): string {
  const digits = String(raw ?? '').replace(/\D/g, '');
  const trimmed =
    digits.length > maxDigits ? digits.slice(-maxDigits) : digits;
  const centInt =
    trimmed === '' ? 0 : Math.min(parseInt(trimmed, 10), 999999999999);
  const n =
    Number.isFinite(centInt) && centInt >= 0 ? Math.round(centInt) / 100 : 0;
  return formataMoedaBrl(n);
}

/** Ex.: digitar 15 → `15 %` (inteiro, % no final). */
export function percentualAPartirDosDigitos(raw: string, maxDigits = 3): string {
  const digits = String(raw ?? '').replace(/\D/g, '');
  const trimmed =
    digits.length > maxDigits ? digits.slice(-maxDigits) : digits;
  const n =
    trimmed === '' ? 0 : Math.min(parseInt(trimmed, 10) || 0, 999);
  return `${n} %`;
}

/** Só dígitos (sem máscara) — vazio ou só zeros. */
export function valorDigitosVazio(raw: string): boolean {
  const digits = String(raw ?? '').replace(/\D/g, '');
  return !digits || /^0+$/.test(digits);
}

/**
 * Reformata texto legado/API para máscara BRL; vazio fica vazio.
 * Usa parse monetário (não cadeia de centavos) — `R$ 10.00` / `10` → `R$ 10,00`.
 */
export function normalizarMoedaExibicao(v: unknown): string {
  const s = String(v ?? '').trim();
  if (!s || s === '-' || s === '—') return '';
  const n = valorMonetarioParaNumero(s);
  if (n == null || !Number.isFinite(n) || n === 0) return '';
  return formataMoedaBrl(n);
}

/** Reformata % legado/API (aceita decimais antigos → arredonda); vazio fica vazio. */
export function normalizarPercentualExibicao(v: unknown): string {
  const s = String(v ?? '')
    .replace(/%/g, '')
    .trim();
  if (!s) return '';
  const t = s.replace(/\s/g, '').replace(/\./g, '').replace(',', '.');
  const n = parseFloat(t);
  if (!Number.isFinite(n) || n <= 0) return '';
  return percentualAPartirDosDigitos(String(Math.round(n)));
}

/** Texto a gravar na API a partir do campo mascarado (null se zero/vazio). */
export function moedaParaPayload(raw: string): string | null {
  if (valorDigitosVazio(raw)) return null;
  return moedaAPartirDosDigitos(raw);
}

export function percentualParaPayload(raw: string): string | null {
  if (valorDigitosVazio(raw)) return null;
  const digits = String(raw ?? '').replace(/\D/g, '');
  const n = parseInt(digits, 10);
  if (!Number.isFinite(n) || n <= 0) return null;
  return String(n);
}
