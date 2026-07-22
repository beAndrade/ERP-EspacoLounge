/**
 * Texto monetário canónico para colunas `text` no Postgres (catálogo, legado).
 * Formato: `R$ 1.234,56` (espaço ASCII, vírgula decimal pt-BR).
 * Aceita `R$ 10.00`, NBSP, `-`, etc. na entrada.
 */
import { toNumberPt } from '../services/finance-domain';

export function normalizeMoneyTextForDb(v: unknown): string | null {
  if (v == null) return null;
  const raw = String(v).trim();
  if (!raw || raw === '-' || raw === '—') return null;
  const n = toNumberPt(raw);
  if (n == null || !Number.isFinite(n)) return null;
  if (n === 0) return null;
  const sign = n < 0 ? '-' : '';
  const formatted = Math.abs(n).toLocaleString('pt-BR', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
  return `${sign}R$ ${formatted}`;
}
