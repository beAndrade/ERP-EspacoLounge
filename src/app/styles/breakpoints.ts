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
  drawerWide: 1648,
} as const;

export type BreakpointKey = keyof typeof BREAKPOINTS_PX;

export function mediaQueryMax(key: BreakpointKey): string {
  return `(max-width: ${BREAKPOINTS_PX[key]}px)`;
}

export function mediaQueryMin(key: BreakpointKey): string {
  return `(min-width: ${BREAKPOINTS_PX[key]}px)`;
}
