# Documentation Review

**Review:** Phase 2 Documentation Review
**Branch:** `review/documentation-phase2`
**Status:** In Progress
**Review Type:** Documentation Architecture Review

---

# 1. Purpose

This document records the review of the Nexa documentation structure after the initial Phase 2 documentation was completed.

The objective is to ensure that the documentation:

- Has clear ownership and responsibility.
- Avoids unnecessary duplication.
- Uses consistent terminology.
- Places each document in the appropriate location.
- Represents the Nexa decision-making methodology.
- Remains useful for future product, business and development decisions.

This review should be treated similarly to a code review: findings are documented before structural changes are applied.

---

# 2. Review Principles

The review follows these principles:

1. Every document should have a clear responsibility.
2. Every folder should have a clear purpose.
3. Duplicate concepts should be consolidated whenever possible.
4. Documentation should exist because it provides operational or strategic value, not simply because it looks complete.
5. Facts, hypotheses, decisions and validated learnings must remain distinguishable.
6. Product decisions should be supported by evidence.
7. The documentation structure should support the Nexa decision flow.

---

# 3. Nexa Decision Flow

The current conceptual decision flow is:

```text
Idea
  ↓
Customer Discovery
  ↓
Field Observation
  ↓
Assumption
  ↓
Validated Learning
  ↓
Business / Product Decision
  ↓
PDR
  ↓
Product EPIC
  ↓
Sprint
  ↓
Implementation
  ↓
Validation
  ↓
Documentation
```

Not every idea must progress through the entire flow.

Unvalidated ideas should remain ideas until sufficient evidence exists to justify further discovery or decision-making.

---

# 4. D1 — Structure Review

## 4.1 Current Top-Level Structure

Current documentation areas:

```text
docs/
├── 00-governance/
├── 01-product/
├── 02-architecture/
├── 03-development/
├── 04-business/
├── 05-prompts/
├── 06-product-evolution/
├── 07-operations/
└── adr/
```

### Preliminary Assessment

The top-level structure is coherent.

No top-level folder should be removed at this stage.

---

# 5. D1 Findings

## 5.1 `00-governance/`

Current responsibility:

Governance, project state, AI governance and documentation maintenance.

Current structure:

```text
00-governance/
├── ai/
├── decisions/
├── documentation/
├── project/
└── README.md
```

### Decision

**KEEP**

No structural change identified during D1.

---

## 5.2 `01-product/`

Current responsibility:

Product knowledge, domain models, EPIC documentation, product overview, personas and PDRs.

Current structure:

```text
01-product/
├── domain-models/
├── epics/
├── overview/
├── pdr/
├── personas/
└── README.md
```

### Decision

**KEEP**

The structure is coherent.

### EPIC Documentation vs Product Evolution EPICs

There are two different representations of Product EPICs in the documentation system.

Detailed EPIC documentation exists under:

```text
01-product/epics/
└── epic-01-mobile-foundation/
    ├── 01-vision.md
    ├── 02-business-rules.md
    ├── 03-ux-flows.md
    ├── 04-technical-design.md
    ├── 05-sprint-planning.md
    ├── 06-architecture-review.md
    ├── 07-implementation.md
    ├── 08-validation.md
    └── 09-documentation.md
```

This represents the complete lifecycle of an individual EPIC.

### Decision

**KEEP**

The detailed EPIC documentation should remain under `01-product/epics/`.

### EPIC Release Files

The following EPIC-level files were found to contain no content:

```text
01-product/epics/epic-01-mobile-foundation/changelog.md
01-product/epics/epic-01-mobile-foundation/release-notes.md
```

Official release documentation already exists under:

```text
03-development/release-management/
├── changelog.md
├── release-notes.md
└── versioning.md
```

### Decision

**REMOVE**

Delete:

```text
01-product/epics/epic-01-mobile-foundation/changelog.md
01-product/epics/epic-01-mobile-foundation/release-notes.md
```

Release documentation remains centralized under `03-development/release-management/`.

---

## 5.3 `01-product/domain-models/`

Current responsibility:

Product domain behavior and lifecycle documentation.

### Decision

**KEEP**

### D2 Finding — Commission Documentation

The following documents have different responsibilities:

```text
commissions-rules.md
commissions-payroll.md
commission-lifecycle.md
```

`commissions-rules.md` represents product/business rules.

`commissions-payroll.md` represents operational/technical payroll behavior.

`commission-lifecycle.md` represents the lifecycle of a commission.

### Decision

**KEEP SEPARATE** — content rules completed under **D3.3 (KEEP WITH RULE)**.

The exact future location of `commissions-payroll.md` remains under review (no move in D3.3).

---

# 6. `02-architecture/`

Current responsibility:

Architecture knowledge organized by technical concern.

Current structure:

```text
02-architecture/
├── database/
├── deployment/
├── foundation/
├── integrations/
├── platform/
└── README.md
```

### Decision

**KEEP**

The separation between foundation, database, deployment, integrations and platform is considered coherent.

### Deployment Documentation

The following documents were reviewed:

```text
02-architecture/deployment/
├── deployment.md
└── dokploy.md
```

They have distinct responsibilities.

`deployment.md` is the general deployment guide.

`dokploy.md` documents the current Dokploy-specific implementation.

