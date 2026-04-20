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

/** Só dígitos (para validar comprimento). */
export function telefoneBrDigitos(valor: string | null | undefined): string {
  return String(valor ?? '').replace(/\D/g, '');
}

/** Telefone BR completo: DDD + 8 (fixo) ou 9 (celular) dígitos locais. */
export function isTelefoneBrCompleto(valor: string | null | undefined): boolean {
  const n = telefoneBrDigitos(valor).length;
  return n === 10 || n === 11;
}

/** Celular BR: exatamente 11 dígitos (DDD + 9), formato usual em cadastros. */
export function isCelularBr11Digitos(valor: string | null | undefined): boolean {
  return telefoneBrDigitos(valor).length === 11;
}
