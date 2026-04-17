# API Espaço Lounge (Elysia + Drizzle + PostgreSQL)

Substitui o Web App do Google Apps Script: mesma envoltório JSON `{ ok, data, error }` que o Angular espera.

## Pré-requisitos

- Node 20+
- PostgreSQL 16 (local ou Docker)

## Arranque rápido

```bash
cd api
cp .env.example .env
# Subir Postgres (se usar Docker):
docker compose up -d
npm install
npm run db:migrate
npm run db:seed
npm start
```

Servidor em `http://localhost:3000` (ou `PORT` no `.env`).

## Variáveis de ambiente

| Variável | Descrição |
|----------|-----------|
| `DATABASE_URL` | URL PostgreSQL |
| `PORT` | Porta HTTP (default 3000) |
| `XLSX_PATH` | Caminho absoluto do export XLSX para seed (opcional) |
| `CORS_ORIGINS` | JSON array de origens ou `*` |
| `ADMIN_PIN` | PIN de administrador: obrigatório para `GET /api/folha` e `POST /api/folha/recalcular-comissoes` (header `X-Admin-Pin`) |

### Folha e comissões (operacional)

1. Defina `ADMIN_PIN` no `.env` da API e reinicie o servidor.
2. No Angular, abra **Comissões** no menu ou **Financeiro → Comissões / Folha**, introduza o mesmo PIN e use **Guardar e carregar**.
3. Os totais em `folha` são atualizados automaticamente ao **finalizar cobrança** ou **confirmar pagamento** de um atendimento (recálculo do mês da data do serviço). Pode usar **Recalcular comissões** para forçar o agregado a partir de `atendimentos.comissao`.

## Scripts npm

| Script | Descrição |
|--------|-----------|
| `npm start` | API em produção (tsx) |
| `npm run dev` | API com reload |
| `npm run db:generate` | Gera SQL a partir de `src/db/schema.ts` |
| `npm run db:migrate` | Aplica migrações em `drizzle/` |
| `npm run db:seed` | Lê o XLSX e repõe dados (trunca tabelas) |
| `npm run etl:import` | Importa XLSX **sem** truncar (cutover; pode duplicar) |

## Modelo ER (resumo)

- **clientes** (`id_cliente` PK) ← **atendimentos** (`id_cliente` FK)
- **servicos** (`linha` PK) — alinhado ao `servico_id` = número da linha na planilha
- Catálogos: **pacotes**, **produtos**, **regras_mega**, **cabelos**
- Operacionais: **folha**, **pagamentos**, **despesas**

Mapeamento planilha ↔ SQL: [`../docs/column-mapping.json`](../docs/column-mapping.json).  
Manifesto gerado a partir do XLSX: [`../docs/xlsx-manifest.json`](../docs/xlsx-manifest.json) (`python ../scripts/xlsx_manifest.py`).

## Contrato HTTP (MVP)

Todas as respostas: `{ ok: boolean, data: T | null, error: { code, message } | null }`.

| Método | Caminho | `data` |
|--------|---------|--------|
| GET | `/health` | `{ status, time }` |
| GET | `/api/clientes` | `{ items: Cliente[] }` |
| GET | `/api/clientes/:id` | `{ item: Cliente }` |
| POST | `/api/clientes` | `Cliente` |
| PATCH | `/api/clientes/:id` | `Cliente` |
| GET | `/api/servicos` | `{ items }` (chaves como na planilha) |
| GET | `/api/regras-mega` | `{ items: RegraMega[] }` |
| GET | `/api/pacotes` | `{ items }` |
| GET | `/api/produtos` | `{ items }` |
| GET | `/api/cabelos` | `{ items }` |
| GET | `/api/profissionais` | `{ items: string[] }` |
| GET | `/api/atendimentos?dataInicio&dataFim` | `{ items }` (chaves PT + `id`) |
| GET | `/api/folha?periodo=YYYY-MM` | `{ items }` folha por mês — requer `X-Admin-Pin` |
| POST | `/api/folha/recalcular-comissoes` | `{ periodo, profissional_id? }` — requer `X-Admin-Pin` |
| POST | `/api/atendimentos` | corpo = payload `CreateAtendimento` (tipos Serviço, Mega, Pacote, Produto, Cabelo ou legado só `servico_id`) |

## Deploy

- Executar `npm run db:migrate` no ambiente.
- `npm start` atrás de reverse proxy TLS.
- Definir `CORS_ORIGINS` com o domínio do Angular.

## Stack

- [Elysia](https://elysiajs.com/) com adaptador [**@elysiajs/node**](https://github.com/elysiajs/node) (o `.listen()` nativo do Elysia exige Bun; no Windows/Node use sempre este adapter).
- [Drizzle ORM](https://orm.drizzle.team/) + [postgres.js](https://github.com/porsager/postgres)

Em desenvolvimento o projeto usa **Node + tsx**; com Bun instalado pode trocar os scripts se preferir.
