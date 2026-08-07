# Company — Decisions (Sprint 4)

## Current state (single tenant)

The running product is a single-organization deployment:

- No `companies` table / no `company_id` on business rows.
- Auth (JWT, guard, admin PIN) is instance-global.
- WhatsApp config is a singleton with branding fields (`nome_empresa`, `numero_salao`).
- Seed and DB naming still reflect one salon dataset.

Sprint 4 does not change that runtime reality.

## Company as a platform contract

Company is defined here as a **Platform** contract (types + constants + docs), aligned with ADR-006 (Tenants under Platform) and ADR-002 (each business = Company).

Modules (Beauty, etc.) will eventually depend on Company for isolation; they must not own the Company entity.

## No runtime behavior

Artifacts in this folder must not alter:

- HTTP routes
- API contracts
- Authentication
- Database schema
- Query scoping

Until a later sprint explicitly wires Company into persistence and request context, **do not** import these types into production call paths “just because they exist.”

## Future migration milestones

1. Foundation (this sprint): types, constants, documentation.
2. Persistence: `companies` table + migration (still may remain single-row in practice).
3. Isolation: introduce `company_id` on business entities (ADR-002 future work).
4. Request context: resolve Company from JWT / session; enforce scoping.
5. Config per company: replace singleton branding/config patterns.

## Relation with ADR-002

[ADR-002 — Shared Database Multi-Tenant Strategy](../../../../docs/adr/ADR-002-Multi-Tenant-Strategy.md) decides:

- Shared DB + shared application.
- Each business represented by a **Company**.
- Isolation eventually through **`company_id`**.

This folder is the first code home for that decision. Introducing `company_id` remains a **later** multi-tenant migration, not Sprint 4.
