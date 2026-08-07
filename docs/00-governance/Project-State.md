# Project State

## Current Version

0.8.0

---

## Platform

Nexa Platform

---

## Current Module

Beauty

---

## Architecture

Transitioning from Monolithic to Modular

---

## Database

Single Tenant

---

## Documentation

Core Documentation Complete

Architecture Documentation In Progress

---

## Current Priority

Platform Refactoring

---

## Next Milestone

Core + Shared + Modules

---

## Current Sprint

Architecture Refactor

---

## Long-term Goal

Transform Nexa into a multi-module SaaS platform.

---

## Notes

This file should always reflect the current state of the project.

Update after every major milestone.

# Migration Progress

|   Sprint  |    Status    |               Description                |
|-----------|--------------|------------------------------------------|
| Sprint 1A | ✅ Completed | Created modular architecture scaffolding |
| Sprint 1B | ✅ Completed |   Begin migration of shared components   |
| Sprint 1C | ✅ Completed |       Frontend Architecture Cleanup      |
| Sprint 1D | ✅ Completed |               Lazy Routes                |
| Sprint 2 | ✅ Completed | Beauty Module Foundation |
| Sprint 2A | ✅ Completed | Beauty Application catalog lists |
| Sprint 3 | ✅ Completed | Core & Platform Foundation (auth) |
| Sprint 4 | ✅ Completed | Company Entity Foundation |
| Sprint 5 | ✅ Completed | Database Responsibility Cleanup |
| Sprint 6 | ⏳ Planned | Design System |

------

# Sprint 1A Completed

## Date

2026-08-06

## Objective

Create the new modular SaaS architecture without changing runtime behavior.

## Completed

- Created API architecture folders
- Created Angular modules folder
- Added architecture README files
- Added barrel exports
- Added Platform layer
- Added Infrastructure layer
- Added documentation for folder conventions
- Added ADR for Platform
- Added legacy folder mapping

## Validation

- Angular development build: Passed
- New index.ts lint: Passed
- Runtime changes: None

## Known Technical Debt

- services remains as legacy
- lib remains as legacy
- db remains as legacy
- integrations remains as legacy
- seed remains as legacy
- etl remains as legacy

Existing TypeScript errors were not introduced by Sprint 1A.

## Next Sprint

Sprint 1B

Begin gradual migration from the legacy architecture into the new modular structure.

---

# Sprint 1B Completed

## Date

2026-08-06

## Objective

Establish API architectural boundaries by migrating low-risk, business-independent files into the new modular structure without changing runtime behavior.

## Completed

- Migrated shared utility functions to `api/src/shared/utils`
- Migrated WhatsApp integration adapters to `api/src/infrastructure/integrations/whatsapp`
- Updated all affected imports
- Preserved existing API routes, business logic and database schema
- Validated architectural boundaries for Shared and Infrastructure
- Documented Evolution provider as technical debt

## Validation

- TypeScript typecheck: No new errors introduced (same 4 preexisting diagnostics)
- Legacy import paths: Clean
- Runtime changes: None
- Database schema changes: None
- Business logic changes: None

## Known Technical Debt

- `services/` remains as legacy
- `lib/` still contains authentication and domain-specific utilities
- `db/` remains as legacy
- `seed/` remains as legacy
- `etl/` remains as legacy
- WhatsApp interface is still coupled to `db/schema`
- Evolution remains the only supported WhatsApp provider due to active dependencies

## Next Sprint

Sprint 1C

Continue the frontend architecture cleanup by correcting Shared and Features boundaries without changing runtime behavior.

---

# Sprint 1C Completed

## Date

2026-08-06

## Objective

Establish frontend architectural boundaries by migrating reusable components and shared models without changing runtime behavior.

## Completed

- Migrated reusable Angular components to `shared/components`
- Migrated shared drawer types
- Extracted budget print models into `core/models`
- Updated all affected imports
- Removed Core → Feature dependency
- Preserved application routing and runtime behavior

## Validation

- Angular development build: Passed
- Lint: Passed
- Runtime changes: None
- Routing changes: None

## Known Technical Debt

- Shared hosts still depend on Feature components
- Beauty domain remains mixed inside Features
- Legacy drawers are not yet organized under `shared/components`
- SheetsApiService remains monolithic

## Next Sprint

Sprint 1D

Introduce lazy-loaded routes using `loadComponent` without changing business domains or application behavior.

---

# Sprint 1D Completed

## Date

2026-08-06

## Objective

Introduce lazy-loaded Angular routes using `loadComponent` while preserving runtime behavior and application routing.

## Completed

- Converted all page routes to `loadComponent`
- Removed static page imports from `app.routes.ts`
- Preserved guards, redirects, titles and routing structure
- Introduced lazy loading without changing business logic
- Reduced initial application bundle size

## Validation

- Angular development build: Passed
- Lint: Passed
- Runtime changes: None
- Routing changes: None
- 33 routes converted to `loadComponent`

