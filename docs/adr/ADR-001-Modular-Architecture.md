# ADR-001 — Adopt Modular Architecture

Status

Accepted

Date

2026-08-05

---

## Context

The project started as an ERP built specifically for beauty salons.

As the product vision evolved, Nexa became a platform intended to support multiple business segments.

Continuing with a single business-specific architecture would create duplicated code and limit future scalability.

---

## Decision

Adopt a modular architecture composed of:

- Core
- Shared
- Features
- Modules

Business-specific logic belongs only inside Modules.

The Core must remain independent from business domains.

---

## Alternatives Considered

1. Independent repositories for each industry.

Rejected due to code duplication.

2. Copying the Beauty project to create new products.

Rejected due to maintenance complexity.

3. Modular architecture.

Accepted.

---

## Consequences

Positive

- Better scalability.
- Code reuse.
- Easier maintenance.
- Cleaner architecture.

Negative

- Higher initial architectural complexity.

---

## Future

Every new business segment will become a Module instead of a new application.