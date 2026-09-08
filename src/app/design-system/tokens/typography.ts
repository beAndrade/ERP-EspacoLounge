/**
 * Typography tokens — document current runtime fonts.
 * UI font loaded in `src/styles.scss` (Inter).
 * Logo font (Space Grotesk) used in app shell SCSS per Brand.md.
 */
export const TYPOGRAPHY = {
  fontUi: 'Inter, sans-serif',
  fontLogo: 'Space Grotesk, sans-serif',
  /** Documented intent from Brand.md — not enforced by these constants. */
  brandUi: 'Inter',
  brandLogo: 'Space Grotesk',
} as const;
