/** Data API (AAAA-MM-DD) → dd-mm-aaaa para exibição */
export function dataDdMmAaaa(ymd: string): string {
  const s = (ymd || '').trim();
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(s);
  if (!m) return s || '—';
  return `${m[3]}-${m[2]}-${m[1]}`;
}

export function toDdMmYyyy(d: Date): string {
  const day = String(d.getDate()).padStart(2, '0');
  const mo = String(d.getMonth() + 1).padStart(2, '0');
  const y = d.getFullYear();
  return `${day}-${mo}-${y}`;
}

/** AAAA-MM-DD para pedidos à API */
export function toYmd(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

/** dd-mm-aaaa ou dd/mm/aaaa → AAAA-MM-DD */
export function parseFiltroDataDdMm(s: string): string | null {
  const t = s.trim();
  const m = /^(\d{1,2})[\/\-](\d{1,2})[\/\-](\d{4})$/.exec(t);
  if (!m) return null;
  const day = parseInt(m[1], 10);
  const month = parseInt(m[2], 10);
  const year = parseInt(m[3], 10);
  if (month < 1 || month > 12 || day < 1 || day > 31) return null;
  const d = new Date(year, month - 1, day);
  if (
    d.getFullYear() !== year ||
    d.getMonth() !== month - 1 ||
    d.getDate() !== day
  ) {
    return null;
  }
  return `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
}

/**
 * Aceita número, texto da planilha (R$, 1.234,56, vírgula decimal) e alguns formatos estranhos do Excel.
 */
export function valorMonetarioParaNumero(v: unknown): number | null {
  if (v == null || v === '') return null;
  if (typeof v === 'number') return Number.isFinite(v) ? v : null;
  if (typeof v === 'boolean') return null;

  let t = String(v).trim();
  if (!t || t === '—' || t === '-') return null;
  if (/^#(REF|N\/A|VALUE|DIV)!?$/i.test(t)) return null;

  t = t.replace(/\u00a0/g, ' ').replace(/\s+/g, ' ').trim();
  t = t
    .replace(/R\$\s*/gi, '')
    .replace(/\s*BRL\s*/gi, '')
    .replace(/[$€£]/g, '')
    .replace(/\s/g, '');

  const lastComma = t.lastIndexOf(',');
  const lastDot = t.lastIndexOf('.');
  if (lastComma >= 0 && lastComma > lastDot) {
    const intPart = t.slice(0, lastComma).replace(/\./g, '');
    const decPart = t.slice(lastComma + 1).replace(/[^\d]/g, '');
    t = decPart.length > 0 ? `${intPart}.${decPart}` : intPart;
  } else if (lastDot >= 0 && lastDot > lastComma) {
    const parts = t.split('.');
    if (parts.length > 2) {
      const dec = parts.pop() ?? '';
      t = `${parts.join('')}.${dec.replace(/[^\d]/g, '')}`;
    }
  }

  const n = parseFloat(t.replace(/[^\d.-]/g, ''));
  return Number.isFinite(n) ? n : null;
}
