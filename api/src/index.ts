import { cors } from '@elysiajs/cors';
import { node } from '@elysiajs/node';
import { Elysia, t } from 'elysia';
import { eq } from 'drizzle-orm';
import { db, ensureSchemaPatches } from './db';
import { clientes } from './db/schema';
import { fail, ok } from './lib/envelope';
import {
  createAtendimento,
  finalizarCobrancaPorIdAtendimento,
  listAtendimentosRaw,
} from './services/atendimentos-domain';
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

await ensureSchemaPatches();

const bodyFinalizar = t.Object({ id_atendimento: t.String() });

async function execFinalizarCobranca(body: { id_atendimento?: string }) {
  try {
    const id = String(body.id_atendimento || '').trim();
    if (!id) return fail('VALIDATION', 'id_atendimento é obrigatório');
    const n = await finalizarCobrancaPorIdAtendimento(db, id);
    if (!n) {
      return fail(
        'NOT_FOUND',
        'Nenhuma linha encontrada para este atendimento',
      );
    }
    return ok({ atualizadas: n });
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    return fail('SERVER', msg);
  }
}

const app = new Elysia({ adapter: node() })
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
  .post(
    '/api/finalizar-cobranca',
    async ({ body }) => execFinalizarCobranca(body),
    { body: bodyFinalizar },
  )
  .post(
    '/api/atendimentos/finalizar',
    async ({ body }) => execFinalizarCobranca(body),
    { body: bodyFinalizar },
  )
  .get('/api/atendimentos', async ({ query }) => {
    try {
      const items = await listAtendimentosRaw(
        db,
        query.dataInicio,
        query.dataFim,
      );
      return ok({ items });
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      return fail('SERVER', msg);
    }
  })
  .post('/api/atendimentos', async ({ body, query }) => {
    const b = (body ?? {}) as Record<string, unknown>;
    const qAcao = String(query?.acao ?? '').trim().toLowerCase();
    const bAcao = String(b.acao ?? '').trim().toLowerCase();
    const isFinalizar = qAcao === 'finalizar' || bAcao === 'finalizar';
    if (isFinalizar) {
      const idAt = String(
        b.id_atendimento ?? (b as { idAtendimento?: string }).idAtendimento ?? '',
      ).trim();
      return execFinalizarCobranca({ id_atendimento: idAt });
    }
    try {
      const result = await createAtendimento(db, body as never);
      return ok(result);
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      return fail('SERVER', msg);
    }
  })
  .listen(
    {
      port: Number(process.env.PORT) || 3000,
      hostname: '0.0.0.0',
    },
    ({ hostname, port }) => {
      console.log(`API em http://${hostname}:${port}`);
    },
  );

export type App = typeof app;
