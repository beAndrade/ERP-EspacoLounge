import { telefoneBrDigitos } from './telefone-br';

/** Dígitos E.164 para wa.me / api.whatsapp.com (BR: prefixo 55). */
export function telefoneWhatsappInternacional(
  valor: string | null | undefined,
): string {
  const d = telefoneBrDigitos(valor);
  if (!d) return '';
  if (d.startsWith('55') && d.length >= 12) return d;
  return `55${d}`;
}

/** URL oficial do WhatsApp Web/App com destinatário e texto pré-preenchido. */
export function buildWhatsappSendUrl(
  telefone: string,
  texto: string,
): string {
  const phone = telefoneWhatsappInternacional(telefone);
  const text = encodeURIComponent(texto.trim());
  return `https://api.whatsapp.com/send?phone=${phone}&text=${text}`;
}

export function abrirWhatsappSendUrl(url: string): void {
  window.open(url, '_blank', 'noopener,noreferrer');
}

/**
 * Abre nova aba no gesto do utilizador e navega para o WhatsApp quando a URL estiver pronta
 * (evita bloqueio de pop-up após pedidos HTTP).
 */
export function abrirWhatsappSendUrlAposPreparar(
  prepararUrl: () => Promise<string>,
  onError?: (err: unknown) => void,
): void {
  const popup = window.open('about:blank', '_blank', 'noopener,noreferrer');
  void prepararUrl()
    .then((url) => {
      if (popup && !popup.closed) {
        popup.location.href = url;
        return;
      }
      abrirWhatsappSendUrl(url);
    })
    .catch((err) => {
      popup?.close();
      onError?.(err);
    });
}
