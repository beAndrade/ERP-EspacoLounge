/**
 * Horário do salão: valores **naive** `YYYY-MM-DD HH:mm:ss` (sem `Z`, sem UTC).
 * Compat.: leitura de registos antigos gravados como ISO instant (`…Z`).
 */

import {
  addMinutesToParts,
  formatSqlLocalDateTime,
  minutosDesdeMeiaNoiteNoDiaAgenda,
  type SqlLocalParts,
} from './sql-local-datetime';

export const BRASILIA_IANA = 'America/Sao_Paulo' as const;

/** Em Brasília (UTC−3), meia-noite do dia civil `Y-M-D` corresponde a `Y-M-D 03:00:00` em UTC. */
function inicioDiaCivilEmUtc(dataYmd: string): number | null {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(dataYmd)) return null;
  const [y, mo, d] = dataYmd.split('-').map((x) => parseInt(x, 10));
  if (!Number.isFinite(y) || !Number.isFinite(mo) || !Number.isFinite(d)) {
    return null;
  }
  return Date.UTC(y, mo - 1, d, 3, 0, 0, 0);
}

/** Data civil `AAAA-MM-DD` em Brasília para um instante ISO legado. */
export function dataCivilBrasiliaDeIso(iso: string | null | undefined): string | null {
  if (!iso) return null;
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return null;
  const s = d.toLocaleDateString('en-CA', { timeZone: BRASILIA_IANA });
  return /^\d{4}-\d{2}-\d{2}$/.test(s) ? s : null;
}

/**
 * Minutos desde 00:00 no dia âncora `dataYmd` para `valor`:
 * — preferência: `YYYY-MM-DD HH:mm:ss` (mesmo dia que `dataYmd`);
 * — legado: instante ISO (`…Z`) com âncora em meia-noite de Brasília.
 */
export function minutosMeiaNoiteEmBrasilia(
  valor: string | null | undefined,
  dataYmd: string,
): number | null {
  if (!valor) return null;
  const s = String(valor).trim();
  const dia = (dataYmd || '').trim().slice(0, 10);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(dia)) return null;

  const naive = minutosDesdeMeiaNoiteNoDiaAgenda(s, dia);
  if (naive != null) return naive;

  const d = new Date(s);
  if (Number.isNaN(d.getTime())) return null;
  const sod = inicioDiaCivilEmUtc(dia);
  if (sod == null) return null;
  let diff = (d.getTime() - sod) / 60000;
  if (diff < 0 || diff >= 24 * 60) {
    const diaSp = dataCivilBrasiliaDeIso(s);
    if (diaSp && diaSp !== dia) {
      const sod2 = inicioDiaCivilEmUtc(diaSp);
      if (sod2 != null) diff = (d.getTime() - sod2) / 60000;
    }
  }
  if (diff < 0 || diff >= 24 * 60) return null;
  return diff;
}

/** Normaliza `10:30` ou `10:30:00` para `HH:mm`. */
export function normalizarHoraHHmm(hora: string | null | undefined): string | null {
  const t = String(hora ?? '').trim();
  const m = /^(\d{1,2}):(\d{2})(?::\d{2})?$/.exec(t);
  if (!m) return null;
  const hh = Math.min(23, Math.max(0, parseInt(m[1], 10)));
  const mm = Math.min(59, Math.max(0, parseInt(m[2], 10)));
  return `${String(hh).padStart(2, '0')}:${String(mm).padStart(2, '0')}`;
}

function partesInicioDoDia(dataYmd: string, horaHhMm: string): SqlLocalParts | null {
  const h = normalizarHoraHHmm(horaHhMm);
  if (!h || !/^\d{4}-\d{2}-\d{2}$/.test(dataYmd)) return null;
  const [hhS, mmS] = h.split(':');
  const y = parseInt(dataYmd.slice(0, 4), 10);
  const mo = parseInt(dataYmd.slice(5, 7), 10);
  const d = parseInt(dataYmd.slice(8, 10), 10);
  if (![y, mo, d].every(Number.isFinite)) return null;
  return {
    y,
    mo,
    d,
    hh: Math.min(23, Math.max(0, parseInt(hhS, 10) || 0)),
    mm: Math.min(59, Math.max(0, parseInt(mmS, 10) || 0)),
    ss: 0,
  };
}

/**
 * Início e fim do slot em string local `YYYY-MM-DD HH:mm:ss` (sem timezone).
 */
export function slotInicioFimBrasilia(
  dataYmd: string,
  horaHhMm: string,
  duracaoMinutos = 30,
): { inicio: string; fim: string } | null {
  const start = partesInicioDoDia(dataYmd, horaHhMm);
  if (!start) return null;
  const inicio = formatSqlLocalDateTime(start);
  const fimP = addMinutesToParts(start, duracaoMinutos);
  const fim = formatSqlLocalDateTime(fimP);
  return { inicio, fim };
}
