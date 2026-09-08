# EPIC-01 — Mobile Foundation

**Layer:** Product EPIC portfolio (one-pager)

This file is the **portfolio** summary for planning. It does **not** replace the detailed lifecycle under `01-product/epics/`.

## Planning Status

Planned

## Execution Status

See lifecycle: **Draft**
(`docs/01-product/epics/epic-01-mobile-foundation/`)

## Product Direction (North Star)

Mobile-first operations: mobile is the **primary platform** for day-to-day Beauty work; desktop complements administrative workflows.

Authoritative product direction and principles live in the lifecycle vision:

- [01-vision.md](../../01-product/epics/epic-01-mobile-foundation/01-vision.md)

## Current Delivery Scope (first slice)

Make the highest-frequency Beauty operations usable and trustworthy on **mobile browsers** (phone and tablet), **without** building a separate native app in this first slice.

This slice advances the North Star; it does not redefine it.

## Goal

Deliver the current delivery scope above so agenda, comanda and payment paths remain trustworthy on small viewports.

## Why it matters

Salon owners and professionals live on WhatsApp and the phone floor. If agenda, comanda and payments fail on mobile, Nexa loses daily habit.

## Outcomes

- Critical flows usable on small viewports with touch-friendly targets
- No data loss or broken drawers on mobile shell widths already defined in breakpoints
- Clear list of mobile-first vs desktop-only screens

## In scope (first slice)

- Audit of agenda, comanda, caixa/financeiro entry points on mobile
- Fix layout/interaction blockers using existing Design System / breakpoint tokens
- Touch targets aligned with `--touch-min` (44px)
- Smoke checklist for mobile regression

## Out of scope (first slice)

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

## Detailed lifecycle (canonical execution)

[docs/01-product/epics/epic-01-mobile-foundation/](../../01-product/epics/epic-01-mobile-foundation/)

## Related docs

- [Product roadmap](../roadmap/product-roadmap.md)
- [Design System ROADMAP](../../../src/app/design-system/documentation/ROADMAP.md)
- [PDR-001 — Smart Booking Philosophy](../../01-product/pdr/PDR-001-smart-booking-philosophy.md)
