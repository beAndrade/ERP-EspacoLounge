/**
 * Radius tokens — mirror of runtime values.
 * Sources: `src/styles.scss` `--radius`; `app/styles/table-card-shell.scss`.
 */
export const RADIUS = {
  defaultPx: 12,
  default: '12px',
  listTableCardPx: 12,
  listTableCard: '12px',
  listTableTheadCornerPx: 14,
  listTableTheadCorner: '14px',
} as const;

export const RADIUS_CSS_VARS = {
  default: '--radius',
} as const;
