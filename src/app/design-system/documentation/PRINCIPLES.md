# Design principles and rules

## Design principles

Aligned with Brand.md:

- Minimalism
- Consistency
- Clarity
- Professionalism
- Scalability

Sprint 6 does **not** change the running UI to chase brand ideals. It documents what the app **already** looks like.

## Component categories

| Category | Responsibility | Examples today |
|----------|----------------|----------------|
| **Primitive** | Smallest reusable UI pieces | `saas-select`, `table-empty`, avatars, `ui-tip-trigger` |
| **Composite** | Combined primitives | `app-toast`, `agenda-modal-calendar` |
| **Layout** | Shells and structure | App sidebar shell, `list-page-shell`, `drawer-stack` |
| **Feature** | Domain-specific UI | `*-cadastro-drawer`, WhatsApp modal, financeiro hosts |

## Naming conventions

- Existing selectors and component selectors stay as-is until a dedicated migration.
- Reserve the `Nexa*` prefix for **future** Angular primitives (`NexaButton`, `NexaBadge`, …) — do not rename live components in Sprint 6.
- Token constants use camelCase English keys (`COLORS.primary`) with comments citing CSS var names.

## Token philosophy

- TypeScript tokens under `design-system/tokens/` **mirror** CSS/SCSS.
- CSS remains the runtime source of truth until an explicit adoption sprint.
- Do not invent parallel palettes or spacing scales that the UI does not use.

## Responsibilities

| Layer | Owns |
|-------|------|
| `design-system/` | Tokens + docs (+ future primitives when extracted) |
| `shared/` | Current reusable Angular UI (drawers still mixed with Feature) |
| `app/styles/` | Layout shells and global pattern SCSS |
| `features/` | Page and domain UI |

## Rules for future components

1. Prefer a Shared **Primitive** before duplicating markup in Features.
2. Do not add a new CSS framework.
3. New UI may optionally import token constants for documentation/consistency — must not change existing screens without an approved visual sprint.
4. Feature drawers/forms/tables are **not** rewritten as part of Design System foundation work.

## Migration strategy

1. **Foundation (Sprint 6):** document + mirror tokens.
2. **Optional adoption:** new code may reference tokens; existing SCSS untouched.
3. **Primitive extraction:** introduce thin wrappers only when a pattern is clearly generic.
4. **Never:** big-bang rewrite of drawers, list pages, or Material/Tailwind swap.