## Known Technical Debt

- Global hosts remain eagerly loaded
- Beauty domain is still mixed inside Features
- Shared hosts still depend on Feature components
- SheetsApiService remains monolithic

## Next Sprint

Sprint 2

Begin migrating the Beauty business domain into `modules/beauty`.

---

# Sprint 2 Completed

## Date

2026-08-06

## Objective

Create the Beauty module foundation by introducing internal module layers and moving Beauty-specific helpers out of legacy `lib/`, without changing runtime behavior or extracting catalog queries yet.

## Completed

- Created Beauty internal structure: `domain/`, `application/`, `infrastructure/`, `presentation/`, `shared/`
- Moved `descricao-lista.ts` → `modules/beauty/domain/`
- Moved `normalize-comissao.ts` → `modules/beauty/shared/`
- Updated imports in `atendimentos-domain`, `finance-domain`, and `seed/run`
- Documented deferred catalog migration (`listRegrasMegaApi`, `listPacotesApi`, `listPacotesQueratinaApi`, `listRegrasMegaQueratinaApi`, `listCabelosApi` → future `modules/beauty/application/`)
- Preserved HTTP routes, API contracts, and database schema

## Validation

- TypeScript typecheck: No new errors introduced (same 4 preexisting diagnostics)
- Angular development build: Passed
- Runtime changes: None
- Routing changes: None
- API contract changes: None

## Known Technical Debt

- Beauty catalog/query functions remain in `services/queries.ts` (deferred extraction)
- `services/`, remaining `lib/`, `db/`, `seed/`, `etl/` still legacy
- Shared hosts still depend on Feature components (frontend)
- SheetsApiService remains monolithic
- HTTP routes still concentrated in god `index.ts`

## Next Sprint

Sprint 3 — Core Foundation

Continue platform core extraction per Migration-Plan (not Beauty catalog yet). Dedicated follow-up sprint should extract Beauty catalog lists into `modules/beauty/application/` after this foundation is stable.

---

# Sprint 2A Completed

## Date

2026-08-06

## Objective

Complete the Beauty module foundation by migrating Beauty catalog/query functions into `modules/beauty/application/` without changing runtime behavior.

## Completed

- Moved catalog list implementations into `modules/beauty/application/catalog-lists.ts`:
  - `listRegrasMegaApi`
  - `listPacotesApi`
  - `listPacotesQueratinaApi`
  - `listRegrasMegaQueratinaApi`
  - `listCabelosApi`
- Exported via application and beauty barrels
- Left thin temporary reexports in `services/queries.ts` (with compatibility comment) so `index.ts` imports stay unchanged
- Preserved HTTP routes, API contracts, and database schema
- No frontend changes

## Validation

- TypeScript typecheck: No new errors introduced (same 4 preexisting diagnostics)
- Angular development build: Passed
- Runtime changes: None
- Routing changes: None
- API contract changes: None

## Known Technical Debt

- Thin reexports still in `services/queries.ts` (temporary compatibility)
- HTTP routes still concentrated in god `index.ts` (presentation empty)
- Remaining `queries.ts` lists (`listProdutosApi`, `listServicosForApi`, etc.) still legacy
- Shared hosts still depend on Feature components (frontend)
- SheetsApiService remains monolithic

## Next Sprint

Sprint 3 — Core Foundation

Continue platform core extraction per Migration-Plan. Beauty presentation/route extraction remains a later dedicated sprint.

---

# Sprint 3 Completed

## Date

2026-08-06

## Objective

Begin consolidating the platform foundation by migrating low-risk authentication capabilities into `platform/auth/` without changing runtime behavior.

## Architecture classification (remaining `lib/`)

| File | Destination | Sprint 3 action |
|------|-------------|-----------------|
| `jwt.ts` | Platform (`platform/auth`) | Migrated |
| `auth-guard.ts` | Platform (`platform/auth`) | Migrated |
| `admin-pin.ts` | Platform (`platform/auth`) | Migrated |
| `login-rate-limit.ts` | Platform (`platform/auth`) | Migrated |
| `periodo-mes.ts` | Shared (`shared/utils`) | Kept in `lib` |
| `sql-local-datetime.ts` | Shared (`shared/utils`) | Kept in `lib` |
| `normalize-money-text.ts` | Shared (blocked: imports `finance-domain`) | Kept in `lib` |
| `pg-error-message.ts` | Infrastructure (`infrastructure/database`) | Kept in `lib` |
| Core logger/config | Core | No dedicated files yet — Core stays scaffold |

## Completed

- Moved auth implementations to `api/src/platform/auth/`
- Added `platform/auth/README.md`, auth barrel, and platform barrel
- Updated imports in `api/src/index.ts` and `services/auth-domain.ts`
- Left thin temporary reexports in `api/src/lib/` for the four auth modules
- Preserved HTTP routes, API contracts, and database schema
- No frontend changes

