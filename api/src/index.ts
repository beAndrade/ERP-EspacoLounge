import 'dotenv/config';
import { cors } from '@elysiajs/cors';
import { node } from '@elysiajs/node';
import { Elysia, t } from 'elysia';
import { eq } from 'drizzle-orm';
import { db, ensureSchemaPatches } from './db';
import { clientes } from './db/schema';
import { fail, ok } from './lib/envelope';
import { instantEmDateParaSqlLocalBrasil } from './lib/sql-local-datetime';
import {
  confirmarPagamentoPorIdAtendimento,
  createAtendimento,
  excluirAtendimentoPorIdAtendimento,
  finalizarCobrancaPorIdAtendimento,
  listAtendimentosRaw,
} from './services/atendimentos-domain';
import type { CreateAtendimentoPayload } from './services/atendimentos-domain';
import { postAtendimentoMutationBody } from './services/atendimentos-api-schemas';
import {
  atualizarMovimentacaoPorId,
  criarDespesaCadastro,
  criarMovimentacaoManual,
  excluirMovimentacaoPorId,
  getCaixaDiaApi,
  listCategoriasFinanceirasApi,
  listMovimentacoesApi,
} from './services/finance-domain';
import {
  atualizarProfissional,
  criarProfissional,
  listProfissionaisForApi,
} from './services/profissionais-domain';
import {
  allocNextClienteClId,
  deleteClienteById,
  getClienteById,
  listCabelosApi,
  listClientesNormalized,
  listPacotesApi,
  listProdutosApi,
  listRegrasMegaApi,
  listServicosForApi,
} from './services/queries';
import { requireAdminPin } from './lib/admin-pin';
import {
  listFolhaPorPeriodoApi,
  recalcularTotaisComissaoFolhaPorPeriodo,
} from './services/folha-domain';
import { incrementarEstoqueProduto } from './services/estoque-domain';

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

const bodyFinalizar = t.Object({
  id_atendimento: t.String(),
  desconto: t.Optional(t.String()),
});

