/** URL de foto de profissional (API devolve `foto_url`). */
export function profissionalFotoUrl(
  p: { fotoUrl?: string | null; foto_url?: string | null } | null | undefined,
): string | null {
  const u = (p?.fotoUrl ?? p?.foto_url ?? '').trim();
  return u || null;
}