### Decision

**KEEP BOTH**

No consolidation is required.

Future improvement:

`deployment.md` should clearly reference `dokploy.md` as the current implementation-specific deployment documentation.

---

# 7. `03-development/`

Current responsibility:

Development practices, engineering workflow, AI development guidance, standards and release management.

Current structure:

```text
03-development/
├── ai/
├── engineering/
├── release-management/
├── standards/
└── README.md
```

### Decision

**KEEP**

The current structure is clear.

### Release Management

The following area is the official release-management location:

```text
03-development/release-management/
├── changelog.md
├── release-notes.md
└── versioning.md
```

Release-related documentation should have a single source of truth.

---

# 8. `04-business/`

Current responsibility:

Business strategy, customer discovery, sales, pricing, onboarding and customer success.

Current structure:

```text
04-business/
├── customer-discovery/
├── customer-onboarding/
├── customer-success/
├── pricing/
├── sales/
├── strategy/
├── decision-framework.md
└── README.md
```

### Finding — `decision-framework.md`

The file:

```text
04-business/decision-framework.md
```

defines strategic business decision principles and belongs conceptually with:

```text
04-business/strategy/
```

### Decision

**APPROVED**

Move:

```text
04-business/decision-framework.md
        ↓
04-business/strategy/decision-framework.md
```

This move has now been executed.

---

# 9. `04-business/strategy/`

Current documents include:

```text
brand-philosophy.md
business-model.md
decision-framework.md
go-to-market.md
ideal-customer-profile.md
positioning.md
```

### Decision

**KEEP**

### Important Note

`brand-philosophy.md` currently exists as a document, but the long-term Brand Philosophy has not yet received its dedicated strategic brainstorming session.

The document should not be treated as final merely because the file exists.

### Future Review

Brand Philosophy should be revisited separately after the documentation review.

It must distinguish:

- Current market positioning.
- Current Beauty strategy.
- Long-term Nexa identity.
- Future multi-vertical vision.

---

# 10. `05-prompts/`

Current responsibility:

Reusable prompts and AI-assisted development workflows.

Current structure includes:

```text
05-prompts/
├── Phase-2/
├── Architecture-Analysis.md
├── Bugfix.md
├── Code-Review.md
├── Documentation-Review.md
├── Feature-Development.md
├── Hotfix.md
├── Project-Advisor.md
├── Refactoring.md
├── Small-Task.md
├── Weekly-Health-Check.md
└── README.md
```

### Decision

**KEEP FOR NOW**

The Phase 2 prompt set mirrors the EPIC documentation workflow and is intentionally related to the product lifecycle.

### Intentional Placeholders

Some documentation files may intentionally remain empty during the current phase.

This is acceptable when the document belongs to a future documentation system that has already been planned but not yet implemented.

The main example is `05-prompts/`.

The reusable prompt system will be developed in a dedicated future phase after the documentation architecture is stabilized.

Therefore, empty prompt documents should not be classified as documentation defects during the current review.

They should be evaluated again during the Prompt System Phase.

An empty file is only considered a defect when its responsibility is expected to be active in the current phase and no valid reason exists for it to remain empty.

### Future Evolution

A future AI Development Framework may expand the prompt system, especially for daily Cursor workflows.

Examples may include:

- Reusing existing UI components.
- Implementing a new drawer using an existing drawer pattern.
- Refactoring without changing behavior.
- Debugging.
- Code review.
- Small isolated changes.

This should be designed later rather than prematurely expanded during the current structural review.

---

# 11. `06-product-evolution/`

Current responsibility:

Ideas, metrics, business EPICs, product EPICs and roadmaps.

Current structure:

```text
06-product-evolution/
├── backlog/
├── business-epics/
├── ideas/
├── metrics/
├── product-epics/
├── roadmap/
└── README.md
```

Note: `discoveries/` was removed under **D3.2** (see below). It is no longer part of the structure.

### Decision

**KEEP**

This structure correctly separates product evolution stages (without a separate `discoveries/` folder).

---

# 12. `06-product-evolution/ideas/`

Current responsibility:

Capture product opportunities and ideas that have not yet earned the status of roadmap commitment or Product EPIC.

Current structure:

```text
06-product-evolution/
└── ideas/
    ├── ai-review-insights.md
    ├── customer-mobile-app.md
    ├── marketing-reputation-platform.md
    ├── online-booking-v2.md
    └── whatsapp-automation.md
```

### Finding — `future-epics.md`

The previous:

```text
06-product-evolution/ideas/future-epics.md
```

contained a single unvalidated opportunity rather than a true EPIC portfolio.

Its responsibility is already covered by the individual idea documents.

### Decision

**REMOVE**

Delete:

```text
06-product-evolution/ideas/future-epics.md
```

Do not replace it with another aggregate "Future EPICs" file.

Individual ideas should remain as individual documents until sufficient evidence exists to justify progression.

The progression should be:

```text
Idea
↓
Discovery
↓
Validated Learning
↓
Business / Product Decision
↓
PDR
↓
Product EPIC
↓
Roadmap
```

---

# 13. `07-operations/`

Current structure:

```text
07-operations/
└── playbooks/
    ├── customer-interview-playbook.md
    ├── customer-onboarding-playbook.md
    ├── customer-success-playbook.md
    ├── product-demo-playbook.md
    └── sales-playbook.md
```