async function execFinalizarCobranca(body: {
  id_atendimento?: string;
  desconto?: string;
}) {
  try {
    const id = String(body.id_atendimento || '').trim();
    if (!id) return fail('VALIDATION', 'id_atendimento é obrigatório');
    const n = await finalizarCobrancaPorIdAtendimento(db, id, body.desconto);
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

async function execConfirmarPagamento(body: {
  id_atendimento?: string;
  metodo?: string;
}) {
  try {
    const id = String(body.id_atendimento || '').trim();
    if (!id) return fail('VALIDATION', 'id_atendimento é obrigatório');
    const metodo =
      body.metodo != null ? String(body.metodo).trim() : undefined;
    const r = await confirmarPagamentoPorIdAtendimento(db, id, metodo);
    if (!r.linhasAtualizadas) {
      return fail(
        'NOT_FOUND',
        'Nenhuma linha finalizada encontrada para confirmar pagamento',
      );
    }
    return ok({
      atualizadas: r.linhasAtualizadas,
      movimentacao_id: r.movimentacaoId,
    });
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    return fail('SERVER', msg);
  }
}

async function execExcluirAtendimento(body: { id_atendimento?: string }) {
  try {
    const id = String(body.id_atendimento || '').trim();
    if (!id) return fail('VALIDATION', 'id_atendimento é obrigatório');
    const n = await excluirAtendimentoPorIdAtendimento(db, id);
    if (!n) {
      return fail('NOT_FOUND', 'Nenhuma linha encontrada para excluir');
    }
    return ok({ removidas: n });
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    return fail('SERVER', msg);
  }
}

const app = new Elysia({ adapter: node() })
  .use(
    cors({
      origin: corsOrigins(),
      methods: ['GET', 'POST', 'PATCH', 'DELETE', 'OPTIONS'],
      allowedHeaders: ['Content-Type', 'X-Admin-Pin'],
    }),
  )
  .get('/health', () =>
    ok({
      status: 'up',
      time: instantEmDateParaSqlLocalBrasil(new Date()) ?? '',
    }),
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
      const telefone =
        body.telefone != null ? String(body.telefone) : null;
      const observacoes = body.notas != null ? String(body.notas) : null;

      for (let attempt = 0; attempt < 8; attempt++) {
        const id = await allocNextClienteClId(db);
        try {
          await db.insert(clientes).values({
            idCliente: id,
            nomeExibido: nome,
            telefone,
            observacoes,
          });
          return ok({
            id,
            nome,
            telefone: telefone ?? '',
            observacoes: observacoes ?? '',
          });
        } catch (e) {
          const code =
            e && typeof e === 'object' && 'code' in e
              ? String((e as { code?: string }).code)
              : '';
          if (code === '23505') continue;
          const msg = e instanceof Error ? e.message : String(e);
          return fail('SERVER', msg);
        }
      }
      return fail('SERVER', 'Não foi possível gerar ID de cliente único.');
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
  .delete(
    '/api/clientes/:id',
    async ({ params }) => {
      const id = String(params.id || '').trim();
      if (!id) return fail('VALIDATION', 'id é obrigatório');
      try {
        const removed = await deleteClienteById(db, id);
        if (!removed) return fail('NOT_FOUND', 'Cliente não encontrado');
        return ok({ ok: true });
      } catch (e) {
        const msg = e instanceof Error ? e.message : String(e);
        return fail('SERVER', msg);
      }
    },
    { params: t.Object({ id: t.String() }) },
  )
  .get('/api/servicos', async () => ok({ items: await listServicosForApi(db) }))
  .get('/api/regras-mega', async () => ok({ items: await listRegrasMegaApi(db) }))
  .get('/api/pacotes', async () => ok({ items: await listPacotesApi(db) }))
  .get('/api/produtos', async () => ok({ items: await listProdutosApi(db) }))
  .patch(
    '/api/produtos/:id/estoque',
    async ({ params, body }) => {
      try {
        const id = Number.parseInt(String(params.id ?? '').trim(), 10);
        if (!Number.isFinite(id) || id <= 0) {
          return fail('VALIDATION', 'id inválido');
        }
        const ad = Number((body as { adicionar?: unknown }).adicionar);
        if (!Number.isFinite(ad) || ad <= 0) {
          return fail(
            'VALIDATION',
            'adicionar deve ser um número maior que zero',
          );
        }
        const item = await incrementarEstoqueProduto(db, id, ad);
        return ok({ item });
      } catch (e) {
        const msg = e instanceof Error ? e.message : String(e);
        if (/não encontrado/i.test(msg)) return fail('NOT_FOUND', msg);
        if (/maior que zero|inteiro/i.test(msg)) {
          return fail('VALIDATION', msg);
        }
        return fail('SERVER', msg);
      }
    },
    {
      params: t.Object({ id: t.String() }),
      body: t.Object(
        { adicionar: t.Number() },
        { additionalProperties: true },
      ),
    },
  )
  .get('/api/cabelos', async () => ok({ items: await listCabelosApi(db) }))
  .group('/api', (api) =>
    api
      /** POST antes do GET: evita edge cases em alguns ambientes com o mesmo prefixo. */
      .post(
        '/profissionais',
        async ({ body }) => {
          try {
            const nome = String((body as { nome?: string }).nome ?? '').trim();
            if (!nome) return fail('VALIDATION', 'Nome é obrigatório');
            const ativoRaw = (body as { ativo?: unknown }).ativo;
            let ativo = true;
            if (ativoRaw !== undefined) {
              if (
                ativoRaw === false ||
                ativoRaw === 0 ||
                ativoRaw === '0' ||
                ativoRaw === 'false'
              ) {
                ativo = false;
              } else {
                ativo = Boolean(ativoRaw);
              }
            }
            const item = await criarProfissional(db, { nome, ativo });
            return ok({ item });
          } catch (e) {
            const msg = e instanceof Error ? e.message : String(e);
            if (/obrigatório|Já existe|inválido/i.test(msg)) {
              return fail('VALIDATION', msg);
            }
            return fail('SERVER', msg);
          }
        },
        {
          body: t.Object(
            {
              nome: t.String(),
              ativo: t.Optional(t.Boolean()),
            },
            { additionalProperties: true },
          ),
        },
      )
      .get('/profissionais', async ({ query }) => {
        try {
          const q = query as Record<string, string | undefined>;
          const raw = String(q.incluir_inativos ?? q.incluirInativos ?? '').trim();
          const incluirInativos =
            raw === '1' ||
            raw.toLowerCase() === 'true' ||
            raw.toLowerCase() === 'yes';
          const items = await listProfissionaisForApi(db, { incluirInativos });
          return ok({ items });
        } catch (e) {
          const msg = e instanceof Error ? e.message : String(e);
          return fail('SERVER', msg);
        }
      })
      .patch(
        '/profissionais/:id',
        async ({ params, body }) => {
          try {
            const id = Number.parseInt(String(params.id).trim(), 10);
            if (!Number.isFinite(id) || id <= 0) {
              return fail('VALIDATION', 'id inválido');
            }
            const b = body as { nome?: string; ativo?: unknown };
            const patch: { nome?: string; ativo?: boolean } = {};
            if (b.nome !== undefined) patch.nome = String(b.nome);
            if (b.ativo !== undefined) {
              const v = b.ativo;
              if (v === false || v === 0 || v === '0' || v === 'false') {
                patch.ativo = false;
              } else {
                patch.ativo = Boolean(v);
              }
            }
            if (patch.nome !== undefined && !String(patch.nome).trim()) {
              return fail('VALIDATION', 'Nome é obrigatório');
            }
            if (patch.nome === undefined && b.ativo === undefined) {
              return fail('VALIDATION', 'Envie nome e/ou ativo');
            }
            const item = await atualizarProfissional(db, id, patch);
            return ok({ item });
          } catch (e) {
            const msg = e instanceof Error ? e.message : String(e);
            if (/não encontrado/i.test(msg)) {
              return fail('NOT_FOUND', msg);
            }
            if (/obrigatório|Já existe|inválido/i.test(msg)) {
              return fail('VALIDATION', msg);
            }
            return fail('SERVER', msg);
          }
        },
        {
          params: t.Object({ id: t.String() }),
          body: t.Object(
            {
              nome: t.Optional(t.String()),
              ativo: t.Optional(t.Boolean()),
            },
            { additionalProperties: true },
          ),
        },
      ),
  )
  .get('/api/categorias-financeiras', async () =>
    ok({ items: await listCategoriasFinanceirasApi(db) }),
  )
  .get('/api/movimentacoes', async ({ query }) => {
    try {
      const q = query as Record<string, string | undefined>;
      const nat = q.natureza;
      const items = await listMovimentacoesApi(db, {
        dataInicio: q.dataInicio ?? q.data_inicio,
        dataFim: q.dataFim ?? q.data_fim,
        natureza:
          nat === 'receita' || nat === 'despesa' ? nat : undefined,
      });
      return ok({ items });
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      return fail('SERVER', msg);
    }
  })
  .get('/api/caixa/dia', async ({ query }) => {
    try {
      const q = query as Record<string, string | undefined>;
      const data = String(q.data ?? '').trim();
      if (!data) return fail('VALIDATION', 'Query data é obrigatória (YYYY-MM-DD)');
      const resumo = await getCaixaDiaApi(db, data);
      return ok(resumo);
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      return fail('SERVER', msg);
    }
  })
  .post(
    '/api/movimentacoes',
    async ({ body }) => {
      try {
        const b = body as Record<string, unknown>;
        const id = await criarMovimentacaoManual(db, {
          data_mov: String(b.data_mov ?? ''),
          natureza: b.natureza === 'despesa' ? 'despesa' : 'receita',
          valor: Number(b.valor),
          categoria_id: Number(b.categoria_id),
          descricao:
            b.descricao != null ? String(b.descricao) : undefined,
          metodo_pagamento:
            b.metodo_pagamento != null
              ? String(b.metodo_pagamento)
              : undefined,
          id_atendimento:
            b.id_atendimento != null ? String(b.id_atendimento) : undefined,
        });
        return ok({ id });
      } catch (e) {
        const msg = e instanceof Error ? e.message : String(e);
        return fail('SERVER', msg);
      }
    },
    {
      body: t.Object({
        data_mov: t.String(),
        natureza: t.Union([t.Literal('receita'), t.Literal('despesa')]),
        valor: t.Number(),
        categoria_id: t.Number(),
        descricao: t.Optional(t.String()),
        metodo_pagamento: t.Optional(t.String()),
        id_atendimento: t.Optional(t.String()),
      }),
    },
  )
  .patch(
    '/api/movimentacoes/:id',
    async ({ params, body }) => {
      try {
        const id = Number.parseInt(String(params.id), 10);
        if (!Number.isFinite(id) || id <= 0) {
          return fail('VALIDATION', 'id inválido');
        }
        const b = body as Record<string, unknown>;
        const patch: {
          valor?: number;
          descricao?: string | null;
          categoria_id?: number;
          metodo_pagamento?: string | null;
        } = {};
        if (b.valor !== undefined) patch.valor = Number(b.valor);
        if (b.descricao !== undefined) {
          patch.descricao =
            b.descricao === null ? null : String(b.descricao);
        }
        if (b.categoria_id !== undefined) {
          patch.categoria_id = Number(b.categoria_id);
        }
        if (b.metodo_pagamento !== undefined) {
          patch.metodo_pagamento =
            b.metodo_pagamento === null
              ? null
              : String(b.metodo_pagamento);
        }
        await atualizarMovimentacaoPorId(db, id, patch);
        return ok({ ok: true });
      } catch (e) {
        const msg = e instanceof Error ? e.message : String(e);
        if (msg.includes('não encontrada')) {
          return fail('NOT_FOUND', msg);
        }
        return fail('SERVER', msg);
      }
    },
    {
      params: t.Object({ id: t.String() }),
      body: t.Object({
        valor: t.Optional(t.Number()),
        descricao: t.Optional(t.Union([t.String(), t.Null()])),
        categoria_id: t.Optional(t.Number()),
        metodo_pagamento: t.Optional(t.Union([t.String(), t.Null()])),
      }),
    },
  )
  .delete('/api/movimentacoes/:id', async ({ params }) => {
    try {
      const id = Number.parseInt(String(params.id), 10);
      if (!Number.isFinite(id) || id <= 0) {
        return fail('VALIDATION', 'id inválido');
      }
      const removed = await excluirMovimentacaoPorId(db, id);
      if (!removed) return fail('NOT_FOUND', 'Movimentação não encontrada');
      return ok({ ok: true });
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      return fail('SERVER', msg);
    }
  })
  .post(
    '/api/despesas',
    async ({ body }) => {
      try {
        const b = body as Record<string, unknown>;
        const res = await criarDespesaCadastro(db, {
          data_mov: String(b.data_mov ?? ''),
          valor: Number(b.valor),
          categoria_id: Number(b.categoria_id),
          descricao:
            b.descricao != null ? String(b.descricao) : undefined,
          metodo_pagamento:
            b.metodo_pagamento != null
              ? String(b.metodo_pagamento)
              : undefined,
          tipo: b.tipo != null ? String(b.tipo) : undefined,
          categoria_livre:
            b.categoria_livre != null
              ? String(b.categoria_livre)
              : undefined,
        });
        return ok(res);
      } catch (e) {
        const msg = e instanceof Error ? e.message : String(e);
        return fail('SERVER', msg);
      }
    },
    {
      body: t.Object({
        data_mov: t.String(),
        valor: t.Number(),
        categoria_id: t.Number(),
        descricao: t.Optional(t.String()),
        metodo_pagamento: t.Optional(t.String()),
        tipo: t.Optional(t.String()),
        categoria_livre: t.Optional(t.String()),
      }),
    },
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
      const q = query as Record<string, string | undefined>;
      const idAt = String(
        q.idAtendimento ?? q.id_atendimento ?? '',
      ).trim();
      const items = await listAtendimentosRaw(
        db,
        query.dataInicio,
        query.dataFim,
        idAt || undefined,
      );
      return ok({ items });
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      return fail('SERVER', msg);
    }
  })
  .post(
    '/api/atendimentos',
    async ({ body, query }) => {
    const b = (body ?? {}) as Record<string, unknown>;
    const qAcao = String(query?.acao ?? '').trim().toLowerCase();
    const bAcao = String(b.acao ?? '').trim().toLowerCase();
    const isFinalizar = qAcao === 'finalizar' || bAcao === 'finalizar';
    const isConfirmarPagamento =
      qAcao === 'confirmar-pagamento' || bAcao === 'confirmar-pagamento';
    const isExcluir = qAcao === 'excluir' || bAcao === 'excluir';
    if (isFinalizar) {
      const idAt = String(
        b.id_atendimento ?? (b as { idAtendimento?: string }).idAtendimento ?? '',
      ).trim();
      const desconto =
        b.desconto != null ? String(b.desconto) : undefined;
      return execFinalizarCobranca({ id_atendimento: idAt, desconto });
    }
    if (isConfirmarPagamento) {
      const idAt = String(
        b.id_atendimento ?? (b as { idAtendimento?: string }).idAtendimento ?? '',
      ).trim();
      const metodo =
        b.metodo != null ? String(b.metodo).trim() : undefined;
      return execConfirmarPagamento({ id_atendimento: idAt, metodo });
    }
    if (isExcluir) {
      const idAt = String(
        b.id_atendimento ?? (b as { idAtendimento?: string }).idAtendimento ?? '',
      ).trim();
      return execExcluirAtendimento({ id_atendimento: idAt });
    }
    try {
      const result = await createAtendimento(
        db,
        body as unknown as CreateAtendimentoPayload,
      );
      return ok(result);
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      return fail('SERVER', msg);
    }
  },
    { body: postAtendimentoMutationBody },
  )
  .get('/api/folha', async ({ query, request }) => {
    const denied = requireAdminPin(request);
    if (denied) return denied;
    try {
      const q = query as Record<string, string | undefined>;
      const periodo = String(q.periodo ?? '').trim();
      if (!periodo) {
        return fail('VALIDATION', 'Query periodo é obrigatória (YYYY-MM)');
      }
      const items = await listFolhaPorPeriodoApi(db, periodo);
      return ok({ items });
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      if (/inválido/i.test(msg)) {
        return fail('VALIDATION', msg);
      }
      return fail('SERVER', msg);
    }
  })
  .post(
    '/api/folha/recalcular-comissoes',
    async ({ body, request }) => {
      const denied = requireAdminPin(request);
      if (denied) return denied;
      try {
        const b = body as { periodo?: string; profissional_id?: number };
        const periodo = String(b.periodo ?? '').trim();
        const rawPid = b.profissional_id;
        const profissionalId =
          rawPid != null && Number.isFinite(Number(rawPid)) && Number(rawPid) > 0
            ? Number(rawPid)
            : undefined;
        const r = await recalcularTotaisComissaoFolhaPorPeriodo(db, periodo, {
          profissionalId,
        });
        return ok(r);
      } catch (e) {
        const msg = e instanceof Error ? e.message : String(e);
        if (/inválido/i.test(msg)) {
          return fail('VALIDATION', msg);
        }
        return fail('SERVER', msg);
      }
    },
    {
      body: t.Object({
        periodo: t.String(),
        profissional_id: t.Optional(t.Number()),
      }),
    },
  )
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
