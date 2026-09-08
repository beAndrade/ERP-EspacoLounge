# Product Roadmap

## Purpose

Sequence product themes after the modular architecture foundation is in place.

This roadmap focuses on **platform and Beauty product value**. Business GTM sequencing lives in [business-roadmap.md](./business-roadmap.md).

---

## Current baseline

Completed architecture migration foundation (see Migration-Plan / Project-State):

- Modular API layers (Shared, Platform, Infrastructure, Beauty module foundation)
- Company entity types (no multi-tenant runtime yet)
- Design System foundation (tokens + docs; not fully adopted)
- Single-tenant Beauty operations product in production trajectory

---

## Themes (ordered)

| Order | Theme | Primary epic | Intent |
|-------|-------|--------------|--------|
| 1 | Mobile Foundation | EPIC-01 | Make daily ops usable on phone/tablet |
| 2 | Smart Booking | EPIC-02 | Reduce friction in agenda and public booking |
| 3 | Beauty Excellence | EPIC-03 | Own Mega / packages / commissions / stock depth |
| 4 | SaaS Runtime | EPIC-04 | Real Company isolation and subscription-ready runtime |
| 5 | Growth Platform | EPIC-05 | Acquisition, expansion modules, partner/API surface |
| 6 | AI Assistant | EPIC-06 | Assist operators with insights and actions |

Themes may overlap in delivery, but **SaaS Runtime (EPIC-04)** should not be skipped if selling to multiple companies.

---

## Horizon view

### Near term

- Mobile-usable critical flows (agenda, comanda, caixa)
- Booking reliability and WhatsApp-assisted communication
- Beauty-specific workflows that competitors under-serve

### Mid term

- Multi-tenant Company runtime
- Self-serve onboarding hooks (paired with business onboarding epic)
- Design System adoption on new screens

### Long term

- Additional vertical modules (Sports, Clinic, …) on shared Core/Platform
- AI assistance layered on clean domain events
- Ecosystem / API growth

---

## Explicit non-goals (for this roadmap)

- Rewriting the entire UI for aesthetics alone
- Introducing multi-tenant `company_id` without EPIC-04 planning
- Building AI before operational data quality and SaaS isolation basics

---

## Tracking

For each epic slice:

1. Outcome definition
2. Architecture impact check (ADR / schema / Design System)
3. Implementation
4. Docs update (`Product.md`, `Modules.md`, Changelog when relevant)
5. Project-State note
