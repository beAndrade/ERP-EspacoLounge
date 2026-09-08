/** Limite alinhado ao drawer de cliente (data URL JPEG comprimido). */
export const FOTO_DATA_URL_MAX_CHARS = 520_000;

export function parseFotoUrlInput(v: unknown): string | null | undefined {
  if (v === undefined) return undefined;
  if (v === null) return null;
  const s = String(v).trim();
  if (!s) return null;
  if (s.length > FOTO_DATA_URL_MAX_CHARS) {
    throw new Error('Foto grande demais; use uma imagem menor.');
  }
  if (
    s.startsWith('data:image/') ||
    s.startsWith('http://') ||
    s.startsWith('https://')
  ) {
    return s;
  }
  throw new Error('Formato de foto inválido.');
}
