# Nexa Documentation

This is the **documentation navigation entry point**.

README files are maps of ownership and navigation — not duplicate sources of truth.

---

## Documentation areas

| Area | Path | Role |
|------|------|------|
| Governance | [00-governance/](./00-governance/README.md) | Project state, documentation maintenance, AI team orientation |
| Product | [01-product/](./01-product/README.md) | Product definition, domain models, PDRs, EPIC lifecycle |
| Architecture | [02-architecture/](./02-architecture/README.md) | How the platform is built |
| Development | [03-development/](./03-development/README.md) | Engineering standards and delivery workflow |
| Business | [04-business/](./04-business/README.md) | Strategy, discovery, sales system, pricing, onboarding, CS |
| Prompts | [05-prompts/](./05-prompts/README.md) | AI assistant prompts |
| Product Evolution | [06-product-evolution/](./06-product-evolution/README.md) | EPIC portfolio, product/business roadmaps, GTM initiatives |
| Operations | [07-operations/](./07-operations/README.md) | Operational playbooks (execution) |
| ADRs | [adr/](./adr/README.md) | Architecture Decision Records |

---

## Canonical navigation

| Question | Canonical location |
|----------|-------------------|
| Where is business strategy? | [04-business/strategy/](./04-business/strategy/) |
| Where is customer discovery (evidence/learning)? | [04-business/customer-discovery/](./04-business/customer-discovery/) |
| Where are product specifications? | [01-product/](./01-product/README.md) (`overview/`, `domain-models/`, `pdr/`) |
| Where is architecture? | [02-architecture/](./02-architecture/README.md) |
| Where are ADRs? | [adr/](./adr/README.md) |
| Where is Product EPIC lifecycle? | [01-product/epics/](./01-product/epics/) |
| Where is Product EPIC portfolio? | [06-product-evolution/product-epics/](./06-product-evolution/product-epics/) |
| Where is the product roadmap? | [06-product-evolution/roadmap/product-roadmap.md](./06-product-evolution/roadmap/product-roadmap.md) |
| Where is the business roadmap? | [06-product-evolution/roadmap/business-roadmap.md](./06-product-evolution/roadmap/business-roadmap.md) |
| Where is sales strategy / process / funnel? | [04-business/sales/](./04-business/sales/) |
| Where is sales execution? | [07-operations/playbooks/sales-playbook.md](./07-operations/playbooks/sales-playbook.md) |
| Where is pricing / monetization / packaging? | [04-business/pricing/](./04-business/pricing/) |
| Where is Ideal Customer Profile (ICP)? | [04-business/strategy/ideal-customer-profile.md](./04-business/strategy/ideal-customer-profile.md) |
| Where is Brand Philosophy? | [04-business/strategy/brand-philosophy.md](./04-business/strategy/brand-philosophy.md) |
| Where is market positioning? | [04-business/strategy/positioning.md](./04-business/strategy/positioning.md) |
| Where is brand architecture? | [adr/ADR-003-Brand-Architecture.md](./adr/ADR-003-Brand-Architecture.md) |
| Where is product brand expression? | [01-product/overview/brand.md](./01-product/overview/brand.md) |
| Where are commissions domain docs? | [01-product/domain-models/](./01-product/domain-models/) |
| Where is interview execution? | [07-operations/playbooks/customer-interview-playbook.md](./07-operations/playbooks/customer-interview-playbook.md) |
| Where are operational playbooks? | [07-operations/playbooks/](./07-operations/playbooks/) |

---

## Important boundaries (Phase 2 / D3)

- **Product EPIC portfolio** (`06-product-evolution/product-epics/`) ≠ **EPIC lifecycle** (`01-product/epics/`).
- **Sales system** (`04-business/sales/`) ≠ **sales execution** (`07-operations/playbooks/sales-playbook.md`).
- **Pricing / monetization / packaging** are separate concerns under `04-business/pricing/`.
- **Brand:** philosophy (long-term) · positioning (current market) · ADR-003 (architecture) · `brand.md` (product expression).
- **Discovery evidence** lives in `04-business/customer-discovery/`; interview **execution** lives in operations playbooks.
- `06-product-evolution/discoveries/` was **removed** (D3.2).

When documentation and code conflict, report the inconsistency before changing either blindly. See [00-governance/](./00-governance/README.md).
