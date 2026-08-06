# ADR-005 — Database Strategy

Status

Accepted

Date

2026-08-05

---

## Context

The platform currently supports only the Beauty module.

Future modules must reuse as much of the data model as possible.

---

## Decision

Business-independent entities belong to the Core.

Business-specific entities belong to Modules.

Whenever possible, use generic structures instead of industry-specific tables.

---

## Principles

Prefer generic names.

Avoid duplicated tables.

Keep relationships explicit.

Use foreign keys.

Business interpretation belongs to Modules.

---

## Future

Support multi-tenant architecture.

Introduce company_id to business entities.

Separate Core entities from Module entities.

Avoid future database rewrites through incremental evolution.