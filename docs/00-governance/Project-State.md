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
| Sprint 3 | ⏳ Planned | Core Foundation |
| Sprint 4 | ⏳ Planned | Company Entity |
| Sprint 5 | ⏳ Planned | Database Cleanup |
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

