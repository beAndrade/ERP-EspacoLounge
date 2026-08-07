# Platform

## Purpose

Contains SaaS platform capabilities shared across every business module.

## Contains

- Authentication (`auth/` — Sprint 3 foundation)
- Company / Tenants (`company/` — Sprint 4 type foundation; no runtime tenancy yet)
- Authorization
- Users
- Billing
- Subscriptions
- Notifications
- Audit
- File Management

## Auth (Sprint 3)

Runtime auth primitives live under `platform/auth/` (JWT, guard, admin PIN, login rate limit).

See [`auth/README.md`](auth/README.md) for temporary coupling to `services/auth-domain` and compatibility reexports in `lib/`.

## Company (Sprint 4)

Type-level Company contract lives under `platform/company/` (no schema, no middleware, no query scoping).

See [`company/README.md`](company/README.md) and [`company/DECISIONS.md`](company/DECISIONS.md).

## Must NOT contain

- Beauty-specific logic
- Scheduling
- Products
- Customers
- Financial rules

## Dependencies

Platform may depend on Core, Shared and Infrastructure.

Business modules may depend on Platform.
