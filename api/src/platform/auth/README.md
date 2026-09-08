# Platform Auth

## Purpose

SaaS-wide authentication and authorization primitives used by every business module.

This folder is the home for platform auth infrastructure under ADR-006 (Platform layer).

## Current components

| File | Role |
|------|------|
| `jwt.ts` | Sign / verify HS256 access tokens; extract Bearer token |
| `auth-guard.ts` | Public API paths + request authentication via JWT |
| `admin-pin.ts` | Admin PIN (`X-Admin-Pin`) and finance path PIN gate |
| `login-rate-limit.ts` | In-memory login failure rate limit by email and IP |

## Temporary dependency

These modules currently import **types only** from legacy `services/auth-domain.ts`:

- `UsuarioRole`
- `AuthUser`

That Platform → Services coupling is temporary technical debt. Runtime login/hash/user persistence remains in `auth-domain` for now.

## Future migration goals

- Move `AuthUser` / `UsuarioRole` (and related auth types) into Platform (or Shared) so Platform no longer imports `services/`.
- Eventually migrate login / user use-cases out of legacy `services/auth-domain.ts` into Platform application services.
- Decouple finance HTTP path prefixes in `admin-pin` from hardcoded route lists when modules own their presentation layer.

## Temporary compatibility reexports

Thin reexports remain under `api/src/lib/` for the four auth modules so any leftover `lib/` imports keep working during the migration.

**New authentication functionality must be implemented in `api/src/platform/auth/`**, not in legacy `lib/`.
