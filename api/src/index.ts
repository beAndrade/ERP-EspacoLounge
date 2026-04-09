import { cors } from '@elysiajs/cors';
import { Elysia, t } from 'elysia';
import { eq } from 'drizzle-orm';
import { db } from './db';
import { clientes } from './db/schema';
import { fail, ok } from './lib/envelope';
import { createAtendimento, listAtendimentosRaw } from './services/atendimentos-domain';
import {
  getClienteById,
  listCabelosApi,
  listClientesNormalized,
  listPacotesApi,
  listProdutosApi,
  listProfissionaisApi,
  listRegrasMegaApi,
  listServicosForApi,
} from './services/queries';

function corsOrigins(): string[] | true {
  const raw = process.env.CORS_ORIGINS?.trim();
  if (!raw || raw === '*') return true;
  try {
    const p = JSON.parse(raw) as unknown;
    if (Array.isArray(p) && p.every((x) => typeof x === 'string')) return p;
  } catch {
    /* ignore */
  }
  return ['http://localhost:4200'];
}

const app = new Elysia()
  .use(
    cors({
      origin: corsOrigins(),
      methods: ['GET', 'POST', 'PATCH', 'OPTIONS'],
      allowedHeaders: ['Content-Type'],
    }),
  )
  .get('/health', () =>
    ok({ status: 'up', time: new Date().toISOString() }),
  )
  .get('/api/clientes', async () => ok({ items: await listClientesNormalized(db) }))
  .get(
    '/api/clientes/:id',
    async ({ params }) => {
      const item = await getClienteById(db, params.id);
      if (!item) return fail('NOT_FOUND', 'Cliente não encontrado');
      return ok({ item });
    },
    { params: t.Object({ id: t.String() }) },
  )
  .post(
    '/api/clientes',
    async ({ body }) => {
      const nome = String(body.nome || '').trim();
      if (!nome) return fail('VALIDATION', 'Nome do cliente é obrigatório');
      const id = crypto.randomUUID();
      await db.insert(clientes).values({
        idCliente: id,
        nomeExibido: nome,
        telefone: body.telefone != null ? String(body.telefone) : null,
        observacoes: body.notas != null ? String(body.notas) : null,
      });
      return ok({
        id,
        nome,
        telefone: body.telefone != null ? String(body.telefone) : '',
        observacoes: body.notas != null ? String(body.notas) : '',
      });
    },
    {
      body: t.Object({
        nome: t.String(),
        telefone: t.Optional(t.String()),
        notas: t.Optional(t.String()),
      }),
    },
  )
  .patch(
    '/api/clientes/:id',
    async ({ params, body }) => {
      const nome = String(body.nome || '').trim();
      if (!nome) return fail('VALIDATION', 'Nome exibido é obrigatório');
      const id = params.id.trim();
      const updated = await db
        .update(clientes)
        .set({
          nomeExibido: nome,
          telefone: body.telefone != null ? String(body.telefone) : '',
          observacoes: body.notas != null ? String(body.notas) : '',
        })
        .where(eq(clientes.idCliente, id))
        .returning();
      if (!updated.length) return fail('NOT_FOUND', 'Cliente não encontrado');
      return ok({
        id,
        nome,
        telefone: body.telefone != null ? String(body.telefone) : '',
        observacoes: body.notas != null ? String(body.notas) : '',
      });
    },
    {
      params: t.Object({ id: t.String() }),
      body: t.Object({
        nome: t.String(),
        telefone: t.Optional(t.String()),
        notas: t.Optional(t.String()),
      }),
    },
  )
  .get('/api/servicos', async () => ok({ items: await listServicosForApi(db) }))
  .get('/api/regras-mega', async () => ok({ items: await listRegrasMegaApi(db) }))
  .get('/api/pacotes', async () => ok({ items: await listPacotesApi(db) }))
  .get('/api/produtos', async () => ok({ items: await listProdutosApi(db) }))
  .get('/api/cabelos', async () => ok({ items: await listCabelosApi(db) }))
  .get('/api/profissionais', async () =>
    ok({ items: await listProfissionaisApi(db) }),
  )
  .get('/api/atendimentos', async ({ query }) => {
    const items = await listAtendimentosRaw(
      db,
      query.dataInicio,
      query.dataFim,
    );
    return ok({ items });
  })
  .post('/api/atendimentos', async ({ body }) => {
    try {
      const result = await createAtendimento(db, body as never);
      return ok(result);
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      return fail('SERVER', msg);
    }
  })
  .listen({
    port: Number(process.env.PORT) || 3000,
    hostname: '0.0.0.0',
  });

export type App = typeof app;

console.log(
  `Elysia em http://${app.server?.hostname}:${app.server?.port}`,
);
