# EPIC-04 — SaaS Runtime

## Status

Planned

## Goal

Turn Company from a type-level foundation into a real multi-tenant runtime: isolated data, company-aware auth context, and subscription-ready operations — without breaking the current single-tenant Beauty deployment until cutover is planned.

## Why it matters

ADR-002 and Tenant-Strategy define shared DB + `company_id`. Sprint 4 only added Platform Company types. Selling multiple companies requires runtime isolation.

## Outcomes

- `companies` persistence and request `CompanyContext`
- Business data scoped by `company_id` (incremental rollout)
- Auth/JWT carries company claim when ready
- Clear migration path for the legacy single-tenant dataset

## In scope

- Schema + formal Drizzle migrations for Company (when approved)
- Backfill strategy for the existing Espaço Lounge dataset as company #1
- Query scoping patterns and uniqueness per company
- Replace singleton assumptions (e.g. WhatsApp config) with per-company config over time
- Move AuthUser types closer to Platform (debt from Sprint 3) as needed

## Out of scope

- Dedicated database per customer (rejected in ADR-002)
- Building Clinic/Sports modules
- Changing Design System visuals
- AI features

## Dependencies

- Platform `company/` foundation (Sprint 4)
- Platform `auth/` foundation (Sprint 3)
- ADR-002, ADR-005, Tenant-Strategy, Database.md
- BUSINESS-EPIC-03 / onboarding needs for multi-account readiness

## Success metrics

- Two companies on one deployment with no cross-data leaks (test harness)
- Legacy tenant continues to operate after backfill
- New company provisioning checklist exists

## Related docs

- `docs/adr/ADR-002-Multi-Tenant-Strategy.md`
- `docs/02-architecture/Tenant-Strategy.md`
- `api/src/platform/company/README.md`
- `api/src/platform/company/DECISIONS.md`
- Product-Roadmap.md

## Risk notes

- Do not introduce `company_id` casually without a dedicated migration plan and validation.
- `ensureSchemaPatches` must not become the multi-tenant delivery mechanism — use formal migrations.
