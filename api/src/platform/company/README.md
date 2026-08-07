# Company (Platform)

## What Company represents

In Nexa, a **Company** is the logical business account (tenant) that will own users, configuration, and business data across vertical modules (Beauty, Clinic, etc.).

This is a **platform** capability (ADR-006), not a Beauty domain rule and not the Nexa brand name.

## Relationship to multi-tenant architecture

Per ADR-002 and Tenant-Strategy:

- Current runtime: **single tenant** (one deployment = one business dataset).
- Future: shared database / shared application with **logical isolation via `company_id`**.

Sprint 4 only establishes the **type-level contract** under `platform/company/`. It does **not** introduce multi-tenancy.

## Current limitations

- No `companies` table and no `company_id` columns.
- JWT / auth have no company claim or context resolver.
- WhatsApp `nome_empresa` / `numero_salao` are branding fields on a singleton config — **not** the Company entity.
- Seed, admin bootstrap, and global unique constraints still assume one organization.
- Types and constants in this folder are **not wired** into routes or services.

## Files

| File | Role |
|------|------|
| `company.types.ts` | Planned `Company`, `CompanyId`, `CompanyContext` shapes |
| `company.constants.ts` | Stable markers (`COMPANY_ENTITY`, `COMPANY_STATUSES`) |
| `company.context.ts` | Stub for future request-scoped resolution (no functions) |
| `DECISIONS.md` | Design notes and migration milestones |

## Future migration roadmap (not this sprint)

1. Persist `companies` (schema + migration).
2. Backfill one legacy company for the current dataset.
3. Add `company_id` to business entities (dedicated multi-tenant sprint).
4. Attach company to JWT / request context.
5. Scope queries and uniqueness per company.
6. Move per-company config (e.g. WhatsApp) off the singleton model.

## Out of scope (Sprint 4)

- Multi-tenancy implementation
- Database schema changes
- Middleware, services, repositories, DI
- Auth behavior or HTTP/API contract changes
- Beauty business rules
