# ADR-006 — Platform Layer

## Status

Accepted

---

## Context

Nexa is being built as a modular multi-tenant SaaS platform capable of supporting multiple business verticals (Beauty, Clinic, Pet, Barber, Academy, etc.).

Some capabilities belong to the SaaS platform itself rather than to any specific business domain.

Without a dedicated Platform layer, these capabilities would eventually be scattered across Core, Shared or individual Modules, increasing coupling and reducing maintainability.

---

## Decision

Introduce a dedicated `Platform` layer responsible for SaaS-wide capabilities.

Location:

api/src/platform

Platform represents application services that are shared across all business modules but are not business rules themselves.

---

## Responsibilities

The Platform layer may contain:

- Authentication
- Authorization
- Users
- Tenants
- Billing
- Subscriptions
- Permissions
- Notifications
- Audit
- File Management

---

## Non-Responsibilities

The Platform layer must never contain business rules from specific domains.

Examples that do NOT belong here:

- Appointments
- Customers
- Products
- Inventory
- Financial calculations
- Beauty rules
- Clinic rules
- Pet rules

Those belong inside their respective Modules.

---

## Dependencies

Platform may depend on:

- Core
- Shared
- Infrastructure

Business Modules may depend on Platform.

Platform must not depend on Modules.

---

## Consequences

Positive

- Clear separation between SaaS capabilities and business domains.
- Reduced coupling.
- Easier introduction of new business verticals.
- Better preparation for multi-tenancy.

Negative

- Additional architectural layer to maintain.
- Authentication and user management remain temporarily in legacy folders until future migration sprints.

---

## Migration Status

Current status:

- Platform folder created.
- No runtime code migrated yet.

Future work:

- Migrate authentication.
- Migrate authorization.
- Migrate user management.
- Migrate tenant management.