import type { FrequenciaRepetirAgendamento } from './agenda-repetir-cascade.models';

function parseYmd(ymd: string): { y: number; m: number; d: number } | null {
  const s = ymd.trim();
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(s);
  if (!m) return null;
  const y = parseInt(m[1], 10);
  const mo = parseInt(m[2], 10);
  const d = parseInt(m[3], 10);
  if (mo < 1 || mo > 12) return null;
  const t = new Date(y, mo - 1, d);
  if (
    t.getFullYear() !== y ||
    t.getMonth() !== mo - 1 ||
    t.getDate() !== d
  ) {
    return null;
  }
  return { y, m: mo, d };
}

function toYmd(t: Date): string {
  const y = t.getFullYear();
  const mo = String(t.getMonth() + 1).padStart(2, '0');
  const d = String(t.getDate()).padStart(2, '0');
  return `${y}-${mo}-${d}`;
}

function addDiasCivil(ymd: string, delta: number): string {
  const p = parseYmd(ymd);
  if (!p) return ymd;
  const t = new Date(p.y, p.m - 1, p.d);
  t.setDate(t.getDate() + delta);
  return toYmd(t);
}

function addMesesCivil(ymd: string, deltaMes: number): string {
  const p = parseYmd(ymd);
  if (!p) return ymd;
  const t = new Date(p.y, p.m - 1 + deltaMes, p.d);
  return toYmd(t);
}

function avancarUmaVez(
  ymd: string,
  freq: FrequenciaRepetirAgendamento,
): string {
  switch (freq) {
    case 'diario':
      return addDiasCivil(ymd, 1);
    case 'semanal':
      return addDiasCivil(ymd, 7);
    case 'duas_semanas':
      return addDiasCivil(ymd, 14);
    case 'um_mes':
      return addMesesCivil(ymd, 1);
    case 'dois_meses':
      return addMesesCivil(ymd, 2);
  }
}

/**
 * Data da k-ésima repetição (k ≥ 1 = primeira após a data base).
 * Ex.: k=1 → uma vez a frequência após a base; k=2 → duas vezes, etc.
 */
function dataAposKPassos(
  dataBaseYmd: string,
  freq: FrequenciaRepetirAgendamento,
  k: number,
): string {
  let cur = dataBaseYmd;
  for (let i = 0; i < k; i++) {
    cur = avancarUmaVez(cur, freq);
  }
  return cur;
}

/** 1 (base) + `vezes` ocorrências extra; `vezes` 0 = só a base. */
export function expandirDatasRepeticao(
  dataBaseYmd: string,
  vezes: number,
  frequencia: FrequenciaRepetirAgendamento,
): string[] {
  const b = dataBaseYmd.trim();
  const n = Math.min(60, Math.max(0, Math.floor(vezes)));
  if (n <= 0) return [b];
  const out: string[] = [b];
  for (let k = 1; k <= n; k++) {
    out.push(dataAposKPassos(b, frequencia, k));
  }
  return out;
}
