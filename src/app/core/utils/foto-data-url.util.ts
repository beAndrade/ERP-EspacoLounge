/** Limite alinhado à API (`foto_url` em data URL JPEG comprimido). */
export const FOTO_DATA_URL_MAX_CHARS = 520_000;

export function fotoDataUrlValidaParaEnvio(raw: string): boolean {
  const t = raw.trim();
  if (!t) return false;
  return (
    t.startsWith('data:image/') &&
    t.length <= FOTO_DATA_URL_MAX_CHARS
  );
}

export function comprimirImagemParaDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file);
    const img = new Image();
    img.onload = () => {
      URL.revokeObjectURL(url);
      const maxSide = 480;
      let { width, height } = img;
      if (width > maxSide || height > maxSide) {
        const ratio = Math.min(maxSide / width, maxSide / height);
        width = Math.max(1, Math.round(width * ratio));
        height = Math.max(1, Math.round(height * ratio));
      }
      const canvas = document.createElement('canvas');
      canvas.width = width;
      canvas.height = height;
      const ctx = canvas.getContext('2d');
      if (!ctx) {
        reject(new Error('canvas'));
        return;
      }
      ctx.drawImage(img, 0, 0, width, height);
      let quality = 0.86;
      let dataUrl = canvas.toDataURL('image/jpeg', quality);
      while (
        dataUrl.length > FOTO_DATA_URL_MAX_CHARS &&
        quality > 0.45
      ) {
        quality -= 0.08;
        dataUrl = canvas.toDataURL('image/jpeg', quality);
      }
      if (dataUrl.length > FOTO_DATA_URL_MAX_CHARS) {
        reject(new Error('too_large'));
        return;
      }
      resolve(dataUrl);
    };
    img.onerror = () => {
      URL.revokeObjectURL(url);
      reject(new Error('load'));
    };
    img.src = url;
  });
}
