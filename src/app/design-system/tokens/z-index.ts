/**
 * Z-index layers documented from current global drawer/overlay CSS.
 * Source examples: `src/styles.scss` (servico cadastro host / overlay).
 * Not a complete inventory of every feature z-index.
 */
export const Z_INDEX = {
  servicoCadastroOverlay: 1620,
  servicoCadastroDrawer: 1630,
} as const;

export const Z_INDEX_CSS_VARS = {
  clienteGlobalOverlay: '--z-cliente-global-overlay',
  clienteGlobalDrawer: '--z-cliente-global-drawer',
} as const;
