/** Só dígitos (para validar comprimento). */
export function telefoneBrDigitos(valor: string | null | undefined): string {
  return String(valor ?? '').replace(/\D/g, '');
}

/** Celular BR: exatamente 11 dígitos (DDD + 9). */
export function isCelularBr11Digitos(valor: string | null | undefined): boolean {
  return telefoneBrDigitos(valor).length === 11;
}
