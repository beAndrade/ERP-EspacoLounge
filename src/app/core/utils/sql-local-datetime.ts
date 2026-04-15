/**
 * Data/hora **naive** (relógio do salão), sem timezone e sem sufixo `Z`.
 * Formato canónico: `YYYY-MM-DD HH:mm:ss`.
 *
 * Aritmética (`addMinutesToParts`, diferenças): sempre **America/Sao_Paulo**
 * (UTC−3 fixo desde 2019), não o fuso do dispositivo.
 */

/** IANA usada para ler/gravar o “relógio do salão” em cálculos. */
export const SALAO_TIMEZONE = 'America/Sao_Paulo' as const;

/** Offset canónico do salão em ISO 8601 (Brasil sem horário de verão). */
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
  const m = SQL_LOCAL_RE.exec(String(s ?? '').trim());
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

export function formatSqlLocalDateTime(p: SqlLocalParts): string {
  return `${p.y}-${pad2(p.mo)}-${pad2(p.d)} ${pad2(p.hh)}:${pad2(p.mm)}:${pad2(p.ss)}`;
}

export function ymdOfParts(p: SqlLocalParts): string {
  return `${p.y}-${pad2(p.mo)}-${pad2(p.d)}`;
}

/** Instante UTC (ms) correspondente a `p` interpretado como hora civil em São Paulo. */
export function civilNaiveSalaoParaUtcMs(p: SqlLocalParts): number {
  const iso = `${p.y}-${pad2(p.mo)}-${pad2(p.d)}T${pad2(p.hh)}:${pad2(p.mm)}:${pad2(p.ss)}${SALAO_ISO_OFFSET}`;
  return Date.parse(iso);
}

/** Componentes civis em São Paulo para um instante UTC (ms). */
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

/** Soma minutos na linha do tempo do salão (America/Sao_Paulo). */
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

export function minutosDesdeMeiaNoiteNoDiaAgenda(
  sqlLocal: string | null | undefined,
  diaAgendaYmd: string,
): number | null {
  const p = parseSqlLocalDateTime(String(sqlLocal ?? '').trim());
  if (!p) return null;
  const dia = (diaAgendaYmd || '').trim().slice(0, 10);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(dia)) return null;
  if (ymdOfParts(p) !== dia) return null;
  return p.hh * 60 + p.mm + p.ss / 60;
}

/** Diferença em minutos entre dois valores `YYYY-MM-DD HH:mm:ss` (ou legado ISO). */
export function diffMinutesEntreHorarios(
  inicio: string,
  fim: string,
): number | null {
  const a = parseSqlLocalDateTime(inicio);
  const b = parseSqlLocalDateTime(fim);
  if (a && b) {
    const ta = civilNaiveSalaoParaUtcMs(a);
    const tb = civilNaiveSalaoParaUtcMs(b);
    if (Number.isFinite(ta) && Number.isFinite(tb)) {
      return (tb - ta) / 60000;
    }
  }
  const ia = Date.parse(inicio);
  const ib = Date.parse(fim);
  if (Number.isFinite(ia) && Number.isFinite(ib)) {
    return (ib - ia) / 60000;
  }
  return null;
}
