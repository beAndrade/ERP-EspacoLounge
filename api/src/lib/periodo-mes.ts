/**
 * Normaliza texto de mês vindo da planilha (ex.: "04/2026", "4/2026") para `YYYY-MM`.
 */
export function mesTextoParaYyyyMm(
  raw: string | null | undefined,
): string | null {
  const s = String(raw ?? '').trim();
  if (!s) return null;
  const m = /^(\d{1,2})\/(\d{4})$/.exec(s);
  if (!m) return null;
  const mm = Math.min(12, Math.max(1, parseInt(m[1], 10)));
  const yyyy = m[2];
  if (!/^\d{4}$/.test(yyyy)) return null;
  return `${yyyy}-${String(mm).padStart(2, '0')}`;
}
