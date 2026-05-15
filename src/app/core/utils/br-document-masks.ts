/** Só dígitos, limitado. */
export function digitosMax(input: string, max: number): string {
  return String(input ?? '')
    .replace(/\D/g, '')
    .slice(0, max);
}

/** DD/MM/AAAA enquanto digita (8 dígitos). */
export function formatarDataDdMmYyyy(input: string): string {
  const d = digitosMax(input, 8);
  if (d.length <= 2) return d;
  if (d.length <= 4) return `${d.slice(0, 2)}/${d.slice(2)}`;
  return `${d.slice(0, 2)}/${d.slice(2, 4)}/${d.slice(4)}`;
}

/** CPF: 000.000.000-00 */
export function formatarCpfBr(input: string): string {
  const d = digitosMax(input, 11);
  if (d.length <= 3) return d;
  if (d.length <= 6) return `${d.slice(0, 3)}.${d.slice(3)}`;
  if (d.length <= 9)
    return `${d.slice(0, 3)}.${d.slice(3, 6)}.${d.slice(6)}`;
  return `${d.slice(0, 3)}.${d.slice(3, 6)}.${d.slice(6, 9)}-${d.slice(9)}`;
}

/** CNPJ: 00.000.000/0000-00 */
export function formatarCnpjBr(input: string): string {
  const d = digitosMax(input, 14);
  if (d.length <= 2) return d;
  if (d.length <= 5) return `${d.slice(0, 2)}.${d.slice(2)}`;
  if (d.length <= 8)
    return `${d.slice(0, 2)}.${d.slice(2, 5)}.${d.slice(5)}`;
  if (d.length <= 12)
    return `${d.slice(0, 2)}.${d.slice(2, 5)}.${d.slice(5, 8)}/${d.slice(8)}`;
  return `${d.slice(0, 2)}.${d.slice(2, 5)}.${d.slice(5, 8)}/${d.slice(8, 12)}-${d.slice(12)}`;
}

/** RG (9 dígitos): 00.000.000-0 */
export function formatarRgBr9(input: string): string {
  const d = digitosMax(input, 9);
  if (d.length <= 2) return d;
  if (d.length <= 5) return `${d.slice(0, 2)}.${d.slice(2)}`;
  if (d.length <= 8)
    return `${d.slice(0, 2)}.${d.slice(2, 5)}.${d.slice(5)}`;
  return `${d.slice(0, 2)}.${d.slice(2, 5)}.${d.slice(5, 8)}-${d.slice(8)}`;
}

/** Valida data com 8 dígitos DDMMAAAA (calendário). */
export function dataDdMmYyyyValida(d8: string): boolean {
  if (!/^\d{8}$/.test(d8)) return false;
  const dd = parseInt(d8.slice(0, 2), 10);
  const mm = parseInt(d8.slice(2, 4), 10);
  const yyyy = parseInt(d8.slice(4, 8), 10);
  if (mm < 1 || mm > 12 || dd < 1 || dd > 31) return false;
  if (yyyy < 1900 || yyyy > 2100) return false;
  const dt = new Date(yyyy, mm - 1, dd);
  return (
    dt.getFullYear() === yyyy &&
    dt.getMonth() === mm - 1 &&
    dt.getDate() === dd
  );
}

/** E-mail simples e pragmático. */
export function emailBrValido(s: string): boolean {
  const t = s.trim();
  if (!t) return true;
  return /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/i.test(t);
}
