/**
 * Texto percentual canónico para colunas `text` no Postgres (catálogo).
 * Formato: `40%` (inteiro, sem espaço antes do %).
 * Aceita `40`, `40%`, `40 %`, `40,5`, `40.5`, etc. na entrada.
 */
export function normalizePercentTextForDb(v: unknown): string | null {
  if (v == null) return null;
  const raw = String(v).trim();
  if (!raw || raw === '-' || raw === '—') return null;
  let cleaned = raw.replace(/%/g, '').replace(/\s/g, '');
  if (!cleaned) return null;
  if (cleaned.includes(',')) {
    // pt-BR: ponto = milhar, vírgula = decimal
    cleaned = cleaned.replace(/\./g, '').replace(',', '.');
  } else if (/^[0-9]+\.[0-9]+$/.test(cleaned)) {
    // decimal US simples (ex.: 40.5)
    // já está ok para parseFloat
  } else {
    // remove pontos de milhar (ex.: 1.040)
    cleaned = cleaned.replace(/\./g, '');
  }
  const n = parseFloat(cleaned);
  if (!Number.isFinite(n) || n <= 0) return null;
  const rounded = Math.round(n);
  if (rounded <= 0) return null;
  return `${rounded}%`;
}
