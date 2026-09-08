/**
 * Color tokens — mirror of runtime CSS in `src/styles.scss` `:root`.
 * CSS remains the visual source of truth until an adoption sprint.
 *
 * Brand.md drift (document only; do not “fix” in Sprint 6):
 * - Brand Primary Blue `#3F76D9` vs runtime `--color-primary` `#3f769d`
 * - Brand Accent `#F43F7A` is not present in `:root`
 */
export const COLORS = {
  primary: '#3f769d',
  primaryHover: '#2f5e7e',
  primaryContrast: '#ffffff',
  sidebar: '#101828',
  sidebarMid: '#152033',
  success: '#22c55e',
  successHover: '#16a34a',
  warning: '#f59e0b',
  error: '#ef4444',
  bg: '#f8fafc',
  surface: '#ffffff',
  card: '#ffffff',
  border: '#e2e8f0',
  text: '#0f172a',
  muted: '#94a3b8',
  /** Drawer / list status badges (`--drawer-badge-*`). */
  badgePendenteFg: '#b45309',
  badgePendenteBg: '#fffbeb',
  badgePendenteBorder: '#fcd34d',
  badgePagoFg: '#15803d',
  badgePagoBg: '#dcfce7',
  badgePagoBorder: '#bbf7d0',
  badgeAtrasoFg: '#b91c1c',
  badgeAtrasoBg: '#fef2f2',
  badgeAtrasoBorder: '#fecaca',
  badgeCreditoFg: '#0e7490',
  badgeCreditoBg: '#cffafe',
  badgeCreditoBorder: '#a5f3fc',
  badgeOkFg: '#15803d',
  badgeOkBg: '#f0fdf4',
  badgeOkBorder: '#bbf7d0',
  /** Drawer footer actions (`--drawer-btn-*`). */
  btnFaturarBg: '#70c040',
  btnFaturarHoverBg: '#88c761',
  btnDangerBg: '#ff4d4f',
  btnDangerHoverBg: '#ff7875',
} as const;

/** CSS custom property names for the core palette. */
export const COLOR_CSS_VARS = {
  primary: '--color-primary',
  primaryHover: '--color-primary-hover',
  primaryContrast: '--color-primary-contrast',
  sidebar: '--color-sidebar',
  success: '--color-success',
  warning: '--color-warning',
  error: '--color-error',
  bg: '--color-bg',
  surface: '--color-surface',
  border: '--color-border',
  text: '--color-text',
  muted: '--color-muted',
} as const;
