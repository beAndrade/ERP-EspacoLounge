# Product Evolution

This folder defines the **next phase of Nexa** after the architecture migration foundation (Sprints 1A–6).

It separates:

- **Product evolution** — what we build in the platform
- **Business evolution** — how we discover, sell, price, onboard and retain customers

## Layer rules

| Path | Role |
|------|------|
| `product-epics/` | **Portfolio** — strategic intent and **Planning Status** of Product EPICs |
| `roadmap/product-roadmap.md` | **Product planning sequence** — order of Product EPIC themes |
| `business-epics/` | **GTM / business initiatives** — not copies of Product EPICs |
| `roadmap/business-roadmap.md` | **Business planning sequence** — order of Business EPICs |

When a Product EPIC has a detailed lifecycle under `docs/01-product/epics/`, that folder is the canonical **execution / lifecycle** source. The portfolio one-pager must summarize and link to it — not redefine it.

## Product EPIC vs Lifecycle

- `06-product-evolution/product-epics/` = portfolio, strategic intent and **Planning Status**
- `01-product/epics/` = detailed content, execution and **Execution Status**
- The portfolio may summarize and point to the lifecycle, but must not redefine or contradict it
- `roadmap/product-roadmap.md` = sequencing / planning of Product EPICs
- `business-epics/` = business / GTM initiatives
- `roadmap/business-roadmap.md` = sequencing / planning of business initiatives

## Index

### Roadmaps

| Document | Purpose |
|----------|---------|
| [product-roadmap.md](./roadmap/product-roadmap.md) | Product themes and Product EPIC sequencing |
| [business-roadmap.md](./roadmap/business-roadmap.md) | GTM / business initiative sequencing |

### Product epics (portfolio)

| Epic | Theme |
|------|-------|
| [epic-01-mobile-foundation.md](./product-epics/epic-01-mobile-foundation.md) | Mobile-ready experience |
| [epic-02-smart-booking.md](./product-epics/epic-02-smart-booking.md) | Intelligent scheduling and booking |
| [epic-03-beauty-excellence.md](./product-epics/epic-03-beauty-excellence.md) | Deep Beauty vertical excellence |
| [epic-04-saas-runtime.md](./product-epics/epic-04-saas-runtime.md) | Multi-tenant Company runtime |
| [epic-05-growth-platform.md](./product-epics/epic-05-growth-platform.md) | Growth loops and expansion modules |
| [epic-06-ai-assistant.md](./product-epics/epic-06-ai-assistant.md) | AI-assisted operations |

### Business epics (GTM portfolio)

| Epic | Theme |
|------|-------|
| [business-epic-01-customer-discovery.md](./business-epics/business-epic-01-customer-discovery.md) | Learn from real customers |
| [business-epic-02-sales-foundation.md](./business-epics/business-epic-02-sales-foundation.md) | Repeatable sales motion |
| [business-epic-03-pricing-strategy.md](./business-epics/business-epic-03-pricing-strategy.md) | Validated pricing |
| [business-epic-04-customer-onboarding.md](./business-epics/business-epic-04-customer-onboarding.md) | Fast time-to-value |
| [business-epic-05-customer-success.md](./business-epics/business-epic-05-customer-success.md) | Retention and expansion |

## Relationship to existing docs

| Area | Canonical docs |
|------|----------------|
| Vision / brand / detailed Product EPIC lifecycle | `docs/01-product/` |
| Architecture / migration | `docs/02-architecture/`, `docs/adr/` |
| Current project state | `docs/00-governance/project/project-state.md` |
| Sales / pricing / discovery / onboarding / CS | `docs/04-business/` |
| Operational playbooks | `docs/07-operations/playbooks/` |
| Ideal Customer Profile (ICP) | `docs/04-business/strategy/ideal-customer-profile.md` |
| Sales strategy / process | `docs/04-business/sales/` |
| Sales execution | `docs/07-operations/playbooks/sales-playbook.md` |

Product Evolution **extends** those sources. It does not replace Architecture ADRs, Migration-Plan, or `04-business` strategy docs.

## Working rules

- Keep epics outcome-oriented (business value first).
- Do not start implementation from a portfolio one-pager alone when a lifecycle folder exists — use `01-product/epics/`.
- Prefer incremental slices over big-bang delivery.
- Architecture constraints from ADRs still apply (modular SaaS, Company, shared database multi-tenant when ready).
