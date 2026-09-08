# Nexa Design System

Foundation for reusable UI contracts across the Angular app (Nexa / Beauty).

## Status (Sprint 6)

**Documentation-first foundation.** TypeScript tokens mirror the **current runtime** CSS/SCSS. They are **not wired** into templates or stylesheets yet — visual behavior is unchanged.

Runtime source of truth remains:

- [`src/styles.scss`](../../../styles.scss) `:root`
- [`src/app/styles/`](../../styles/) shells (`list-page-shell`, `drawer-stack`, `table-card-shell`, …)
- Existing Shared / Feature components under `src/app/shared/` and `src/app/features/`

## Structure

```text
design-system/
  tokens/           # TS mirrors of current design values
  components/       # reserved (no moves in Sprint 6)
  patterns/         # reserved (shells stay in app/styles)
  icons/            # reserved
  documentation/    # this folder
```

## Docs

| Doc | Purpose |
|-----|---------|
| [PRINCIPLES.md](./PRINCIPLES.md) | Principles, naming, categories, migration rules |
| [TOKENS.md](./TOKENS.md) | Token philosophy and source map |
| [COMPONENTS.md](./COMPONENTS.md) | Inventory (Primitive / Composite / Layout / Feature) |
| [ROADMAP.md](./ROADMAP.md) | Future evolution (planning only) |

## Related product docs

- [`docs/01-product/Brand.md`](../../../../docs/01-product/Brand.md)
- [`docs/adr/ADR-003-Brand-Architecture.md`](../../../../docs/adr/ADR-003-Brand-Architecture.md)

## Rules

- Do not introduce Tailwind, Bootstrap, or Angular Material as a replacement kit.
- Do not redesign screens in the name of “adopting” the design system.
- Prefer documenting and extracting primitives gradually over big-bang rewrites.
