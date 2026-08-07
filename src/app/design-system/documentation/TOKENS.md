# Tokens

## Philosophy

Tokens in `design-system/tokens/` are a **TypeScript mirror** of values already used at runtime. They exist for documentation, discoverability, and future gradual adoption.

Until an adoption sprint wires them into styles or components, **changing a token file does not change the UI**.

## Source map

| Token module | Runtime source |
|--------------|----------------|
| `colors.ts` | `src/styles.scss` `:root` (`--color-*`, badge/btn vars) |
| `spacing.ts` | `:root` `--touch-min` |
| `typography.ts` | Inter in `styles.scss`; Space Grotesk per Brand / app shell |
| `radius.ts` | `:root` `--radius`; `table-card-shell.scss` |
| `shadows.ts` | `table-card-shell.scss`, `list-page-shell.scss`, drawer panel shadow in `styles.scss` |
| `z-index.ts` | Documented overlay/drawer layers in `styles.scss` |
| `breakpoints.ts` | Re-exports `app/styles/breakpoints.ts` (aligned with `_breakpoints.scss`) |

## Brand drift (document only)

| Brand.md | Runtime (`styles.scss`) |
|----------|-------------------------|
| Primary Blue `#3F76D9` | `--color-primary: #3f769d` |
| Brand Accent `#F43F7A` | Not in `:root` |
| Sidebar `#101828` | Aligned |
| Success / Warning / Danger | Aligned |

Do **not** “correct” runtime colors in Sprint 6. Brand alignment is a future visual sprint (see ROADMAP.md).

## Import (when needed later)

```ts
import { COLORS, RADIUS, BREAKPOINTS_PX } from '../design-system/tokens';
```

Sprint 6 does not require any feature to import these modules.
