# EPIC-01 — Mobile Foundation

## Status

Planned

## Goal

Make the highest-frequency Beauty operations usable and trustworthy on mobile browsers (phone and tablet), without building a separate native app in the first slice.

## Why it matters

Salon owners and professionals live on WhatsApp and the phone floor. If agenda, comanda and payments fail on mobile, Nexa loses daily habit.

## Outcomes

- Critical flows usable on small viewports with touch-friendly targets
- No data loss or broken drawers on mobile shell widths already defined in breakpoints
- Clear list of mobile-first vs desktop-only screens

## In scope

- Audit of agenda, comanda, caixa/financeiro entry points on mobile
- Fix layout/interaction blockers using existing Design System / breakpoint tokens
- Touch targets aligned with `--touch-min` (44px)
- Smoke checklist for mobile regression

## Out of scope

- Native iOS/Android apps
- Full UI redesign
- Offline-first PWA (may be a later slice)
- Rewriting all drawers

## Dependencies

- Design System foundation (`src/app/design-system/`)
- Existing breakpoints (`app/styles/breakpoints.ts`)
- BUSINESS-EPIC-01 feedback on which mobile pains are real

## Success metrics

- Task completion rate on mobile for agenda create / comanda pay paths
- Support tickets related to “doesn’t work on phone” trend down
- Demo confidence when showing phone usage

## Related docs

- `docs/01-product/UI-Flows.md`
- `src/app/design-system/documentation/ROADMAP.md`
- Product-Roadmap.md
