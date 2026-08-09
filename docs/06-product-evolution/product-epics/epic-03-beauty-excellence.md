# EPIC-03 — Beauty Excellence

## Status

Planned

## Goal

Make Nexa Beauty unmistakably stronger than generic ERPs on salon-specific workflows: Mega Hair, packages, queratina, commissions, hair stock, and operational visibility.

## Why it matters

Nexa wins by vertical depth, not by being “another spreadsheet replacement.” Architecture migration moved Beauty foundations into `modules/beauty`; this epic deepens product excellence.

## Outcomes

- Beauty-critical flows feel complete and trustworthy for daily use
- Commission and stock rules match real salon practice (documented in business rules)
- Clear module boundary: Beauty logic grows inside Beauty module / Features, not Platform

## In scope

- Mega / pacote / queratina / cabelo catalog and attendance depth
- Commission payroll alignment with `docs/04-business/Commissions-*.md`
- Hair/product stock nuances that matter on the floor
- Gradual extraction of remaining Beauty queries/services into the Beauty module
- Design System adoption on **new** Beauty screens only (no redesign mandate)

## Out of scope

- New verticals (Clinic, Sports, …) — Growth Platform / later modules
- Multi-tenant isolation (EPIC-04)
- AI recommendations (EPIC-06)

## Dependencies

- Beauty module foundation (Sprint 2 / 2A)
- Business rules docs for commissions
- Discovery evidence from BUSINESS-EPIC-01

## Success metrics

- Salon can run a full week without Excel shadow systems for core Beauty ops
- Commission calculation disputes reduced
- Demo “wow” moments tied to Beauty-specific flows

## Related docs

- `docs/01-product/Modules.md`
- `docs/04-business/Commissions-BusinessRules.md`
- `docs/04-business/Commissions-Payroll.md`
- `api/src/modules/beauty/README.md`
- Product-Roadmap.md
