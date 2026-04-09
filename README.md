# Espaço Lounge — ERP (Angular + API + PostgreSQL)

Sistema interno para o salão: agenda, clientes, catálogo de serviços e atendimentos. O **front** é Angular 19; a **fonte de verdade** passou a ser **PostgreSQL**, servida por uma API em **Elysia** na pasta `api/`. A planilha **ERP Espaço Lounge** (export em `docs/ERP Espaço Lounge.xlsx`) continua sendo o modelo de colunas e o ponto de partida para **popular o banco** via seed.

O código antigo do **Google Apps Script** (`apps-script/Code.gs`) fica no repositório como referência e para quem ainda mantiver um fluxo paralelo na planilha — o caminho principal de desenvolvimento hoje é **API + Postgres**.

---

## O que você precisa instalado

- Node.js 20+ e npm  
- Docker (só para subir o Postgres local, se quiser usar o `docker-compose` de `api/`)  
- Python 3 + `openpyxl` se for rodar os scripts de manifesto do XLSX em `scripts/`

---

## Subir o banco e a API

Na pasta `api/`:

1. Copie `.env.example` para `.env` e ajuste `DATABASE_URL` (porta **5432** ou **5433**, conforme o mapeamento do Docker).
2. `docker compose up -d` — sobe o Postgres.
3. `npm install`
4. `npm run db:migrate` — cria as tabelas.
5. `npm run db:seed` — lê o XLSX em `docs/` e enche o banco (**apaga dados anteriores** nessas tabelas).
6. `npm start` — API em `http://localhost:3000`.

No PowerShell, se `npm` reclamar de política de execução, use `npm.cmd start`.

Detalhes extras (CORS, variáveis, troubleshooting): **`api/README.md`**.

---

## Subir o Angular

Na **raiz** do repositório:

```bash
npm install
npm start
```

Abra `http://localhost:4200`. Em desenvolvimento, `src/environments/environment.ts` aponta `apiBaseUrl` para `http://localhost:3000`. A API precisa estar rodando ao mesmo tempo.

---

## Git: commits por etapa

Sempre que fechar um bloco de trabalho (feature, correção, doc, ajuste de config), faça um **commit** com mensagem clara em português. Isso facilita revisão, rollback e histórico. O assistente no Cursor também deve seguir isso: ao terminar uma etapa, **preparar e sugerir o commit** (ou executar `git add` / `git commit` quando fizer sentido).

---

## Planilha, XLSX e documentação

- **`docs/CONTRATO_PLANILHA.md`** — abas, colunas e comportamento esperado (espelho do modelo da planilha).
- **`docs/ERP Espaço Lounge.xlsx`** — referência estrutural; o seed da API usa esse ficheiro (ou outro caminho via `XLSX_PATH` no `.env` da API).
- **`docs/xlsx-manifest.json`** — gerado com `python scripts/xlsx_manifest.py` (inventário de abas/colunas).
- **`docs/column-mapping.json`** — mapeamento cabeçalho da planilha ↔ colunas SQL.
- **`docs/FLUXOS_E_TELAS.md`**, **`docs/CRITERIOS_SQL.md`** — contexto de produto e decisões.

Atualizou a planilha “oficial”? Troque o XLSX em `docs/`, rode de novo o seed na API (em ambiente de dev) e, se quiser, regenere o manifesto.

---

## Proxy `/gas` (legado)

O ficheiro **`proxy.conf.json`** ainda pode apontar para um Web App do Apps Script (`/gas` → URL `/exec`). O fluxo **atual** do app em dev usa a **API REST** direto, sem passar por esse proxy. Só é útil se você mantiver testes ou um build antigo contra o Google.

---

## Testes e build de produção

```bash
npm test          # Karma / unitários do Angular
npm run build     # artefatos em dist/
```

Para produção, configure `src/environments/environment.production.ts` com a **URL pública da API** (sem barra no final) e faça o deploy do front e da API separadamente.

---

## Pastas principais

| Caminho | Para que serve |
|--------|----------------|
| `src/app/` | Telas e rotas do Angular |
| `src/app/core/services/sheets-api.service.ts` | Cliente HTTP da API (nome histórico; fala com Elysia) |
| `api/` | API Elysia, Drizzle, migrações, Docker, seed |
| `apps-script/` | Script Google legado + README de deploy |
| `docs/` | Contrato da planilha, fluxos, critérios, XLSX de referência |
| `scripts/` | Utilitários Python (dump/manifesto do XLSX) |

---

## Licença / uso

Uso interno do projeto Espaço Lounge; ajuste conforme a política da sua empresa.
