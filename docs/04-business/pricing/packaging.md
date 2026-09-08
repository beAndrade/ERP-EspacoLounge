# Packaging Strategy

**Status:** Draft

**Owner:** Business Team

---

# Purpose

This document defines how the Nexa platform is **packaged and offered** commercially.

It answers:

> What does the customer receive in each offer or plan?

It does **not** define how revenue is captured (see [monetization-strategy.md](./monetization-strategy.md)) or how much is charged (see [pricing-strategy.md](./pricing-strategy.md)).

Packaging should simplify purchasing decisions rather than complicate them.

---

# Packaging Philosophy

Packaging should reflect customer maturity, not artificial feature restrictions.

Customers should clearly understand:

- What they receive
- Why it creates value
- How the product evolves with their business

The initial objective is simplicity.

---

# Current Packaging Strategy

Current Product Stage:

Pre Product-Market Fit

Current commercial offering:

- **One plan**
- **One customer experience**
- Same commercial inclusion for all customers in this stage

The priority is learning customer behavior before introducing commercial complexity.

How the company captures revenue for this offer (e.g. SaaS subscription) is defined in [monetization-strategy.md](./monetization-strategy.md). Price amounts, when defined, live in [pricing-strategy.md](./pricing-strategy.md).

---

# Why a Single Plan?

Current objectives:

- Validate Product-Market Fit
- Simplify commercial conversations
- Reduce implementation complexity
- Accelerate customer learning
- Avoid premature segmentation

The product should evolve before commercial packaging becomes complex.

---

# Setup / Implementation in the offer

**Packaging responsibility:** whether setup/implementation is **included in the offer** or **sold separately**.

Current draft (Pre Product-Market Fit):

- Setup / implementation treatment is **not finalized** as a separate commercial SKU.
- Commercial conversations should not invent a fee structure here.

**Related ownership:**

- Revenue mechanism (setup fee as a way to capture revenue) → [monetization-strategy.md](./monetization-strategy.md)
- Amount charged (when defined) → [pricing-strategy.md](./pricing-strategy.md)

Do not duplicate the full decision across the three documents.

---

# Future Packaging Evolution

Packaging may evolve after sufficient customer validation.

Possible future plan names (placeholders only):

- Starter
- Professional
- Business
- Enterprise

Actual packaging should be driven by validated customer needs.

---

# Future Segmentation Criteria

Potential differentiation between plans may consider:

- Business size
- Number of professionals
- Operational complexity
- Advanced commercial options
- AI capabilities (as offer elements)
- Premium integrations (as offer elements)
- Support level

Segmentation should never create unnecessary friction.

---

# Commercially included capabilities (core offer)

The following are **capabilities included in the current commercial core offer**.

They describe what the offer makes available to the customer. They are **not** a full product specification.

Real product behavior is defined under `docs/01-product/` (and related domain / EPIC docs).

Commercially included today (same for all customers on the single plan):

- Scheduling
- Customer Management
- Financial Management
- Inventory
- Service Management
- Commission Management
- Dashboard

These inclusions define the operational value of the commercial offer at this stage.

---

# Optional services (as offer elements)

Future **optional elements of the offer** may include:

- AI Assistant
- WhatsApp Messaging
- Online Booking
- API Access
- Premium Reports
- White Label
- Advanced Analytics
- Marketplace Integrations

Ownership split:

| Concern | Canonical document |
|---------|-------------------|
| How the option appears in the offer (included / add-on / separate) | **This file (Packaging)** |
| How revenue is captured for that option | [monetization-strategy.md](./monetization-strategy.md) |
| Price amount (when defined) | [pricing-strategy.md](./pricing-strategy.md) |

Optional services should extend the platform commercially rather than replace core offer inclusions. Product behavior for each capability remains in Product documentation.

Canonical list of future **revenue mechanisms / channels** (including related opportunities): [monetization-strategy.md](./monetization-strategy.md) — Future Revenue Opportunities.

---

# Upgrade rules (draft)

While there is a single plan, upgrade rules are not active.

When multiple plans exist, upgrades should follow customer operational maturity rather than removing core inclusions to force upgrades.

Illustrative progression (not finalized commercial offerings):

| Customer Stage | Potential Plan |
|----------------|----------------|
| Independent Professional | Starter |
| Small Studio | Studio |
| Growing Beauty Salon | Business |
| Multi-Location Operation | Enterprise |

Future packaging decisions should be validated through Customer Discovery, Validated Learnings, Product-Market Fit, and Customer Success Metrics.

---

# Packaging Review

Packaging should be reviewed when:

- Product-Market Fit is achieved.
- Customer segments become clearly differentiated.
- Expansion opportunities emerge.
- Customer feedback consistently supports segmentation.

Packaging should evolve gradually.

---

# Relationship with Other Documents

| Document | Role |
|----------|------|
| [pricing-strategy.md](./pricing-strategy.md) | Principles and price amounts/rules |
| [monetization-strategy.md](./monetization-strategy.md) | Revenue capture mechanisms |
| Sales Strategy / Sales Playbook | Consume this packaging; do not redefine it |
| Customer Discovery | Evidence for packaging changes |
| Product documentation (`docs/01-product/`) | Real product behavior |

Packaging should support long-term business growth while preserving a simple customer experience.

---

# Long-Term Vision

The long-term objective is a flexible commercial model where customers adopt additional offer elements as their business grows.

Nexa should grow together with its customers.

Commercial complexity should always remain lower than product value.
