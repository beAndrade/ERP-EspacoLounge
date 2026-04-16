/**
 * Data/hora **naive** (relógio do salão), sem timezone e sem sufixo `Z`.
 * Formato canónico: `YYYY-MM-DD HH:mm:ss`.
 *
 * Aritmética: sempre **America/Sao_Paulo** (UTC−3 fixo), não o TZ do processo Node.
 */

export const SALAO_TIMEZONE = 'America/Sao_Paulo' as const;
const SALAO_ISO_OFFSET = '-03:00';

const SQL_LOCAL_RE =
  /^(\d{4})-(\d{2})-(\d{2})[ T](\d{1,2}):(\d{2})(?::(\d{2})(?:\.\d+)?)?$/;

export function pad2(n: number): string {
  return String(Math.trunc(n)).padStart(2, '0');
}

export type SqlLocalParts = {
  y: number;
  mo: number;
  d: number;
  hh: number;
  mm: number;
  ss: number;
};

export function parseSqlLocalDateTime(s: string): SqlLocalParts | null {
  let t = String(s ?? '').trim();
  if (!t) return null;
  /** Colapsa separador data/hora (igual ao frontend) para o regex aceitar `…  10:00`. */
  t = t.replace(/^(\d{4}-\d{2}-\d{2})[\sT]+/, '$1 ');
  const m = SQL_LOCAL_RE.exec(t);
  if (!m) return null;
  const y = parseInt(m[1], 10);
  const mo = parseInt(m[2], 10);
  const d = parseInt(m[3], 10);
  const hh = parseInt(m[4], 10);
  const mm = parseInt(m[5], 10);
  const ss = m[6] != null ? parseInt(m[6], 10) : 0;
  if (![y, mo, d, hh, mm, ss].every(Number.isFinite)) return null;
  if (mo < 1 || mo > 12 || d < 1 || d > 31) return null;
  if (hh > 23 || mm > 59 || ss > 59) return null;
  return { y, mo, d, hh, mm, ss };
}

/**
 * Interpreta texto vindo do cliente/BD: SQL local canónico ou ISO com fuso.
 */
export function partesSqlLocalDeTextoSalao(
  raw: string | null | undefined,
): SqlLocalParts | null {
  const t = raw == null ? '' : String(raw).trim();
  if (!t) return null;
  const p0 = parseSqlLocalDateTime(t);
  if (p0) return p0;
  const isoLoc = isoInstantParaSqlLocalBrasil(t);
  return isoLoc ? parseSqlLocalDateTime(isoLoc) : null;
}

export function formatSqlLocalDateTime(p: SqlLocalParts): string {
  return `${p.y}-${pad2(p.mo)}-${pad2(p.d)} ${pad2(p.hh)}:${pad2(p.mm)}:${pad2(p.ss)}`;
}

export function ymdOfParts(p: SqlLocalParts): string {
  return `${p.y}-${pad2(p.mo)}-${pad2(p.d)}`;
}

export function civilNaiveSalaoParaUtcMs(p: SqlLocalParts): number {
  const iso = `${p.y}-${pad2(p.mo)}-${pad2(p.d)}T${pad2(p.hh)}:${pad2(p.mm)}:${pad2(p.ss)}${SALAO_ISO_OFFSET}`;
  return Date.parse(iso);
}

export function utcMsParaPartesSalao(ms: number): SqlLocalParts | null {
  if (!Number.isFinite(ms)) return null;
  const f = new Intl.DateTimeFormat('en-CA', {
    timeZone: SALAO_TIMEZONE,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hour12: false,
  });
  const parts = f.formatToParts(new Date(ms));
  const g = (t: Intl.DateTimeFormatPartTypes) =>
    parts.find((x) => x.type === t)?.value ?? '';
  const y = parseInt(g('year'), 10);
  const mo = parseInt(g('month'), 10);
  const d = parseInt(g('day'), 10);
  const hh = parseInt(g('hour'), 10);
  const mm = parseInt(g('minute'), 10);
  const ss = parseInt(g('second') || '0', 10);
  if (![y, mo, d, hh, mm, ss].every(Number.isFinite)) return null;
  return { y, mo, d, hh, mm, ss };
}

export function addMinutesToParts(
  p: SqlLocalParts,
  deltaMin: number,
): SqlLocalParts {
  const ms = civilNaiveSalaoParaUtcMs(p) + deltaMin * 60000;
  return utcMsParaPartesSalao(ms) ?? p;
}

export function normalizeSqlLocalString(raw: unknown): string | null {
  if (raw == null || raw === '') return null;
  const p = parseSqlLocalDateTime(String(raw));
  return p ? formatSqlLocalDateTime(p) : null;
}

/** `Date` (instante JS) → relógio de Brasília como string naive. */
export function instantEmDateParaSqlLocalBrasil(d: Date): string | null {
  if (Number.isNaN(d.getTime())) return null;
  const p = utcMsParaPartesSalao(d.getTime());
  return p ? formatSqlLocalDateTime(p) : null;
}

/** ISO 8601 (incl. `Z`) → string naive em América/São_Paulo (compat. legado). */
export function isoInstantParaSqlLocalBrasil(iso: string): string | null {
  const d = new Date(String(iso).trim());
  if (Number.isNaN(d.getTime())) return null;
  return instantEmDateParaSqlLocalBrasil(d);
}
