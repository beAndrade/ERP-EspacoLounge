/**
 * Move o host do drawer para `document.body` para `position: fixed` cobrir o viewport
 * (evita recorte/empilhamento por `.shell` / `app-root` com overflow).
 */
export function portalHostElementToBody(host: HTMLElement): () => void {
  const parent = host.parentElement;
  const next = host.nextSibling;
  document.body.appendChild(host);
  return () => {
    if (!parent) return;
    if (next && next.parentNode === parent) {
      parent.insertBefore(host, next);
    } else {
      parent.appendChild(host);
    }
  };
}
