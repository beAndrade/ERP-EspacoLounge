/**
 * Decide se um dropdown deve abrir para cima ou para baixo,
 * conforme o espaço livre na viewport (e opcionalmente no clip do ancestral).
 */
export type DropdownVerticalPlacement = 'above' | 'below';

export type ResolveDropdownVerticalOpts = {
  /** Distância entre âncora e painel (px). Default 4. */
  gap?: number;
  /** Margem mínima das bordas da viewport (px). Default 8. */
  viewportPadding?: number;
  /**
   * Retângulo do ancestral com overflow (drawer/scroll).
   * Espaço útil = interseção com a viewport.
   */
  clipRect?: Pick<DOMRect, 'top' | 'bottom' | 'left' | 'right'>;
};

/** Sobe o DOM até achar overflow que clipa (auto/scroll/hidden/clip). */
export function findOverflowClipAncestor(
  el: HTMLElement | null,
): HTMLElement | null {
  let cur = el?.parentElement ?? null;
  while (cur && cur !== document.documentElement) {
    const st = getComputedStyle(cur);
    const oy = st.overflowY;
    const ox = st.overflowX;
    const o = st.overflow;
    if (
      /(auto|scroll|hidden|clip)/.test(oy) ||
      /(auto|scroll|hidden|clip)/.test(ox) ||
      /(auto|scroll|hidden|clip)/.test(o)
    ) {
      return cur;
    }
    cur = cur.parentElement;
  }
  return null;
}

/**
 * Ancestral com scroll real (auto/scroll). Ignora `overflow: hidden` de
 * cantos arredondados — esses caixas curtas quebravam o cálculo de espaço
 * e faziam o painel cobrir o trigger (1.º clique fechava em vez de selecionar).
 */
export function findScrollClipAncestor(
  el: HTMLElement | null,
): HTMLElement | null {
  let cur = el?.parentElement ?? null;
  while (cur && cur !== document.documentElement) {
    const st = getComputedStyle(cur);
    const oy = st.overflowY;
    const ox = st.overflowX;
    if (/(auto|scroll)/.test(oy) || /(auto|scroll)/.test(ox)) {
      return cur;
    }
    cur = cur.parentElement;
  }
  return null;
}

/**
 * Prefere abrir para baixo quando houver espaço útil; senão para cima.
 * Não exige caber a altura inteira — o painel pode rolar.
 */
export function resolveDropdownVerticalPlacement(
  anchor: Pick<DOMRect, 'top' | 'bottom'>,
  panelHeight: number,
  opts?: ResolveDropdownVerticalOpts,
): DropdownVerticalPlacement {
  const gap = opts?.gap ?? 4;
  const pad = opts?.viewportPadding ?? 8;
  const vh =
    typeof window !== 'undefined' ? window.innerHeight : panelHeight * 2;
  const clipTop = opts?.clipRect?.top ?? 0;
  const clipBottom = opts?.clipRect?.bottom ?? vh;
  const topBound = Math.max(pad, clipTop);
  const bottomBound = Math.min(vh - pad, clipBottom);
  const h = Math.max(0, panelHeight);
  const spaceBelow = bottomBound - anchor.bottom - gap;
  const spaceAbove = anchor.top - topBound - gap;
  /** Painel mínimo utilizável antes de preferir flip. */
  const minUseful = Math.min(Math.max(h, 1), 120);

  if (spaceBelow >= minUseful) return 'below';
  if (spaceAbove >= h && spaceAbove > spaceBelow) return 'above';
  if (spaceBelow >= spaceAbove) return 'below';
  return 'above';
}

/** Espaço disponível abaixo/acima do âncora (px), com clip opcional. */
export function dropdownAvailableSpace(
  anchor: Pick<DOMRect, 'top' | 'bottom'>,
  opts?: ResolveDropdownVerticalOpts,
): { below: number; above: number } {
  const gap = opts?.gap ?? 4;
  const pad = opts?.viewportPadding ?? 8;
  const vh =
    typeof window !== 'undefined' ? window.innerHeight : 800;
  const clipTop = opts?.clipRect?.top ?? 0;
  const clipBottom = opts?.clipRect?.bottom ?? vh;
  const topBound = Math.max(pad, clipTop);
  const bottomBound = Math.min(vh - pad, clipBottom);
  return {
    below: Math.max(0, bottomBound - anchor.bottom - gap),
    above: Math.max(0, anchor.top - topBound - gap),
  };
}

/**
 * Ancestral que vira containing block de `position: fixed`
 * (`transform`, `filter`, etc.). Coordenadas fixed precisam subtrair a origem dele.
 */
export function fixedContainingBlockOrigin(
  el: HTMLElement | null,
): { top: number; left: number } {
  let cur = el?.parentElement ?? null;
  while (cur && cur !== document.documentElement && cur !== document.body) {
    const st = getComputedStyle(cur);
    const will = st.willChange
      .split(',')
      .some((p) => /transform|filter|perspective|contain/.test(p.trim()));
    const creates =
      (st.transform && st.transform !== 'none') ||
      (st.filter && st.filter !== 'none') ||
      (st.perspective && st.perspective !== 'none') ||
      (st.backdropFilter && st.backdropFilter !== 'none') ||
      will ||
      /(paint|layout|strict|content)/.test(st.contain);
    if (creates) {
      const r = cur.getBoundingClientRect();
      return { top: r.top, left: r.left };
    }
    cur = cur.parentElement;
  }
  return { top: 0, left: 0 };
}

/** Classes CSS usadas pela diretiva e pelos shells de lista. */
export const DROPDOWN_FLIP_ABOVE_CLASS = 'dropdown-flip--above';
export const DROPDOWN_FLIP_BELOW_CLASS = 'dropdown-flip--below';

/**
 * Aplica as classes de flip num painel absoluto (pai = âncora, em geral).
 * Retorna a posição escolhida.
 */
export function applyDropdownFlipClasses(
  panel: HTMLElement,
  anchor: HTMLElement = panel.parentElement!,
  opts?: ResolveDropdownVerticalOpts & { estimatedHeight?: number },
): DropdownVerticalPlacement {
  const estimated = opts?.estimatedHeight ?? 0;
  const measured = panel.offsetHeight || panel.scrollHeight || 0;
  const h = measured > 0 ? measured : Math.max(estimated, 80);
  /** Só scroll real — evita clipRect minúsculo de overflow:hidden. */
  const clipEl = findScrollClipAncestor(anchor);
  const clipRect = clipEl?.getBoundingClientRect();
  const placement = resolveDropdownVerticalPlacement(
    anchor.getBoundingClientRect(),
    h,
    { ...opts, clipRect },
  );
  panel.classList.toggle(DROPDOWN_FLIP_ABOVE_CLASS, placement === 'above');
  panel.classList.toggle(DROPDOWN_FLIP_BELOW_CLASS, placement === 'below');
  return placement;
}
