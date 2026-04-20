/** Máximo de dígitos: DDD (2) + local (8 fixo ou 9 celular). */
const MAX_DIGITOS = 11;

/**
 * Formata progressivamente no padrão brasileiro:
 * - 10 dígitos: `(00) 0000-0000`
 * - 11 dígitos: `(00) 00000-0000`
 */
export function formatarTelefoneBr(digitos: string): string {
  const d = digitos.replace(/\D/g, '').slice(0, MAX_DIGITOS);
  if (!d) return '';
  if (d.length <= 2) return `(${d}`;
  const dd = d.slice(0, 2);
  const loc = d.slice(2);
  if (loc.length <= 4) return `(${dd}) ${loc}`;
  if (d.length <= 10) {
    return `(${dd}) ${loc.slice(0, 4)}-${loc.slice(4)}`;
  }
  return `(${dd}) ${loc.slice(0, 5)}-${loc.slice(5)}`;
}

/** Normaliza valor vindo da API ou livre para só dígitos e formata. */
export function formatarTelefoneBrDeValor(valor: string | null | undefined): string {
  return formatarTelefoneBr(String(valor ?? ''));
}
