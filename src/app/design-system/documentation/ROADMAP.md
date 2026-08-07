# Design System roadmap (planning only)

This file does not change runtime behavior.

## Current foundation status (Sprint 6)

- `design-system/tokens/` mirrors current CSS/SCSS values.
- Documentation covers principles, tokens, and component inventory.
- `components/`, `patterns/`, and `icons/` are reserved empty folders.
- No visual redesign; no wiring of tokens into existing styles.

## Future primitive components

Extract only when a pattern is clearly generic and duplication hurts:

1. Button / toolbar actions (today: scattered `.list-head__toolbar-btn`, drawer footer buttons)
2. Badge (today: `--drawer-badge-*` + feature classes)
3. Card / table surface (today: `table-card-shell`)
4. Dialog / confirm modal chrome
5. Form controls beyond `saas-select`

Prefer thin wrappers over rewrites of drawers and list pages.

## Planned token adoption

1. Keep CSS `:root` as runtime source of truth.
2. Allow **new** UI to import TS tokens for consistency (optional).
3. Later: generate or sync SCSS from tokens — only with an explicit sprint and visual QA.
4. Never force a global search-replace of hard-coded hexes without product approval.

## Brand alignment

Resolve Brand.md vs runtime drift in a **dedicated visual sprint**:

- Primary `#3F76D9` vs `#3f769d`
- Accent `#F43F7A` (unused in `:root`)
- Confirm typography loading for Space Grotesk everywhere brand requires it

Until then, document drift; do not “fix” colors silently.

## Long-term evolution

- Grow `design-system/components/` only with real primitives (not Feature drawers).
- Keep layout shells in `app/styles/` until a Patterns extraction is justified.
- Reduce Shared god-folder of domain drawers (move Feature UI back to Features).
- Stay custom SCSS + CSS variables — no Tailwind/Bootstrap/Material replacement as a big bang.
- Module themes (Beauty vs future verticals) may extend tokens per company later; multi-tenant theming is out of scope until Platform Company is wired.