### Decision

**KEEP**

This folder represents operational execution rather than business strategy.

Conceptual distinction:

```text
04-business/
    ↓
What the business decides and why

07-operations/
    ↓
How the company executes recurring processes
```

This separation should remain.

---

# 14. `adr/`

Current structure:

```text
adr/
├── ADR-001-Modular-Architecture.md
├── ADR-002-Multi-Tenant-Strategy.md
├── ADR-003-Brand-Architecture.md
├── ADR-004-Technology-Stack.md
├── ADR-005-Database-Strategy.md
├── ADR-006-Platform-Layer-Introduction.md
└── README.md
```

### Decision

**KEEP**

ADRs remain a dedicated record of formal architecture decisions.

They should not be moved into `02-architecture/`.

Conceptual distinction:

```text
02-architecture/
    ↓
Architecture knowledge

adr/
    ↓
Architecture decisions
```

---

# 15. EPIC Portfolio vs Detailed EPIC Documentation

There are two representations of Product EPICs in the documentation system.

These are intentionally different and should not be consolidated.

## 15.1 Product Evolution EPICs

Location:

```text
06-product-evolution/product-epics/
```

Current documents:

```text
epic-01-mobile-foundation.md
epic-02-smart-booking.md
epic-03-beauty-excellence.md
epic-04-saas-runtime.md
epic-05-growth-platform.md
epic-06-ai-assistant.md
```

These documents represent the Product EPIC portfolio.

They communicate:

- Goal
- Why it matters
- Expected outcomes
- Scope
- Dependencies
- Success metrics
- Related documentation

They answer:

> What are we evolving in the product, and why?

---

## 15.2 Detailed EPIC Documentation

Location:

```text
01-product/epics/
```

Example:

```text
01-product/epics/epic-01-mobile-foundation/
```

The detailed EPIC contains the complete lifecycle:

```text
01-vision.md
02-business-rules.md
03-ux-flows.md
04-technical-design.md
05-sprint-planning.md
06-architecture-review.md
07-implementation.md
08-validation.md
09-documentation.md
```

These documents answer:

> How do we define, build, validate and close this specific EPIC?

---

## 15.3 Responsibility Boundary

The relationship is:

```text
06-product-evolution/product-epics/
        ↓
Product portfolio / strategic EPIC definition
        ↓
01-product/epics/
        ↓
Detailed EPIC lifecycle and execution
```

The Product Evolution version is the concise portfolio-level representation.

The `01-product/epics/` version is the authoritative detailed lifecycle documentation for the individual EPIC.

### Decision

**KEEP BOTH**

Do not consolidate these structures.

Future Product EPICs should follow the same pattern when a detailed lifecycle is required.

---

# 16. D3 Findings

## 16.1 Summary

The Content & Responsibility Review identified multiple points of potential overlap.

These findings do not mean that every overlapping concept represents a defect.

The purpose of D3 is to distinguish:

- intentional overlap;
- ambiguity;
- duplication;
- contradiction;
- incorrect responsibility.

### Summary

| Metric | Result |
|---|---:|
| Areas analyzed | 9 |
| Problems reported | 18 |
| Real duplications (D) | 4 |
| Ambiguities (C) | 8 |
| Contradictions (E) | 3 |
| Incorrect responsibility (F) | 2 |
| Acceptable overlap (B) | 1 |

No repository files were altered during the initial D3 analysis.

---

# 17. D3 — Discovery Responsibility

The Discovery architecture is intentionally distributed across layers.

## Historical proposal (superseded by D3.2)

An earlier draft proposed three Discovery-related folders, including:

```text
06-product-evolution/discoveries/
```

with the aspirational role of “product implications derived from discovery,” and a provisional decision of **KEEP ALL THREE**.

That provisional decision is **superseded by D3.2** below.

## Canonical Discovery flow (current)

```text
07-operations
→ método de discovery / entrevista

04-business/customer-discovery
→ evidências, observações, assumptions e validated learnings

01-product/pdr
→ decisão formal de produto

06-product-evolution/ideas
ou
06-product-evolution/product-epics
→ oportunidade / evolução de produto
```

### `07-operations/customer-interview-playbook.md`

Responsible for:

- how to prepare;
- how to conduct interviews;
- practical interview procedure;
- operational guidance.

### `04-business/customer-discovery/`

Responsible for:

- field observations;
- assumptions;
- evidence;
- validated learnings;
- business discovery records.

This is the canonical business evidence layer.

### Product implications (no `06/.../discoveries/` folder)

Validated learnings influence product through existing homes:

- `01-product/pdr/` — formal product decisions;
- `06-product-evolution/ideas/` — opportunities not yet committed;
- `06-product-evolution/product-epics/` — portfolio evolution themes.

---

# 17.1 D3.2 — `06-product-evolution/discoveries/` (COMPLETED)

### Human decision

**REMOVE**

### Finding

`docs/06-product-evolution/discoveries/` had no content and no distinct operational responsibility in the repository.

Keeping an empty third Discovery layer risked becoming a second evidence source without clear consumers.

### Action taken

- Removed the empty directory `docs/06-product-evolution/discoveries/`.
- Updated this review so Discovery no longer treats that folder as canonical or future-required.

