# Product Evolution

This folder defines the **next phase of Nexa** after the architecture migration foundation (Sprints 1A–6).

It separates:

- **Product evolution** — what we build in the platform
- **Business evolution** — how we discover, sell, price, onboard and retain customers

## Index

### Roadmaps

| Document | Purpose |
|----------|---------|
| [Product-Roadmap.md](./Product-Roadmap.md) | Product themes and epic sequencing |
| [Business-Roadmap.md](./Business-Roadmap.md) | GTM, sales and customer lifecycle sequencing |

### Product epics

| Epic | Theme |
|------|-------|
| [EPIC-01-Mobile-Foundation.md](./EPIC-01-Mobile-Foundation.md) | Mobile-ready experience |
| [EPIC-02-Smart-Booking.md](./EPIC-02-Smart-Booking.md) | Intelligent scheduling and booking |
| [EPIC-03-Beauty-Excellence.md](./EPIC-03-Beauty-Excellence.md) | Deep Beauty vertical excellence |
| [EPIC-04-SaaS-Runtime.md](./EPIC-04-SaaS-Runtime.md) | Multi-tenant Company runtime |
| [EPIC-05-Growth-Platform.md](./EPIC-05-Growth-Platform.md) | Growth loops and expansion modules |
| [EPIC-06-AI-Assistant.md](./EPIC-06-AI-Assistant.md) | AI-assisted operations |

### Business epics

| Epic | Theme |
|------|-------|
| [BUSINESS-EPIC-01-Customer-Discovery.md](./BUSINESS-EPIC-01-Customer-Discovery.md) | Learn from real customers |
| [BUSINESS-EPIC-02-Sales-Foundation.md](./BUSINESS-EPIC-02-Sales-Foundation.md) | Repeatable sales motion |
| [BUSINESS-EPIC-03-Pricing-Strategy.md](./BUSINESS-EPIC-03-Pricing-Strategy.md) | Validated pricing |
| [BUSINESS-EPIC-04-Customer-Onboarding.md](./BUSINESS-EPIC-04-Customer-Onboarding.md) | Fast time-to-value |
| [BUSINESS-EPIC-05-Customer-Success.md](./BUSINESS-EPIC-05-Customer-Success.md) | Retention and expansion |

## Relationship to existing docs

| Area | Canonical docs |
|------|----------------|
| Vision / brand | `docs/01-product/` |
| Architecture / migration | `docs/02-architecture/`, `docs/adr/` |
| Current project state | `docs/00-governance/Project-State.md` |
| Sales / pricing / monetization | `docs/04-business/` |

Product Evolution **extends** those sources. It does not replace Architecture ADRs or the Migration-Plan.

## Working rules

- Keep epics outcome-oriented (business value first).
- Do not start implementation from an epic without updating Project-State and relevant product docs.
- Prefer incremental slices over big-bang delivery.
- Architecture constraints from ADRs still apply (modular SaaS, Company, shared database multi-tenant when ready).
