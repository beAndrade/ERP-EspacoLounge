# Beauty Module

First vertical module of the Nexa platform (salão / beauty operations).

## Layout

| Folder | Role |
|--------|------|
| `domain/` | Pure Beauty rules (no DB / HTTP) |
| `application/` | Use-cases and orchestration |
| `infrastructure/` | Beauty-specific persistence / adapters |
| `presentation/` | HTTP handlers when routes leave the god `index.ts` |
| `shared/` | Cross-cutting helpers inside Beauty only |

## Sprint 2 (foundation)

Moved into the module:

- `domain/descricao-lista.ts` — line description for Mega / Pacote / Queratina / Cabelo / Serviço
- `shared/normalize-comissao.ts` — commission text normalization for `atendimentos.comissao`

## Sprint 2A (application catalog)

Moved into `application/catalog-lists.ts`:

- `listRegrasMegaApi`
- `listPacotesApi`
- `listPacotesQueratinaApi`
- `listRegrasMegaQueratinaApi`
- `listCabelosApi`

Thin temporary reexports remain in `services/queries.ts` so existing imports (e.g. god `index.ts`) keep working. **New Beauty catalog functionality must be implemented in `application/`**, not in legacy `queries.ts`.

Runtime behavior, HTTP routes, and DB schema are unchanged.

## Boundaries

- Prefer importing from `modules/beauty/...` (or the module barrel) instead of legacy `lib/` / `services/` for Beauty helpers and catalog lists.
- Do not put generic platform utilities here — use `shared/` or `platform/` at API root.
- Angular Feature UI for Beauty remains under `src/app/features/` until a later frontend module sprint.