### Decision status

**COMPLETED**

---

# 18. D3 — Personas vs ICP

The current architecture distinguishes:

```text
01-product/personas/
```

from:

```text
04-business/strategy/ideal-customer-profile.md
```

and from ICP references inside operational playbooks.

### Decision

**KEEP PERSONA AND ICP SEPARATE**

### Persona

Answers:

> Who is the user and how do they behave within the product/business context?

Example:

```text
Owner
Receptionist
Professional
```

### ICP

Answers:

> Which type of business is most likely to be a good customer for Nexa?

The canonical ICP belongs in:

```text
04-business/strategy/ideal-customer-profile.md
```

### Playbook Rule

Operational playbooks may reference the ICP for execution purposes, but should not create a competing ICP definition.

If an ICP description inside a playbook conflicts with the canonical ICP, the playbook must be corrected to reference the canonical business document.

---

# 19. D3 — Brand Responsibility

The review identified three related brand documents:

```text
01-product/overview/brand.md
04-business/strategy/brand-philosophy.md
adr/ADR-003-Brand-Architecture.md
```

### Decision

**KEEP ALL THREE**

Their intended responsibility is:

```text
01
→ Brand expression within the product

04
→ Brand philosophy and company identity

ADR
→ Brand architecture decision
```

The hierarchy is:

```text
Brand Philosophy
        ↓
Brand Architecture Decision
        ↓
Brand Expression in Product
```

### Important Note

`brand-philosophy.md` requires a dedicated future strategic brainstorming session.

The Nexa identity must not be permanently defined by the current Beauty focus.

The current product strategy may be Beauty-focused while the long-term Nexa identity remains multi-vertical.

---

# 20. D3 — Architecture vs Development

The distinction between:

```text
02-architecture/
```

and:

```text
03-development/
```

is considered valid.

### `02-architecture`

Answers:

> How is the platform structured and why?

### `03-development`

Answers:

> How is software developed, maintained and released?

### Decision

**KEEP**

No structural change is required.

Future documentation should preserve this distinction.

---

# 21. D3 — Prompts vs Official Documentation

The Phase 2 prompt structure intentionally mirrors the EPIC lifecycle.

This is acceptable.

The distinction is:

```text
01-product/
        ↓
Official project/product knowledge

05-prompts/
        ↓
Instructions for AI-assisted execution
```

### Rule

A prompt may reference an official rule, but should not become the only place where a permanent project rule exists.

Permanent project knowledge belongs in the appropriate official documentation layer.

Prompts explain:

> How should AI execute a task?

Official documentation explains:

> What is true about the project?

### Decision

**KEEP**

The prompt system will be expanded in a dedicated future phase.

---

# 22. D3.1 — Consolidated Documentation Decisions

This section consolidates the structural decisions resulting from the documentation review.

The purpose is not to eliminate every overlap between documents.

The purpose is to establish clear responsibility boundaries so that intentional overlap does not become duplication or contradiction.

---

## 22.1 Product Roadmap

### Decision

**KEEP `06-product-evolution/roadmap/product-roadmap.md` as the canonical Product Roadmap.**

The previous roadmap under:

```text
01-product/overview/product-roadmap.md
```

was an older roadmap representation and has been removed.

The canonical roadmap is now:

```text
06-product-evolution/roadmap/product-roadmap.md
```

### Responsibility

The Product Evolution roadmap represents:

- product evolution;
- future direction;
- sequencing;
- product initiatives;
- relationship with Product EPICs.

`01-product/overview/` should describe the current product rather than maintain a competing roadmap.

### Rule

There should be one canonical Product Roadmap.

---

## 22.2 Product EPIC Portfolio vs Detailed EPIC Lifecycle

### Decision

**KEEP WITH RULE** (D3.4 — completed).

```text
06-product-evolution/product-epics/
```

and:

```text
01-product/epics/
```

represent different levels of Product EPIC documentation. Neither layer is removed or merged.

### Operational rule (final)

`06-product-evolution/product-epics` is the canonical source for the **portfolio**, strategic intent and **planning status** of Product EPICs.

`01-product/epics` is the canonical source for **detailed content**, execution scope and **execution / lifecycle status**.

These layers may repeat high-level information, but the portfolio must summarize and point to the lifecycle when it exists.

The portfolio must **not** redefine the lifecycle.

### Status semantics

Do not convert Planning Status values into Execution Status values (or vice versa).

- Portfolio: use **Planning Status** (e.g. Planned).
- Lifecycle: use **Execution Status** (e.g. Draft).

They are different kinds of status. Do not invent new states; preserve supported current values.

### Product Direction vs Current Delivery Scope

When both are conceptually valid (e.g. EPIC-01):

- **Product Direction / North Star** — strategic ambition (e.g. mobile as primary platform).
- **Current Delivery Scope / first slice** — what the portfolio commits to deliver now (e.g. browser-usable first slice).

Do not erase one to force the documents to look identical.

### Related roadmaps and Business EPICs

- **Product Roadmap** (`06-product-evolution/roadmap/product-roadmap.md`) = sequencing / planning of Product EPICs.
- **Business Roadmap** (`06-product-evolution/roadmap/business-roadmap.md`) = sequencing / planning of Business EPICs.
- **Business EPICs** (`06-product-evolution/business-epics/`) = GTM / business initiatives — not copies of Product EPICs.
- `04-business` remains the canonical source for strategy, ICP, pricing, sales, discovery, onboarding and customer success.

