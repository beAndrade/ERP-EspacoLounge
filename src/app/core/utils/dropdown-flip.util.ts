/**
 * Decide se um dropdown deve abrir para cima ou para baixo,
 * conforme o espaço livre na viewport em relação ao âncora.
 */
export type DropdownVerticalPlacement = 'above' | 'below';

export type ResolveDropdownVerticalOpts = {
  /** Distância entre âncora e painel (px). Default 4. */
  gap?: number;
  /** Margem mínima das bordas da viewport (px). Default 8. */
  viewportPadding?: number;
};

/**
 * Prefere abrir para baixo quando couber; senão para cima.
 * Se nenhum lado couber inteiro, escolhe o lado com mais espaço.
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
  const h = Math.max(0, panelHeight);
  const spaceBelow = vh - anchor.bottom - gap - pad;
  const spaceAbove = anchor.top - gap - pad;

  if (spaceBelow >= h) return 'below';
  if (spaceAbove >= h) return 'above';
  return spaceAbove > spaceBelow ? 'above' : 'below';
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
  const h = Math.max(estimated, measured, 120);
  const placement = resolveDropdownVerticalPlacement(
    anchor.getBoundingClientRect(),
    h,
    opts,
  );
  panel.classList.toggle(DROPDOWN_FLIP_ABOVE_CLASS, placement === 'above');
  panel.classList.toggle(DROPDOWN_FLIP_BELOW_CLASS, placement === 'below');
  return placement;
}
