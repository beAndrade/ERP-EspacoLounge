---
name: Sprint 1B API Boundaries
overview: Migrar apenas arquivos de baixo risco e sem lógica de negócio para Shared e Infrastructure, preservando integralmente rotas, serviços, contratos e runtime. Evolution/WhatsApp permanece ativo e será reorganizado sob infrastructure/integrations/whatsapp/providers. Services, autenticação, banco e código Beauty permanecem legados neste sprint.
todos:
  - id: baseline
    content: Registrar baseline TypeScript e confirmar importadores dos candidatos
    status: completed
  - id: move-shared
    content: Mover quatro utilitários puros para api/src/shared/utils e atualizar imports
    status: completed
  - id: move-whatsapp
    content: Mover adapters WhatsApp/Evolution para infrastructure/integrations/whatsapp/providers e atualizar imports
    status: completed
  - id: validate-1b
    content: Comparar typecheck, procurar imports órfãos e revisar diff restrito
    status: completed
  - id: report-1b
    content: Entregar relatório do Sprint 1B e recomendação para 1C
    status: completed
isProject: false
---

# Sprint 1B — API Boundaries

## Decisão de escopo

O Sprint 1B será uma migração física pequena e mecânica. Não haverá split de [api/src/index.ts](api/src/index.ts), movimento de `services/`, alteração de rotas, autenticação ou banco.

Há duas divergências documentais que serão tratadas conservadoramente:

- [Migration-Plan.md](docs/02-architecture/Migration-Plan.md) chama o 1B de **API Boundaries**, enquanto [Project-State.md](docs/00-governance/Project-State.md) fala em shared components. Este plano atende ambos criando boundaries reais em Shared e Infrastructure.
- [Architecture.md](docs/02-architecture/Architecture.md) sugere Shared/Infrastructure para alguns arquivos que contêm regras específicas (`descricao-lista`, `sql-local-datetime`, `normalize-comissao`, `pg-error-message`). Eles não serão movidos porque isso violaria [Folder-Conventions.md](docs/03-development/Folder-Conventions.md).

## Inspeção prévia — `foto-url.ts`

Arquivo: [api/src/lib/foto-url.ts](api/src/lib/foto-url.ts)

**Veredito: pode migrar para Shared.**

- Zero imports (sem dependência de negócio, DB, HTTP client ou infraestrutura).
- Função pura: valida string (`data:image/`, `http://`, `https://`) e aplica limite de tamanho.
- O comentário “alinhado ao drawer de cliente” é apenas documentação do limite; não acopla UI ou domínio.
- Único consumidor de negócio: [api/src/services/profissionais-domain.ts](api/src/services/profissionais-domain.ts) — só importa a utilidade; a regra de cadastro permanece no service legado.

## Inspeção prévia — Evolution / WhatsApp

**Veredito: Evolution NÃO pode ser removido.** Continua em uso ativo. Nenhuma exclusão de providers/registros/interfaces/config.

### Dependências que impedem remoção

| Camada | Dependência | Por que bloqueia remoção |
|--------|-------------|---------------------------|
| API routes | `/api/whatsapp/config`, `test-connection`, `templates`, `messages/send`, `logs` em [api/src/index.ts](api/src/index.ts) | Endpoints vivos; `provider: 'evolution'` no body/schema TypeBox |
| Domain service | [api/src/services/whatsapp.service.ts](api/src/services/whatsapp.service.ts) | Chama `getWhatsAppProvider`, `telefoneParaWhatsappBr` e usa `WhatsappConfigRow` |
| Registry | [api/src/integrations/whatsapp/provider-registry.ts](api/src/integrations/whatsapp/provider-registry.ts) | Único provider registrado: `evolution` |
| Provider | [api/src/integrations/whatsapp/evolution.provider.ts](api/src/integrations/whatsapp/evolution.provider.ts) | Implementação HTTP Evolution (connectionState + sendText) |
| Schema/DB | `whatsapp_config`, `whatsapp_templates`, `whatsapp_logs`, enum `whatsapp_provider` em [api/src/db/schema.ts](api/src/db/schema.ts) | Persistência e tipo `'evolution'` |
| Front | [whatsapp-config-tab.component.ts](src/app/features/configuracoes/pages/whatsapp/whatsapp-config-tab.component.ts), [whatsapp.model.ts](src/app/core/models/whatsapp.model.ts) | `provider: 'evolution'`; tela Configurações → WhatsApp |
| Front client | [whatsapp.service.ts](src/app/core/services/whatsapp/whatsapp.service.ts) | Consome as rotas `/api/whatsapp/*` |
| Deploy | [docs/02-architecture/DOKPLOY.md](docs/02-architecture/DOKPLOY.md), compose Evolution | Stack de produção/documentação usa Evolution API |

**Consequência:** migrar (não deletar) o adapter Evolution sob a nova árvore de Infrastructure. Orquestração (`whatsapp.service.ts`, templates, rotas) permanece em `services/` legados neste sprint.

## Classificação da API atual

- **Core:** nenhum arquivo legado será movido agora.
- **Shared:** `envelope`, `normalize-percent-text`, `telefone-br` e `foto-url` (confirmado puro).
- **Platform:** auth cluster e orquestração WhatsApp (`whatsapp*.service/domain`) permanecem legados.
- **Infrastructure:** providers Evolution/WhatsApp migram como adapters. `db`, `seed`, `etl` e `pg-error-message` permanecem legados.
- **Features / Modules/Beauty:** sem movimentos neste sprint.

