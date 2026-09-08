# Business Documentation

## Purpose

This directory contains the **business-domain** documentation for the Nexa platform: how the product creates value, acquires customers, generates revenue and scales as a SaaS business.

This README is a **map**. It does not replace strategy documents.

Unlike Product documentation, this directory focuses on business systems and commercial strategy — not software implementation.

Operational **execution** playbooks live in [../07-operations/](../07-operations/README.md).

---

# Folder Structure

```text
04-business/

customer-discovery/
sales/
pricing/
customer-onboarding/
customer-success/
strategy/
```

---

# Strategy

Canonical strategy sources (do not duplicate here):

| Document | Role |
|----------|------|
| [strategy/business-model.md](./strategy/business-model.md) | High-level business model |
| [strategy/ideal-customer-profile.md](./strategy/ideal-customer-profile.md) | Canonical ICP |
| [strategy/positioning.md](./strategy/positioning.md) | Current market positioning |
| [strategy/brand-philosophy.md](./strategy/brand-philosophy.md) | Long-term brand identity (content may be pending) |
| [customer-success/success-metrics.md](./customer-success/success-metrics.md) | Success metrics |
| [strategy/go-to-market.md](./strategy/go-to-market.md) | Go-to-market |
| [strategy/decision-framework.md](./strategy/decision-framework.md) | Decision framework |

Also see brand architecture: [../adr/ADR-003-Brand-Architecture.md](../adr/ADR-003-Brand-Architecture.md) and product expression: [../01-product/overview/brand.md](../01-product/overview/brand.md).

---

# Customer Discovery

| Concern | Canonical location |
|---------|-------------------|
| Evidence / learning | [customer-discovery/](./customer-discovery/) |
| Interview **execution** | [../07-operations/playbooks/customer-interview-playbook.md](../07-operations/playbooks/customer-interview-playbook.md) |

Discovery documents capture assumptions, observations, and validated learnings. The interview playbook tells someone how to run an interview.

---

# Sales

| Concern | Canonical location |
|---------|-------------------|
| Strategy, official process, funnel, objections, conversation learning | [sales/](./sales/) |
| Sales **execution** only | [../07-operations/playbooks/sales-playbook.md](../07-operations/playbooks/sales-playbook.md) |

The playbook must consume these sources and must not redefine ICP, strategy, or process.

---

# Pricing

Under [pricing/](./pricing/):

| Document | Responsibility (D3.6) |
|----------|----------------------|
| [pricing-strategy.md](./pricing/pricing-strategy.md) | Pricing principles, criteria, and amounts/rules when defined |
| [monetization-strategy.md](./pricing/monetization-strategy.md) | How Nexa captures revenue (canonical future revenue list) |
| [packaging.md](./pricing/packaging.md) | What each commercial offer/plan includes |

Sales consumes pricing/packaging; it does not redefine them.

---

# Customer Onboarding & Success

| Area | Path |
|------|------|
| Onboarding (business) | [customer-onboarding/](./customer-onboarding/) |
| Customer success (business) | [customer-success/](./customer-success/) |
| Onboarding execution | [../07-operations/playbooks/customer-onboarding-playbook.md](../07-operations/playbooks/customer-onboarding-playbook.md) |
| Success execution | [../07-operations/playbooks/customer-success-playbook.md](../07-operations/playbooks/customer-success-playbook.md) |

---

# Product Evolution

Product and business **roadmaps**, Product EPIC **portfolio**, and Business EPICs live in:

[../06-product-evolution/](../06-product-evolution/README.md)

Canonical product roadmap:

[../06-product-evolution/roadmap/product-roadmap.md](../06-product-evolution/roadmap/product-roadmap.md)

There is no competing product roadmap under `01-product/overview/`.

---

# Relationship with Other Documentation

- `01-product/` — product vision, personas, PDRs, domain models, EPIC lifecycle
- `06-product-evolution/` — portfolio and sequencing of product/business initiatives
- `07-operations/` — playbooks (execution)
- `adr/` — architectural decisions (including brand architecture)

Business documentation influences product priorities but should not replace Product documentation.

Full navigation: [../README.md](../README.md).

---

# Ownership

Owner: Business Team

Review Frequency: At the end of every Business EPIC or whenever business strategy changes.
