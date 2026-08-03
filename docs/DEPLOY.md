# Deploy — Espaço Lounge

Guia mínimo para a sua mãe usar o app no celular (internet + HTTPS).

**Dokploy (stack completa Docker):** ver [`DOKPLOY.md`](DOKPLOY.md).

## Pré-requisitos

1. Servidor com Docker (VPS) **ou** PaaS (Railway, Render) + Postgres gerido (Neon, Supabase).
2. Domínio apontando para o servidor (ex.: `app.seudominio.com.br`).
3. Certificado TLS (Let's Encrypt / Certbot no VPS, ou TLS automático no PaaS).

## Variáveis de ambiente (API)

Copie `api/.env.example` e defina:

| Variável | Descrição |
|----------|-----------|
| `DATABASE_URL` | Postgres |
| `JWT_SECRET` | Segredo longo e aleatório (obrigatório) |
| `ADMIN_EMAIL` / `ADMIN_PASSWORD` | Primeiro login admin (criado só se `usuarios` estiver vazio) |
| `CORS_ORIGINS` | JSON com URL do Angular, ex. `["https://app.seudominio.com.br"]` |
| `ADMIN_PIN` | PIN de 4 dígitos do Financeiro (`X-Admin-Pin`). Sem aspas no painel. |

## Passos

### 1. Base de dados

Na pasta `api`:

```bash
npm run db:migrate
```

### 2. API

```bash
cd api
npm ci
npm start
```

Com Docker (na raiz do repo):

```bash
docker compose -f docker-compose.prod.yml up -d --build
docker compose -f docker-compose.prod.yml exec api npm run db:migrate
```

### 3. Frontend Angular

Edite `src/environments/environment.production.ts`:

```ts
apiBaseUrl: 'https://api.seudominio.com.br'
```

Ou use o mesmo domínio com proxy nginx (`deploy/nginx.conf.example`).

```bash
npm ci
npm run build
```

Publique `dist/espaco-lounge/browser` em Netlify, Vercel, Cloudflare Pages ou nginx.

### 4. Agendamento público

Link para clientes: `https://app.seudominio.com.br/agendar`

Profissionais precisam ter **Disponível para agendamento online** ativo no cadastro.

### 5. Checklist pós-deploy

- [ ] `/health` responde JSON
- [ ] Login em `/login` com `ADMIN_EMAIL`
- [ ] Agenda carrega no celular (4G/Wi‑Fi)
- [ ] `/agendar` funciona sem login
- [ ] `CORS_ORIGINS` inclui o domínio do front

## Celular da recepção

Não é obrigatório instalar app nativo: o site em HTTPS pode ser adicionado à tela inicial (PWA manual). O essencial é URL pública estável e login da sua mãe.
