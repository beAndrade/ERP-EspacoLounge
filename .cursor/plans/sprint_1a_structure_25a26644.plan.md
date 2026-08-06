---
name: Sprint 1A Structure
overview: Plano detalhado do Sprint 1A (somente estrutura de pastas Nexa). Zero mudanças de comportamento; aguarda aprovação antes de qualquer alteração de código.
todos:
  - id: 1a-create-front-modules
    content: Criar src/app/modules/ e modules/beauty/ + READMEs
    status: pending
  - id: 1a-create-api-layers
    content: Criar api/src/{core,shared,features,modules/beauty,infrastructure}/ + READMEs
    status: pending
  - id: 1a-verify-no-runtime
    content: Verificar que nenhum import/rota/serviço foi alterado; build ok
    status: pending
  - id: 1a-report
    content: "Relatório pós-1A: criados, debt, sugestões de doc (sem editar docs)"
    status: pending
isProject: false
---

# Sprint 1A — Project Structure (plano de migração)

**Status:** aguardando aprovação (nenhuma implementação até você confirmar).

**Fontes:** [START-HERE.md](docs/00-governance/START-HERE.md), [Migration-Plan.md](docs/02-architecture/Migration-Plan.md), [Architecture.md](docs/02-architecture/Architecture.md), [Development.md](docs/03-development/Development.md), ADRs 001–005.

**Inconsistência documentada (START-HERE):** a arquitetura exige camadas Core / Shared / Features / Modules; o front já tem `core/`, `shared/`, `features/`, mas **não existe** `modules/`. A API é flat (`services/`, `lib/`, `db/`) sem espelho das camadas Nexa. O [Migration-Plan.md](docs/02-architecture/Migration-Plan.md) nomeia o Sprint 1A, mas **não define a árvore de pastas** — este plano preenche esse gap.

---

## Current State

**Front** ([src/app/](src/app/)):

```
core/  features/  layout/  pages/  shared/  styles/
(+ app.component.*, app.config.ts, app.routes.ts)
```

Features atuais (nomes PT mantidos): agenda, agendamento-publico, categorias, clientes, comandas, configuracoes, estoque, financeiro, fornecedores, marcas, orcamentos, painel, profissionais, servicos.

**API** ([api/src/](api/src/)):

```
db/  etl/  integrations/  lib/  seed/  services/  index.ts
```

---

## Target State (após Sprint 1A)

Somente **scaffolding**. Código de negócio permanece onde está. Pastas novas = placeholders para sprints seguintes.

### Front

```
src/app/
  core/                 # já existe — intacto
  shared/               # já existe — intacto (limpeza = Sprint 1C)
  features/             # já existe — intacto (sem rename)
  modules/              # CRIAR
    beauty/             # CRIAR (vazio — conteúdo = Sprint 2)
    README.md           # marcador de camada
  layout/               # intacto (shell UI)
  pages/                # intacto (login/em-breve/home)
  styles/               # intacto
```

### API

```
api/src/
  core/                 # CRIAR (vazio — auth/entities = sprints futuros; NÃO mover auth agora)
  shared/               # CRIAR (vazio)
  features/             # CRIAR (vazio — boundaries = Sprint 1B)
  modules/
    beauty/             # CRIAR (vazio — Sprint 2)
  infrastructure/       # CRIAR (vazio + README apontando db/integrations/seed/etl atuais)
  db/                   # intacto (proibido mexer em schema/migrations)
  etl/                  # intacto
  integrations/         # intacto
  lib/                  # intacto
  seed/                 # intacto
  services/             # intacto (split = Sprint 1B)
  index.ts              # intacto (rotas = Sprint 1B)
```

Cada pasta nova recebe um `README.md` curto (propósito da camada + “placeholder Sprint 1A; conteúdo em sprint X”) e `.gitkeep` se necessário para o Git.

---

## Folders to create

