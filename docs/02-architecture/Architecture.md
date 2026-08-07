# Architecture

# Purpose

This document defines the architectural principles of the Nexa Platform.

Every new feature must respect these principles.

The objective is to build a scalable SaaS platform capable of supporting multiple business modules without code duplication.

---

# High-Level Architecture

Nexa Platform

├── Core
├── Shared
├── Features
├── Modules
└── Infrastructure

---

# Core

The Core contains framework-independent platform capabilities (middleware base, config, logging abstractions, etc.).

SaaS capabilities such as Authentication and **Companies** live under the **Platform** layer (ADR-006), not Core.

Core must NEVER contain business-specific logic.

---

# Shared

Reusable components used across every module.

Examples

- UI Components
- Buttons
- Inputs
- Tables
- Cards
- Modals
- Date Utilities
- API Clients
- Validators
- Icons

Shared must NEVER import Modules.

---

# Features

Business features available to every module.

Examples

- Scheduling
- Financial
- Reports
- CRM
- Inventory
- Marketing
- Dashboard

Features should be configurable but never business-specific.

---

# Modules

Modules contain business rules.

Current

- Beauty

Future

- Sports
- Clinic
- Food
- Pet
- Academy

Modules may use Core, Shared and Features.

Core must never import Modules.

---

# Infrastructure

Responsible for:

- Database
- APIs
- Authentication
- Storage
- Cache
- Deployment
- Monitoring
- Logging

---

# Dependency Rules

Allowed

Module → Feature

Module → Shared

Module → Core

Feature → Shared

Feature → Core

Shared → Core

Forbidden

Core → Module

Shared → Module

Core → Feature

Modules communicating directly with other modules

---

# Long-term Goal

Transform Nexa into a modular SaaS platform where every new business segment becomes only a new Module.

The Core should remain stable regardless of business domain.

---

# Legacy Folder Mapping

The `api/src/lib` folder is considered legacy and will be gradually removed during the migration.

Each file has a predefined destination in the new architecture.

| Legacy File | Destination |
|-------------|-------------|
| admin-pin.ts | platform/auth *(moved Sprint 3)* |
| auth-guard.ts | platform/auth *(moved Sprint 3)* |
| jwt.ts | platform/auth *(moved Sprint 3)* |
| login-rate-limit.ts | platform/auth *(moved Sprint 3)* |
| descricao-lista.ts | modules/beauty/domain *(moved Sprint 2)* |
| envelope.ts | shared/utils |
| foto-url.ts | shared/utils |
| normalize-comissao.ts | modules/beauty/shared *(moved Sprint 2)* |
| normalize-money-text.ts | shared/utils |
| normalize-percent-text.ts | shared/utils |
| periodo-mes.ts | shared/utils |
| telefone-br.ts | shared/utils |
| sql-local-datetime.ts | shared/utils |
| pg-error-message.ts | infrastructure/database *(moved Sprint 5)* |

No file should remain permanently inside `lib`.

The folder exists only to support the migration process.

---

# Current API Structure

The backend is being migrated from a service-oriented structure to a modular SaaS architecture.

Current target structure:

```text
api/src/
├── core/
├── shared/
├── platform/
│   ├── auth/            (jwt, auth-guard, admin-pin, login-rate-limit)
│   └── company/         (types foundation; no runtime tenancy)
├── features/
├── modules/
│   └── beauty/
│       ├── domain/           (descricao-lista)
│       ├── application/      (catalog-lists)
│       ├── infrastructure/
│       ├── presentation/
│       └── shared/           (normalize-comissao)
├── infrastructure/
│   ├── database/        (pg-error-message)
│   └── integrations/whatsapp/
├── services/        (legacy)
├── lib/             (legacy)
├── db/              (legacy)
├── integrations/    (legacy)
├── seed/            (legacy)
└── etl/             (legacy)
```

---

## Layer Responsibilities

| Layer | Responsibility |
|--------|----------------|
| Core | Framework-independent platform capabilities |
| Shared | Reusable business-independent building blocks |
| Platform | SaaS platform capabilities shared across all business modules |
| Features | Generic business capabilities reusable by multiple modules |
| Modules | Business-specific domains (Beauty, Clinic, etc.) |
| Infrastructure | Adapters to external systems |
| Services | Legacy business services being migrated |
| Lib | Legacy utilities being migrated |

---

## Migration Status

The new architecture has been created.

Current implementation status:

- Core: Scaffold (no dedicated lib modules migrated yet)
- Shared: Partially migrated
- Platform: Auth foundation + Company type foundation (`platform/company/`; no multi-tenancy yet)
- Features: Scaffold
- Infrastructure: Partially migrated (WhatsApp providers + database `pg-error-message`)
- Beauty Module: Foundation + application catalog lists (thin reexports in services/queries.ts)
- Design System: Foundation (`src/app/design-system/` — token mirrors + docs; not wired to runtime CSS)

Business logic remains in the legacy folders until future migration sprints.