### `06-product-evolution/product-epics/`

Represents the **strategic Product EPIC portfolio**.

It should answer:

> What EPICs exist, why they matter, what outcome they pursue and where they belong in the product evolution strategy?

This layer is responsible for:

- strategic scope;
- priority;
- **Planning Status**;
- expected outcome;
- relationship with product evolution;
- link to lifecycle when present.

### `01-product/epics/`

Represents the **detailed lifecycle of an individual EPIC**.

It should answer:

> How do we define, design, build, validate and document this specific EPIC?

This layer contains the detailed lifecycle:

```text
01-vision.md
02-business-rules.md
03-ux-flows.md
04-technical-design.md
05-sprint-planning.md
06-architecture-review.md
07-implementation.md
08-validation.md
09-documentation.md
```

### Synchronization Rule

The two representations must not develop conflicting strategic scopes.

If detailed EPIC work reveals a change in product scope or strategic intent:

```text
01-product/epics/
        ↓
Product decision
        ↓
06-product-evolution/product-epics/
        ↓
Updated portfolio definition
```

The detailed EPIC lifecycle remains responsible for execution.

---

# 22.2.1 D3.4 — EPIC Portfolio × Lifecycle (COMPLETED)

### Human decision

**KEEP WITH RULE**

### Action taken

- Clarified EPIC-01 portfolio vs lifecycle (Planning Status / Execution Status; North Star vs first slice).
- Linked portfolio ↔ lifecycle with correct relative paths.
- Fixed broken PascalCase / legacy paths under `06-product-evolution` README, product-epics, business-epics and roadmaps.
- Did not create lifecycles for EPICs that lack them; did not merge layers; did not restore `01-product/overview/product-roadmap.md`.

### Decision status

**COMPLETED**

---

## 22.3 Sales Strategy vs Sales Process vs Sales Playbook

### Decision

**KEEP WITH RULE** (D3.5 — completed).

Do not move, merge, or delete the sales documents. Keep process and funnel as separate files.

The hierarchy is:

```text
04-business/sales/
│
├── sales-strategy.md
├── sales-process.md
├── sales-funnel.md
├── objection-handling.md
└── sales-conversation-library.md
        ↓
07-operations/playbooks/
└── sales-playbook.md
```

Canonical ICP remains:

```text
04-business/strategy/ideal-customer-profile.md
```

### Final responsibility boundary

| Document | Responsibility |
|----------|----------------|
| `sales-strategy.md` | Commercial strategy and positioning |
| `sales-process.md` | Official sales process and exit criteria |
| `sales-funnel.md` | Funnel measurement and bottlenecks |
| `objection-handling.md` | Objections and response knowledge |
| `sales-conversation-library.md` | Conversation learning |
| `ideal-customer-profile.md` | Canonical ICP |
| `sales-playbook.md` | Operational execution of the sales process only |

### `04-business/sales/`

Represents the business-level sales system.

It should answer:

> What is our commercial strategy and what rules govern the sales process?

### `07-operations/playbooks/sales-playbook.md`

Represents operational execution.

It should answer:

> How should someone execute the process in practice?

The playbook may contain preparation, execution sequence, practical scripts, checklists, demo handoff, and follow-up procedures.

### Rule

`sales-playbook.md` must not redefine strategy, process, ICP, commercial positioning, or funnel metrics.

When those concepts are needed operationally, the playbook must reference the corresponding business documents.

Process and funnel remain separate:

- **Process** = how the opportunity progresses.
- **Funnel** = how conversion and bottlenecks are measured.

The hierarchy is:

```text
Strategy
    ↓
Process
    ↓
Playbook
```

---

# 22.3.1 D3.5 — Sales Strategy × Process × Playbook (COMPLETED)

### Human decision

**KEEP WITH RULE**

### Action taken

- Rewrote `sales-playbook.md` as operational execution only; removed competing ICP / strategy / “official process” / duplicated indicators.
- Added explicit Process ↔ Funnel stage map and cross-references in `sales-process.md` and `sales-funnel.md`.
- Added minimal operations pointer from `sales-strategy.md` to the playbook.
- Left objection-handling and conversation library in `04-business/sales/` (referenced, not merged).

### Decision status

**COMPLETED**

---

## 22.4 Discovery Architecture

### Decision

**Updated by D3.2 — REMOVE `06-product-evolution/discoveries/`.**

Canonical flow:

```text
07-operations/
        ↓
04-business/customer-discovery/
        ↓
01-product/pdr/
   and/or
06-product-evolution/ideas/
   and/or
06-product-evolution/product-epics/
```

### `07-operations/`

Represents **how discovery is conducted**.

Example:

```text
customer-interview-playbook.md
```

This layer contains:

- interview procedure;
- preparation;
- execution;
- practical guidance;
- interview rituals.

### `04-business/customer-discovery/`

Represents **business evidence collected through discovery**.

This includes:

- assumptions;
- field observations;
- validated learnings;
- interview templates;
- evidence generated from customer interactions.

This is the canonical evidence layer for business discovery.

