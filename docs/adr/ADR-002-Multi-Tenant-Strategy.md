# ADR-002 — Shared Database Multi-Tenant Strategy

Status

Accepted

Date

2026-08-05

---

## Context

The platform is expected to serve multiple companies using the same application.

Infrastructure costs should remain low while maintaining data isolation.

---

## Decision

Adopt a Shared Database / Shared Application multi-tenant architecture.

Each business will be represented by a Company.

Business data will eventually be isolated through company_id.

---

## Alternatives

Dedicated database per customer.

Rejected.

Dedicated application per customer.

Rejected.

Shared Database.

Accepted.

---

## Consequences

Positive

- Lower infrastructure cost.
- Easier deployment.
- Simpler updates.
- Better scalability.

Negative

Requires strict data isolation rules.

---

## Future

Introduce company_id to business entities during the multi-tenant migration.