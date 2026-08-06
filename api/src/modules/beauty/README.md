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

Runtime behavior, HTTP routes, and DB schema are unchanged. Consumers still live under legacy `services/` and `seed/` and import these paths directly.

## Deferred: catalog / query APIs

These functions **belong to Beauty** but remain in `api/src/services/queries.ts` until a dedicated follow-up sprint (after this foundation is stable). Do **not** add reexports or compatibility shims in Sprint 2.

| Function | Future destination |
|----------|--------------------|
| `listRegrasMegaApi` | `application/` |
| `listPacotesApi` | `application/` |
| `listPacotesQueratinaApi` | `application/` |
| `listRegrasMegaQueratinaApi` | `application/` |
| `listCabelosApi` | `application/` |

## Boundaries

- Prefer importing from `modules/beauty/...` (or the module barrel) instead of legacy `lib/` for Beauty helpers.
- Do not put generic platform utilities here — use `shared/` or `platform/` at API root.
- Angular Feature UI for Beauty remains under `src/app/features/` until a later frontend module sprint.