### Product evolution after evidence

Product implications do **not** use a dedicated `06-product-evolution/discoveries/` folder.

They land in:

- `01-product/pdr/` — formal product decisions;
- `06-product-evolution/ideas/` — early opportunities;
- `06-product-evolution/product-epics/` — portfolio themes.

### Rule

```text
07 = how we discover
04 = what we learned
01/06 = what it may mean for product (PDR / ideas / product-epics)
```

Do not recreate `06-product-evolution/discoveries/` as a second repository for raw customer evidence.

---

## 22.5 Brand Architecture

### Decision

**KEEP WITH RULE** (D3.7 — completed).

Do not create, move, merge, or remove the Brand documents.

```text
01-product/overview/brand.md
04-business/strategy/brand-philosophy.md
04-business/strategy/positioning.md
adr/ADR-003-Brand-Architecture.md
```

They represent different levels of responsibility.

### Final responsibility boundary

| Document | Responsibility |
|----------|----------------|
| `brand-philosophy.md` | Long-term brand identity / philosophy |
| `positioning.md` | Current market positioning and perception |
| `ADR-003-Brand-Architecture.md` | Brand architecture decision (master brand + modules) |
| `01-product/overview/brand.md` | Product brand expression (visual, UI, experience principles) |

### Rule

- **Beauty current market focus ≠ permanent Nexa brand identity.**
- Brand Philosophy content remains intentionally open for a dedicated human brainstorming phase.
- Product `brand.md` must not redefine market positioning.
- ADR-003 records architecture only; it is not Brand Strategy / Philosophy.

### Hierarchy

```text
Brand Philosophy
        ↓
Brand Architecture Decision (ADR-003)
        ↓
Brand Expression in Product (brand.md)
```

Positioning sits beside Brand Philosophy as **current market** perception — not as a substitute for long-term identity.

These documents should not become three versions of the same brand statement.

---

# 22.5.1 D3.7 — Brand Responsibility (COMPLETED)

### Human decision

**KEEP WITH RULE**

### Action taken

- Removed competing Positioning block from `01-product/overview/brand.md`; linked positioning + ADR-003.
- Left `brand-philosophy.md` as canonical placeholder without inventing philosophy content.
- Minimal related-docs pointer on ADR-003; renamed ADR-003 entry in `adr/README.md` to Brand Architecture.
- Clarified Positioning vs Brand Philosophy in `positioning.md`.

### Decision status

**COMPLETED** (documentation boundaries). Brand Philosophy brainstorming remains open.

---

## 22.6 Commission Documentation

### Decision (historical)

**KEEP the commission documents separate for now.**

Superseded in content discipline by **D3.3** below (still three files; responsibilities enforced).

### Documents

```text
01-product/domain-models/
├── commissions-rules.md
├── commissions-payroll.md
└── commission-lifecycle.md
```

### Responsibilities (D3.3 — KEEP WITH RULE)

#### `commissions-rules.md`

> Business rules, configuration, eligibility and commission policy.

#### `commissions-payroll.md`

> Liquidation, folha/payment, financial synchronization, pay/reverse and technical detail for that domain.

#### `commission-lifecycle.md`

> Real commission lifecycle states confirmed in the current system (no aspirational approval states).

### Rule

Do not let the three files become competing sources for the same facts.

- Policy/listing mode definitions → rules
- Sync formulas, pay/estorno APIs, table mechanics → payroll
- State transitions on the attendance commission line → lifecycle

### Location

Files remain under `01-product/domain-models/`.

The exact **future** location of `commissions-payroll.md` remains deliberately open for a later architecture review. **No move** was performed in D3.3.

---

# 22.6.1 D3.3 — Commission Documentation (COMPLETED)

### Human decision

**KEEP WITH RULE**

### Action taken

- Realigned `commissions-rules.md` to business rules / configuration / policy.
- Realigned `commissions-payroll.md` to liquidation / folha / APIs; fixed link to `./commissions-rules.md`.
- Rewrote `commission-lifecycle.md` to verified states (`comissao` snapshot, `finalizada`, listing eligibility, `comissao_paga_em`, estorno).

### Decision status

**COMPLETED** (content responsibilities). Location of payroll doc remains open (see Remaining Human Decisions).

---

## 22.7 Pricing vs Monetization vs Packaging

### Decision

**KEEP WITH RULE** (D3.6 — completed).

Do not merge the three documents. Do not invent list prices in documentation until they are intentionally defined.

The intended distinction is:

```text
pricing-strategy.md
        ↓
Pricing principles and (when they exist) amounts / pricing rules

monetization-strategy.md
        ↓
How Nexa captures revenue (mechanisms)

packaging.md
        ↓
What is included in each commercial offer
```

### Final responsibility boundary

| Document | Responsibility |
|----------|----------------|
| `pricing-strategy.md` | Principles, criteria, discount/reajuste rules and price amounts when defined |
| `monetization-strategy.md` | Revenue capture mechanisms; **canonical** future revenue opportunities |
| `packaging.md` | Commercial composition of offers/plans |
| `business-model.md` | High-level business vision — summarize revenue; do not duplicate monetization detail |
| `sales/` + sales playbook | Consume pricing/packaging; never redefine them |

### Rule