## Validation

- TypeScript typecheck: No new errors introduced (same 4 preexisting diagnostics)
- Angular development build: Passed
- Runtime changes: None
- Routing changes: None
- API contract changes: None

## Known Technical Debt

- Platform auth still type-imports `AuthUser` / `UsuarioRole` from `services/auth-domain`
- Finance HTTP path prefixes hardcoded in `admin-pin`
- Thin reexports in `lib/` for auth
- Remaining `lib/` utils (`periodo-mes`, `sql-local-datetime`, `normalize-money-text`, `pg-error-message`)
- Core still scaffold
- Login/user persistence still in legacy `services/auth-domain`
- Beauty presentation and remaining `queries.ts` still legacy

## Next Sprint

Sprint 4 — Company Entity

Per Migration-Plan. Shared util moves (`periodo-mes`, etc.) and unblocking `normalize-money-text` from `finance-domain` remain later dedicated work.

---

# Sprint 4 Completed

## Date

2026-08-06

## Objective

Establish the Company entity foundation as a Platform capability without implementing multi-tenancy or changing runtime behavior.

## Architecture analysis (single-company assumptions)

| Finding | Classification |
|---------|----------------|
| JWT / auth guard / admin PIN global | Platform |
| Admin bootstrap when `usuarios` empty | Platform |
| Global unique email; unscoped business tables | Future Company |
| WhatsApp singleton + `nome_empresa` / `numero_salao` | Future Company |
| Seed / DB name Espaço Lounge | Future Company |
| `SALAO_TIMEZONE` and Beauty “salão” helpers | Business Domain |
| God `index.ts` + domain services without tenant filter | Legacy |

Confirmed: no `companies` table and no `company_id` / `tenant_id` in schema.

## Completed

- Created `api/src/platform/company/` with:
  - `company.types.ts`, `company.constants.ts`, `company.context.ts` (stub)
  - `index.ts`, `README.md`, `DECISIONS.md`
- Exported Company from `platform/index.ts`
- Documented Company vs multi-tenant roadmap (ADR-002)
- No services, repositories, DB access, middleware, or runtime wiring
- No schema, route, auth, API contract, or frontend changes

## Validation

- TypeScript typecheck: No new errors introduced (same 4 preexisting diagnostics)
- Angular development build: Passed
- Runtime changes: None
- Routing changes: None
- Schema changes: None
- API contract changes: None

## Known Technical Debt

- Runtime remains single-tenant everywhere listed in the analysis
- Company types are unused by call paths (intentional)
- Multi-tenant `company_id` not introduced (deferred)
- Remaining Sprint 3 debts (auth types in services, `lib/` utils, etc.)

## Next Sprint

Sprint 5 — Database Cleanup

Per Migration-Plan. Do **not** introduce multi-tenant `company_id` in Sprint 5 unless explicitly rescoped; that remains a later dedicated multi-tenant migration after Company foundation is in place.

---

# Sprint 5 Completed

## Date

2026-08-06

## Objective

Improve database architecture by separating database infrastructure responsibilities from business responsibilities without changing runtime behavior or modifying the database schema.

## Database architecture audit (summary)

| Asset | Classification | Action |
|-------|----------------|--------|
| `db/schema.ts`, `db/index.ts`, `api/drizzle/`, drizzle.config | Database Infrastructure / Legacy bridge | Kept |
| `seed/` | Legacy | Kept |
| `services/queries.ts` | Legacy (+ Beauty reexports) | Kept |
| `pg-error-message.ts` | Database Infrastructure | Migrated |
| `sql-local-datetime`, `periodo-mes`, `normalize-money-text` | Shared (not DB infra) | Kept in `lib` |
| `company_id` / multi-tenant | Future Multi-Tenant | Not introduced |

## Completed

- Moved `pg-error-message.ts` → `infrastructure/database/`
- Added database barrels and `infrastructure/database/README.md` (architecture + Design Principles)
- Updated `api/src/index.ts` import
- Left thin temporary reexport in `lib/pg-error-message.ts`
- No schema, route, auth, API contract, or frontend changes

## Validation

- TypeScript typecheck: No new errors introduced (same 4 preexisting diagnostics)
- Angular development build: Passed
- Runtime changes: None
- Schema changes: None
- Routing / API contract changes: None

## Known Technical Debt

- `ensureSchemaPatches()` still mixed into `db/index.ts`
- Monolithic `schema.ts` (ADR-005 Core vs Module split deferred)
- Beauty constraint names inside infra error mapper
- Remaining `lib/` Shared helpers and legacy `queries.ts`
- Multi-tenant `company_id` still deferred

## Next Sprint

Sprint 6 — Design System

Per Migration-Plan (frontend). Database follow-ups (Shared datetime move, patch shrinkage, schema split, `company_id`) remain later dedicated work.

---

