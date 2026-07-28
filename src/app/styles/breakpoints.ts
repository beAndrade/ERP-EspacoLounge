/**
 * Breakpoints oficiais (px) — manter alinhado com `styles/_breakpoints.scss`.
 */
export const BREAKPOINTS_PX = {
  shellMobile: 640,
  formNarrow: 560,
  fichaStack: 860,
  drawerForm: 720,
  agendaMobile: 768,
  drawerSidebarHide: 1336,
  drawerTablet: 1024,
  comandaColXl: 1480,
  comandaColLg: 1280,
  comandaColMd: 1120,
  comandaColSm: 540,
  comandaColXs: 480,
  /** Acima disso o drawer deixa de ser 100vw e afasta-se da esquerda. */
  drawerWide: 1650,
} as const;

/** Shell máximo contínuo dos drawers laterais (px). */
export const DRAWER_SHELL_MAX_PX = 1650;

export type BreakpointKey = keyof typeof BREAKPOINTS_PX;

export function mediaQueryMax(key: BreakpointKey): string {
  return `(max-width: ${BREAKPOINTS_PX[key]}px)`;
}

export function mediaQueryMin(key: BreakpointKey): string {
  return `(min-width: ${BREAKPOINTS_PX[key]}px)`;
}
