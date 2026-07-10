# Deploy no Dokploy — Espaço Lounge

Stack Docker Compose com **todas as camadas**: Postgres (ERP), API Elysia, front Angular (nginx) e Evolution API (WhatsApp).

Ficheiro principal: [`docker-compose.dokploy.yml`](../docker-compose.dokploy.yml)

## Arquitetura

```mermaid
flowchart LR
  subgraph dokploy [Dokploy / Traefik]
    WEB[web :80]
    EVO[evolution-api :8080]
  end
  subgraph interno [dokploy-network]
    API[api :3000]
    DB[(db Postgres)]
    EDB[(evolution-postgres)]
    REDIS[(evolution-redis)]
  end
  User((Utilizador)) --> WEB
  WEB -->|/api/*| API
  API --> DB
  API --> EVO
  EVO --> EDB
  EVO --> REDIS
```

| Serviço | Função | Expor no Dokploy |
|---------|--------|------------------|
| `web` | Angular estático + proxy `/api` → API | **Sim** — domínio principal |
| `api` | API Elysia + migrações no arranque | Não (só rede interna) |
| `db` | PostgreSQL do ERP | Não |
| `evolution-api` | WhatsApp (Baileys) | **Opcional** — subdomínio para QR/Manager |
| `evolution-postgres` / `evolution-redis` | Dados da Evolution | Não |
| `evolution-manager` | UI web da Evolution | Perfil `manager` (opcional) |

## Passo a passo no Dokploy

1. **Projeto** → criar projeto (ex. `espaco-lounge`).
2. **Compose** → tipo *Docker Compose* (não Stack/Swarm).
3. **Git** → ligar este repositório e branch (`main` ou `feature/...`).
4. **Compose path** → `docker-compose.dokploy.yml`
5. **Environment** → copiar variáveis de [`.env.dokploy.example`](../.env.dokploy.example) e preencher segredos.
6. **Domains** (recomendado):
   - Serviço `web` → `app.seudominio.com.br` (HTTPS automático)
   - Serviço `evolution-api` → `evolution.seudominio.com.br` (se precisar de QR code / webhooks públicos)
7. **Deploy** → o Dokploy executa `docker compose up -d --build`.

### DNS

Crie registos **A** (ou CNAME) apontando para o IP do servidor Dokploy:

- `app.seudominio.com.br`
- `evolution.seudominio.com.br` (opcional)

## Variáveis obrigatórias

| Variável | Descrição |
|----------|-----------|
| `POSTGRES_PASSWORD` | Senha do Postgres do ERP |
| `JWT_SECRET` | Segredo JWT (longo, aleatório) |
| `EVOLUTION_POSTGRES_PASSWORD` | Senha do Postgres da Evolution |
| `EVOLUTION_API_KEY` | Chave `apikey` da Evolution (igual em Configurações → WhatsApp) |
| `EVOLUTION_SERVER_URL` | URL pública da Evolution (`https://evolution...`) |

Recomendadas: `ADMIN_EMAIL`, `ADMIN_PASSWORD`, `CORS_ORIGINS`, `ADMIN_PIN`.

### Rede e `DATABASE_URL` (API)

Todos os serviços usam a rede externa **`dokploy-network`** (DNS entre containers + Traefik).

**Não defina `DATABASE_URL` no Environment.** Basta `POSTGRES_PASSWORD` (+ `DB_HOST` se preciso). O entrypoint monta sempre:

```text
postgresql://postgres:${POSTGRES_PASSWORD}@${DB_HOST}:5432/espaco_lounge
```

- Se a chave `DATABASE_URL` existir no painel (mesmo vazia ou com host `db`), **apague-a** — senão pode confundir deploys antigos.
- Nos logs da API deve aparecer: `DATABASE_URL → user=postgres host=...` com o host que definiu.

#### Erro `getaddrinfo ENOTFOUND db`

1. Redeploy com o compose atualizado (aliases `db` / `espaco-lounge-db` na `dokploy-network`).
2. Se persistir: Dokploy → menu **Docker** → copie o **nome real** do container Postgres → Environment:
   ```text
   DB_HOST=<nome-real-do-container-postgres>
   ```
3. Confirme que o serviço `db` está **Running** antes da API.

## Pós-deploy

1. **Health** — `https://app.seudominio.com.br/health` deve responder JSON.
2. **Login** — `https://app.seudominio.com.br/login` com `ADMIN_EMAIL` (criado se `usuarios` estiver vazio).
3. **WhatsApp** — em Configurações → WhatsApp:
   - URL: `EVOLUTION_SERVER_URL`
   - API Key: `EVOLUTION_API_KEY`
   - Criar instância (ex. `espaco-lounge`) e ler QR no Manager ou painel Evolution.
4. **Agendamento público** — `https://app.seudominio.com.br/agendar`

## Migrações e seed

- **Migrações**: aplicadas automaticamente no arranque da API (`RUN_MIGRATIONS=true`, default).
- **Seed** (só dev/cutover): entrar no terminal do serviço `api` no Dokploy e executar `npm run db:seed` (apaga dados das tabelas do seed).

## Evolution Manager (UI opcional)

Para subir a UI web da Evolution, use perfil Compose no comando avançado do Dokploy:

```bash
compose -p <projeto> -f docker-compose.dokploy.yml --profile manager up -d --build
```

Ou adicione domínio ao serviço `evolution-manager` na aba Domains.

## Volumes e backups

O compose usa **named volumes** (`espaco_lounge_pg`, `evolution_postgres`, etc.) — compatíveis com *Volume Backups* do Dokploy.

## Desenvolvimento local (testar a stack)

```bash
cp .env.dokploy.example .env
# Edite .env com senhas locais

docker compose -f docker-compose.dokploy.yml --env-file .env up -d --build
```

Front em `http://localhost` (mapeie porta no compose se quiser testar sem Dokploy) ou use `docker compose ... port` temporariamente.

## Ficheiros Docker

| Ficheiro | Camada |
|----------|--------|
| [`Dockerfile`](../Dockerfile) | Front Angular → nginx |
| [`deploy/nginx.conf`](../deploy/nginx.conf) | SPA + proxy `/api` |
| [`api/Dockerfile`](../api/Dockerfile) | API Node + entrypoint |
| [`api/docker-entrypoint.sh`](../api/docker-entrypoint.sh) | `db:migrate` + `npm start` |
| [`src/environments/environment.docker.ts`](../src/environments/environment.docker.ts) | `apiBaseUrl: ''` (mesmo host) |

## Alternativa: API em subdomínio

Se preferir `api.seudominio.com.br` em vez do proxy nginx:

1. Adicione domínio ao serviço `api` no Dokploy.
2. Altere `src/environments/environment.production.ts` com `apiBaseUrl: 'https://api.seudominio.com.br'`.
3. Ajuste `CORS_ORIGINS` com a URL do front.
4. Use build `production` no `Dockerfile` do front (ou variável de build).

O layout default (um domínio + proxy) é o mais simples para o salão.
