/**
 * Normaliza o valor de comissão para gravar em `atendimentos.comissao` (texto):
 * sempre decimal com **ponto** e **2 casas** (ex.: `"24.50"`, `"20.00"`), sem `R$`,
 * para agregações SQL (`::numeric`) e consistência entre linhas.
 * Vazio quando não há valor numérico ou o valor é zero.
 */
export function normalizeComissaoParaBD(v: unknown): string {
  if (v === '' || v == null) return '';
  let n: number | null;
  if (typeof v === 'number') {
    if (!Number.isFinite(v)) return '';
    n = v;
  } else {
    let t = String(v)
      .replace(/R\$/gi, '')
      .replace(/\u00a0/g, ' ')
      .replace(/\s/g, '')
      .trim();
    if (!t) return '';
    if (t.includes(',')) {
      t = t.replace(/\./g, '').replace(',', '.');
    }
    const parsed = parseFloat(t.replace(/[^\d.-]/g, ''));
    n = Number.isNaN(parsed) ? null : parsed;
  }
  if (n === null || n === 0) return '';
  const r = Math.round(n * 100) / 100;
  if (r === 0) return '';
  return r.toFixed(2);
}
