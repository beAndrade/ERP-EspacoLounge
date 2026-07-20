/** Máscara de valor por dígitos (centavos em cadeia), padrão do ERP. */

export function formataMoedaBrl(n: number): string {
  return new Intl.NumberFormat('pt-BR', {
    style: 'currency',
    currency: 'BRL',
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(n);
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

/** Reformata texto legado/API para máscara BRL; vazio fica vazio. */
export function normalizarMoedaExibicao(v: unknown): string {
  const s = String(v ?? '').trim();
  if (!s) return '';
  const digits = s.replace(/\D/g, '');
  if (!digits || /^0+$/.test(digits)) return '';
  return moedaAPartirDosDigitos(s);
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
