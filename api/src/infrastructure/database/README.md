# Database Infrastructure

## Purpose

Adapters and helpers for the database layer that are **not** business rules.

## Current contents

| File | Role |
|------|------|
| `pg-error-message.ts` | Maps common Postgres unique-violation errors to PT-BR API messages |

## Design Principles

This layer contains database infrastructure only.

It must never contain:

- Business rules
- Domain services
- Feature-specific SQL
- Platform business logic

Those responsibilities belong to Platform, Shared or Business Modules.

## Current database architecture (repo)

| Location | Responsibility |
|----------|----------------|
| `api/src/db/schema.ts` | Drizzle schema — source of truth for tables/columns |
| `api/drizzle/` + `meta/_journal.json` | Formal versioned migrations |
| `api/drizzle.config.ts` | Drizzle Kit configuration |
| `api/src/db/index.ts` | DB client / ORM handle + legacy `ensureSchemaPatches()` bridge |
| `api/src/seed/` | Legacy XLSX seed (single-organization dataset) |
| `api/src/services/` (+ Beauty `application/`) | Query / domain logic (not Infrastructure) |

Formal migrations + `schema.ts` remain the source of truth. `ensureSchemaPatches()` is a **compatibility bridge** for existing databases; new features must not rely on patches alone.

## What does **not** belong here

- Business queries (`services/queries.ts`, Beauty catalog lists)
- Schema ownership moves (keep `db/schema.ts` until a dedicated split sprint)
- Civil datetime helpers (`sql-local-datetime` → future Shared, not this folder)
- Seed scripts
- Multi-tenant / `company_id` wiring

## Known debt in this adapter

`pg-error-message` mentions Beauty constraint names (`atendimento_itens_uq_*`). That copy is temporary technical debt; ideal home later is closer to the Beauty module. Do not expand Beauty SQL here.

## Remaining legacy responsibilities

- Monolithic `schema.ts` (ADR-005 wants Core vs Module separation later)
- Large `ensureSchemaPatches()` in `db/index.ts`
- Remaining list/CRUD helpers in `services/queries.ts`
- Shared helpers still under `lib/` (`sql-local-datetime`, `periodo-mes`, `normalize-money-text`)

## Future multi-tenant impacts

Per ADR-002 / Sprint 4 Company foundation: isolation will eventually use `company_id`. **Sprint 5 does not** introduce `company_id`, change schema, or scope queries by company.

## Database migration roadmap

1. Keep formal Drizzle migrations as the only path for new schema changes.
2. Shrink / retire `ensureSchemaPatches` only when environments are migrate-clean (separate sprint).
3. Move Shared DB-adjacent utils (`sql-local-datetime`, etc.) in a Shared cleanup sprint — not into this folder.
4. Later: split Core vs Module schema (ADR-005); introduce `company_id` in a dedicated multi-tenant sprint.
5. Optionally relocate Beauty-specific unique-violation messages out of this adapter.
