import { telefoneBrDigitos } from './telefone-br';

/** Dígitos E.164 para wa.me (BR: prefixo 55). */
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
  return `https://wa.me/${phone}?text=${text}`;
}

export function abrirWhatsappSendUrl(url: string): void {
  window.open(url, '_blank', 'noopener,noreferrer');
}

/**
 * Abre `about:blank` mantendo a referência da janela.
 * Não usar `noopener` aqui: com noopener o browser devolve `null` e a aba fica em branco para sempre.
 */
export function abrirJanelaEmBrancoParaNavegar(): Window | null {
  return window.open('about:blank', '_blank');
}

/** Navega a aba pré-aberta (ou abre uma nova se a referência se perdeu). */
export function navegarJanelaOuAbrirWhatsapp(
  popup: Window | null,
  url: string,
): void {
  if (popup && !popup.closed) {
    try {
      popup.location.href = url;
      try {
        popup.opener = null;
      } catch {
        /* ignore */
      }
      return;
    } catch {
      popup.close();
    }
  }
  abrirWhatsappSendUrl(url);
}

/**
 * Abre nova aba no gesto do usuário e navega para o WhatsApp quando a URL estiver pronta
 * (evita bloqueio de pop-up após pedidos HTTP / PDF).
 *
 * Passe `popupPreaberto` se a aba já foi aberta no clique (ex.: antes de gerar PDF).
 */
export function abrirWhatsappSendUrlAposPreparar(
  prepararUrl: () => Promise<string>,
  onError?: (err: unknown) => void,
  popupPreaberto?: Window | null,
): void {
  const popup =
    popupPreaberto && !popupPreaberto.closed
      ? popupPreaberto
      : abrirJanelaEmBrancoParaNavegar();
  void prepararUrl()
    .then((url) => navegarJanelaOuAbrirWhatsapp(popup, url))
    .catch((err) => {
      popup?.close();
      onError?.(err);
    });
}
