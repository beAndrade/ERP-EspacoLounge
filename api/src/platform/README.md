# Platform

## Purpose

Contains SaaS platform capabilities shared across every business module.

## Contains

- Authentication (`auth/` — Sprint 3 foundation)
- Authorization
- Users
- Tenants
- Billing
- Subscriptions
- Notifications
- Audit
- File Management

## Auth (Sprint 3)

Runtime auth primitives live under `platform/auth/` (JWT, guard, admin PIN, login rate limit).

See [`auth/README.md`](auth/README.md) for temporary coupling to `services/auth-domain` and compatibility reexports in `lib/`.

## Must NOT contain

- Beauty-specific logic
- Scheduling
- Products
- Customers
- Financial rules

## Dependencies

Platform may depend on Core, Shared and Infrastructure.

Business modules may depend on Platform.