## Movimentos aprováveis de baixo risco

### Lote 1 — Shared primitives

Mover para `api/src/shared/utils/`:

- [api/src/lib/envelope.ts](api/src/lib/envelope.ts) → `api/src/shared/utils/envelope.ts`
- [api/src/lib/normalize-percent-text.ts](api/src/lib/normalize-percent-text.ts) → `api/src/shared/utils/normalize-percent-text.ts`
- [api/src/lib/telefone-br.ts](api/src/lib/telefone-br.ts) → `api/src/shared/utils/telefone-br.ts`
- [api/src/lib/foto-url.ts](api/src/lib/foto-url.ts) → `api/src/shared/utils/foto-url.ts`

Atualizar somente os imports necessários em:

- [api/src/index.ts](api/src/index.ts)
- [api/src/lib/admin-pin.ts](api/src/lib/admin-pin.ts)
- [api/src/lib/auth-guard.ts](api/src/lib/auth-guard.ts)
- [api/src/services/estoque-domain.ts](api/src/services/estoque-domain.ts)
- [api/src/services/servicos-domain.ts](api/src/services/servicos-domain.ts)
- [api/src/services/profissionais-domain.ts](api/src/services/profissionais-domain.ts)
- provider Evolution (após Lote 2)

Não criar stubs nos paths antigos.

### Lote 2 — Infrastructure WhatsApp providers

Como Evolution permanece, organizar sob:

```text
api/src/infrastructure/integrations/whatsapp/
  providers/
    whatsapp-provider.interface.ts
    provider-registry.ts
    evolution.provider.ts
```

Movimentos:

- [api/src/integrations/whatsapp/whatsapp-provider.interface.ts](api/src/integrations/whatsapp/whatsapp-provider.interface.ts) → `api/src/infrastructure/integrations/whatsapp/providers/whatsapp-provider.interface.ts`
- [api/src/integrations/whatsapp/provider-registry.ts](api/src/integrations/whatsapp/provider-registry.ts) → `api/src/infrastructure/integrations/whatsapp/providers/provider-registry.ts`
- [api/src/integrations/whatsapp/evolution.provider.ts](api/src/integrations/whatsapp/evolution.provider.ts) → `api/src/infrastructure/integrations/whatsapp/providers/evolution.provider.ts`

Atualizar:

- três imports em [api/src/services/whatsapp.service.ts](api/src/services/whatsapp.service.ts)
- import de `telefone-br` no `evolution.provider.ts` (agora aponta para `shared/utils`)
- import relativo de `db/schema` na interface (ajustar profundidade do path)

Remover a pasta legada `api/src/integrations/whatsapp/` se ficar vazia. Não criar pastas `providers/` vazias além do conteúdo real migrado.

A dependência temporária da interface WhatsApp em `db/schema.ts` permanece (sem mudança de schema) e vira dívida técnica.

## Arquivos explicitamente adiados

- `lib/descricao-lista.ts`: regras Mega/Pacote — Beauty.
- `lib/normalize-comissao.ts`: semântica de comissão — domínio.
- `lib/normalize-money-text.ts`: depende de `finance-domain` — risco de ciclo.
- `lib/periodo-mes.ts`: acoplado ao import da planilha.
- `lib/sql-local-datetime.ts`: “relógio do salão”.
- `lib/pg-error-message.ts`: constraints de comanda/serviço/produto.
- Todo `services/` (incl. orquestração WhatsApp), `db/`, `seed/`, `etl/`, auth e estrutura de [api/src/index.ts](api/src/index.ts).

## Execução incremental e rollback

1. Registrar baseline do TypeScript (diagnósticos preexistentes em `finance-domain.ts` e `public-booking-domain.ts`).
2. Executar o Lote 1 e validar imports/typecheck.
3. Executar o Lote 2 e validar imports/typecheck.
4. Revisar o diff para garantir apenas moves e strings de import.

Cada lote permanece reversível. Nenhum commit automático.

## Validação

- `npx tsc --noEmit`: sem diagnóstico novo além do baseline.
- Busca por imports dos paths antigos: vazia para os sete arquivos movidos.
- Confirmar que Evolution continua importável via novo path e que nenhum arquivo Evolution foi deletado.
- `git diff --check` e revisão de `git diff --name-status`.
- Sem mudanças em `api/src/db/`, `api/drizzle/`, bodies de funções, URLs ou handlers.
- Sem seed/ETL / patches de banco na validação.

## Riscos

- Import relativo incorreto após movimento: mitigado por busca global e typecheck.
- Interface WhatsApp ainda acoplada ao schema legado: mantida intencionalmente.
- Remoção acidental de Evolution quebraria Configurações → WhatsApp e envio via API: **fora de escopo; não deletar**.
- Typecheck já possui erros preexistentes: comparar diagnóstico, não exigir verde artificial.

## Relatório final

Ao concluir, entregar:

- arquivos movidos;
- imports atualizados;
- relatório Evolution (dependências que impediram remoção);
- riscos introduzidos;
- validações e baseline;
- dívida técnica restante;
- recomendação para Sprint 1C.

Não atualizar automaticamente documentação nem iniciar Sprint 1C.
