/**
 * Spacing / touch targets — mirror of runtime CSS.
 * Source: `src/styles.scss` `:root` (`--touch-min`).
 * Do not invent a full spacing scale in Sprint 6.
 */
export const SPACING = {
  /** Minimum interactive target — `--touch-min`. */
  touchMinPx: 44,
  touchMin: '44px',
} as const;

export const SPACING_CSS_VARS = {
  touchMin: '--touch-min',
} as const;