- **Monetization** = mechanism of revenue capture
- **Packaging** = composition of the offer
- **Pricing** = principles and price amounts/rules
- **Business Model** = high-level vision
- **Sales** = consumer, not source of truth

`packagin.md` was renamed to `packaging.md`. No price table was created. Future revenue opportunities have monetization as the canonical source.

Setup / implementation:

- mechanism → monetization
- included vs separate in the offer → packaging
- amount (when defined) → pricing

At the current stage, future pricing tiers remain a hypothesis until validated by the market.

---

# 22.7.1 D3.6 — Pricing × Monetization × Packaging (COMPLETED)

### Human decision

**KEEP WITH RULE**

### Action taken

- Renamed `packagin.md` → `packaging.md`.
- Clarified boundaries across pricing, monetization, packaging, and business-model.
- Pointed Sales playbook at canonical pricing/packaging files without inventing prices.

### Decision status

**COMPLETED**

---

## 22.8 README Ownership / Navigation

### Decision

**KEEP WITH RULE** (D3.8 — completed). Approach: **HYBRID**.

### Canonical README rule

README files are **navigation and ownership maps**, not duplicate sources of truth.

Each top-level `docs/` area should have a lean README covering map, ownership, canonical sources, boundaries, and navigation — without duplicating strategy, product specs, or implementation detail.

### Action taken

- Rewrote root `docs/README.md` as the documentation navigation entry point (canonical Q→location table).
- Created lightweight `01-product/README.md` and `07-operations/README.md`.
- Corrected `00-governance`, `03-development`, `04-business`, and `adr` README navigation.
- Minimal updates to `02-architecture`, `05-prompts`, and `06-product-evolution` (portfolio/lifecycle rules retained).

### Recorded ownership

- Root README = documentation navigation entry point
- `01-product` and `07-operations` have dedicated lightweight READMEs
- `06-product-evolution` retains portfolio/lifecycle rules
- `04-business` retains business ownership
- `adr` README links to actual ADR files

### Decision status

**COMPLETED**

---

# 22.8.1 D3.8 — README Ownership / Navigation (COMPLETED)

### Human decision

**KEEP WITH RULE** (HYBRID)

### Decision status

**COMPLETED**

---

# 22.9 D3.9 — Final Consistency Audit / Fixes (COMPLETED)

### Human decision

Apply final fixes from D3.9 audit (no reopen of D3.2–D3.8).

### Action taken

- Fixed broken operational links in `03-development/engeneering/go-live-checklist.md` → commissions domain-models + `02-architecture/deployment/deployment.md`.
- Normalized portfolio EPICs 02–06: `## Status` → `## Planning Status` (values unchanged).
- Closed Remaining Human Decision on ICP cleanup in other playbooks (audit confirmed no competing ICP definitions under `07-operations`).

### Decision status

**COMPLETED**

Open human decisions that remain: `commissions-payroll.md` location; Brand Philosophy **content**.

---

# 23. D3.1 Final Structural Principle

The review should optimize for **clear responsibility**, not for the minimum possible number of documents.

Intentional duplication of concepts across different abstraction levels is acceptable when each document has a distinct purpose.

The governing rule is:

```text
One concept
    ↓
One canonical definition per responsibility layer
    ↓
Other documents reference or operationalize it
    ↓
No competing definitions
```

Therefore:

- strategic documents define strategy;
- operational documents define execution;
- product documents define product behavior;
- architecture documents define architectural decisions;
- Product Evolution documents define future product direction;
- evidence repositories preserve discovery evidence;
- playbooks operationalize established processes.

A document should be removed, merged or moved only when its responsibility is demonstrably redundant or incorrectly assigned.

---

# 24. Current Proposed Structural Changes

## Approved

### Completed

```text
04-business/decision-framework.md
        ↓
04-business/strategy/decision-framework.md
```

This move has already been executed.

### Removed

```text
01-product/epics/epic-01-mobile-foundation/changelog.md
01-product/epics/epic-01-mobile-foundation/release-notes.md
```

These files were empty and duplicated the responsibility of centralized release management.

### Removed

```text
06-product-evolution/ideas/future-epics.md
```

Its responsibility was already covered by the individual documents under `06-product-evolution/ideas/`.

### Removed

```text
01-product/overview/product-roadmap.md
```

This was an outdated roadmap representation.

The canonical roadmap is now:

```text
06-product-evolution/roadmap/product-roadmap.md
```

---

## Keep — No Structural Change

### Commission Documentation

```text
01-product/domain-models/commissions-rules.md
01-product/domain-models/commissions-payroll.md
01-product/domain-models/commission-lifecycle.md
```

These documents have distinct intended responsibilities.

The exact future location of `commissions-payroll.md` remains under review.

### Deployment Documentation

```text
02-architecture/deployment/deployment.md
02-architecture/deployment/dokploy.md
```

These documents have different responsibilities.

### Product EPIC Portfolio

```text
06-product-evolution/product-epics/
```

Keep this structure.

It represents the strategic Product EPIC portfolio.

### Detailed Product EPIC

```text
01-product/epics/
```

Keep this structure.

It represents the complete lifecycle of individual Product EPICs.

### Prompt Placeholders

The currently empty files under:

```text
05-prompts/
```

should remain empty until the dedicated Prompt System Phase.