| Pasta | Motivo |
|-------|--------|
| [src/app/modules/](src/app/modules/) | Camada Modules (ADR-001) |
| [src/app/modules/beauty/](src/app/modules/beauty/) | Módulo atual Beauty (vazio até Sprint 2) |
| [api/src/core/](api/src/core/) | Espelho Core na API |
| [api/src/shared/](api/src/shared/) | Espelho Shared na API |
| [api/src/features/](api/src/features/) | Espelho Features na API (pre-1B) |
| [api/src/modules/](api/src/modules/) | Camada Modules na API |
| [api/src/modules/beauty/](api/src/modules/beauty/) | Beauty na API (vazio até Sprint 2) |
| [api/src/infrastructure/](api/src/infrastructure/) | Marcador Infrastructure (sem mover db/) |

Arquivos marcadores a criar (não são lógica de negócio):

- `src/app/modules/README.md`
- `src/app/modules/beauty/README.md`
- `api/src/core/README.md`
- `api/src/shared/README.md`
- `api/src/features/README.md`
- `api/src/modules/README.md`
- `api/src/modules/beauty/README.md`
- `api/src/infrastructure/README.md` (explica que `db/`, `integrations/`, `seed/`, `etl/` continuam no lugar até sprints posteriores)

---

## Files to move

**Nenhum.**

Justificativa (dentro do escopo permitido/proibido):

- Mover serviços Beauty → `modules/beauty` = Sprint 2 (proibido agora).
- Mover `services/*` para `features/*` = Sprint 1B (split/boundaries).
- Mover auth → `core` = toca autenticação (proibido).
- Mover `db/` → `infrastructure/` = relacionado a database / risco de imports (proibido).
- Renomear `agenda` → `scheduling` etc. = rename de entidades de negócio (proibido).
- Corrigir Shared→Feature = Sprint 1C.
- Lazy routes = Sprint 1D.

Imports de runtime: **nenhuma alteração**. Barrels de reexport: **não** (nada para exportar sem mudar quem importa).

---

## Explicitly out of scope (confirmado)

- Lógica de negócio, schema, rotas API, lazy load, split de services, entities Core (Company), multi-tenant, extração Beauty, mudanças de auth.

---

## Risks

| Risco | Mitigação |
|-------|-----------|
| Pastas vazias “esquecidas” / confusão sobre onde colocar código novo | README em cada pasta com sprint dono do conteúdo |
| Alguém mover código Beauty para `modules/beauty` cedo demais | README: “não mover código até Sprint 2” |
| Duplicidade mental `api/src/infrastructure/` vs `db/` existente | README deixa explícito: placeholders; paths reais intactos |
| Diff grande sem valor se incluirmos moves desnecessários | Zero moves neste sprint |
| README em `src/app` parecer “doc do produto” | Textos técnicos curtos; **não** atualizar `docs/` automaticamente |

**Rollback:** apagar pastas/READMEs criados; nenhum código de produção afetado.

**Impacto estimado:** muito baixo (só árvore Git + arquivos marcadores). Build/runtime inalterados.

---

## Verification after implementation (quando aprovado)

- `ng build` / typecheck front sem erros novos
- API sobe sem mudança de imports
- `git status` mostra apenas pastas/READMEs novos

---

## After Sprint 1A — sugestões de doc (não aplicar automaticamente)

- Atualizar [Migration-Plan.md](docs/02-architecture/Migration-Plan.md): marcar 1A Finished + linkar árvore criada
- Opcional: seção “Repository layout” em [Architecture.md](docs/02-architecture/Architecture.md) com paths `src/app/*` e `api/src/*`
- Atualizar [Project-State.md](docs/00-governance/Project-State.md): nota “Sprint 1A structure scaffolding done”

---

## Aguardo aprovação

Responda **aprovado** (ou ajuste a lista) para eu executar **somente** este Sprint 1A. Em seguida paro e entrego o relatório pós-implementação (files created, debt, doc suggestions).