---

## Investigate Later

```text
01-product/domain-models/commissions-payroll.md
```

Determine whether its current location remains appropriate or whether its technical/operational responsibility should be represented elsewhere.

No move should be made until the appropriate destination is clearly defined.

---

# 25. D3 Review Outcome

The Content & Responsibility Review has now established the main responsibility boundaries.

The major findings are not all defects.

Several represent intentional layering:

```text
Strategy
    ↓
Process
    ↓
Operations

Discovery Method
    ↓
Business Evidence
    ↓
Product Implication

Product EPIC Portfolio
    ↓
Detailed EPIC Lifecycle

Brand Philosophy
    ↓
Brand Architecture
    ↓
Product Expression
```

The remaining work is therefore refinement rather than restructuring.

---

# 26. Remaining Human Decisions

The following topics remain open for focused review:

1. Final location of `commissions-payroll.md` (architecture placement only — content responsibilities closed in D3.3).
2. Brand Philosophy **content** — dedicated human brainstorming (document location and boundaries closed in D3.7; do not invent content until that phase).

Resolved elsewhere:

- **D3.2** — `06-product-evolution/discoveries/` → **REMOVE** (completed).
- **D3.3** — Commission documentation → **KEEP WITH RULE** (completed; no file move).
- **D3.4** — EPIC Portfolio × Lifecycle → **KEEP WITH RULE** (completed).
- **D3.5** — Sales Strategy × Process × Playbook → **KEEP WITH RULE** (completed).
- **D3.6** — Pricing × Monetization × Packaging → **KEEP WITH RULE** (completed; `packagin.md` → `packaging.md`; no price table created).
- **D3.7** — Brand Responsibility → **KEEP WITH RULE** (completed; Brand Philosophy brainstorming remains open).
- **D3.8** — README Ownership / Navigation → **KEEP WITH RULE** (completed; HYBRID).
- **D3.9** — Final Consistency Audit / Fixes → **COMPLETED** (broken go-live links fixed; portfolio Planning Status normalized; ICP playbook cleanup closed — no competing ICP in `07-operations`).

These remaining items should be resolved before D3 is considered fully closed.

---

# 27. Intentional Future Work

The following work is intentionally postponed.

## Prompt System

The `05-prompts/` system will receive a dedicated phase after documentation architecture stabilization.

That phase will define:

- prompt methodology;
- Portuguese development prompts;
- Cursor workflows;
- context loading;
- implementation prompts;
- debugging prompts;
- refactoring prompts;
- code review prompts;
- UI reuse prompts;
- drawer/component reuse examples;
- daily developer workflows.

Empty prompt files are therefore not considered defects in the current review.

## Brand Philosophy

A dedicated brainstorming session will be performed later.

The objective is to define Nexa's permanent identity without limiting the company to the current Beauty vertical.

## Notion Operating System

A future operational workspace should support:

- CRM;
- customer visits;
- ICP scoring;
- sales pipeline;
- discovery notes;
- follow-ups;
- customer learning;
- customer success.

This should be designed after the documentation architecture is stable.

---

# 28. Real-World Validation Case — Physiotherapy Clinic

A real physiotherapy / osteopathy clinic is being treated as a future validation case for Nexa's multi-vertical architecture.

The case should NOT change the current Phase 2 focus on Beauty.

Potential future discovery areas include:

- patient records;
- anamnesis;
- clinical assessments;
- treatment evolution;
- appointment management;
- home appointments.

The case should follow the same methodology as any future vertical:

```text
Real-World Observation
        ↓
Customer Discovery
        ↓
Field Observations
        ↓
Assumptions
        ↓
Validated Learnings
        ↓
Business / Product Decision
        ↓
PDR
        ↓
Future Vertical EPIC
```

No Clinic Module should be created based solely on this case.

---

# 29. Review Status

Current phase:

```text
D1 — Structure Review
D2 — Responsibility and Content Review
D3 — Content & Responsibility Review
D3.1 — Consolidated Documentation Decisions
```

Status:

**In Progress**

Completed:

- Top-level structure review.
- Responsibility boundaries for major documentation areas.
- Structural cleanup.
- Release documentation consolidation.
- Roadmap canonicalization.
- Product EPIC portfolio vs lifecycle distinction.
- Sales strategy vs operational playbook distinction.
- Discovery layer distinction.
- Brand layer distinction.
- Prompt placeholder rule.
- Consistency Check.

---

# 30. Next Review

Before proceeding to D4 — Terminology & Naming:

1. Resolve the remaining human decisions listed in section 26.
2. Apply only the structural/content changes explicitly approved.
3. Run a new consistency check after those changes.
4. Confirm that no new duplication or broken references were introduced.
5. Then begin terminology and naming review.

No new documentation should be created solely to resolve a perceived gap until the existing documentation has been fully reviewed.

---

# 31. Final Review Principle

The objective of this review is not to maximize the amount of documentation.

The objective is to create the smallest documentation system that provides enough clarity to support consistent decisions.

Documentation should earn its place.

If a document does not provide a unique and useful responsibility, it should be consolidated, moved or removed.

The final architecture should optimize for:

```text
Clarity
+
Traceability
+
Evidence
+
Decision Quality
-
Unnecessary Complexity
```
