import { and, asc, desc, eq, gte, lte, sql } from 'drizzle-orm';
import type { Db } from '../db';
import {
  categoriasFinanceiras,
  despesas,
  movimentacoes,
  naturezaFinanceiraEnum,
} from '../db/schema';

export const ORIGEM_ATENDIMENTO_CONFIRMACAO = 'atendimento_confirmacao';
export const ORIGEM_MANUAL = 'manual';
/** Despesa registada pelo cadastro (detalhe em `despesas`; valor só em `movimentacoes`). */
export const ORIGEM_DESPESA_CADASTRO = 'despesa_cadastro';

export type NaturezaFinanceira =
  (typeof naturezaFinanceiraEnum.enumValues)[number];

export function toNumberPt(v: unknown): number | null {
  if (v === '' || v == null) return null;
  if (typeof v === 'number') {
    return Number.isFinite(v) ? v : null;
  }
  let t = String(v)
    .replace(/R\$/gi, '')
    .replace(/\u00a0/g, ' ')
    .replace(/\s/g, '')
    .trim();
  if (!t) return null;
  if (t.includes(',')) {
    t = t.replace(/\./g, '').replace(',', '.');
  }
  const n = parseFloat(t.replace(/[^\d.-]/g, ''));
  return Number.isNaN(n) ? null : n;
}

/** Texto pt-BR para colunas tipo planilha (ex.: folha, desconto). */
export function formatMoedaReciboPt(n: number): string {
  const r = Math.round(n * 100) / 100;
  return `R$ ${r.toFixed(2).replace('.', ',')}`;
}

const SLUG_POR_TIPO: Record<string, string> = {
  Serviço: 'receita_servicos',
  Mega: 'receita_mega',
  Pacote: 'receita_pacotes',
  Produto: 'receita_produtos',
  Cabelo: 'receita_cabelo',
};

const ORDEM_TIPO: string[] = [
  'Pacote',
  'Mega',
  'Serviço',
  'Produto',
  'Cabelo',
];

type AtendLinha = {
  tipo: string | null;
  valor: string | null;
  valorManual: string | null;
  desconto: string | null;
  data: string | Date | null;
};

export function totalLiquidoConfirmacao(rows: AtendLinha[]): number {
  let sum = 0;
  for (const r of rows) {
    const raw =
      r.valorManual != null && String(r.valorManual).trim()
        ? r.valorManual
        : r.valor;
    const v = toNumberPt(raw);
    if (v !== null) sum += v;
  }
  const d = rows[0] ? toNumberPt(rows[0].desconto) : null;
  if (d !== null && d > 0) sum -= d;
  return Math.round(sum * 100) / 100;
}

/** Contagem por `tipo` nas linhas `atendimentos`; a pivot `atendimento_itens` não altera este fluxo. */
export function slugCategoriaReceitaPredominante(rows: AtendLinha[]): string {
  const counts = new Map<string, number>();
  for (const r of rows) {
    const t = String(r.tipo || '').trim();
    if (!SLUG_POR_TIPO[t]) continue;
    counts.set(t, (counts.get(t) ?? 0) + 1);
  }
  let bestTipo: string | null = null;
  let bestN = -1;
  for (const t of ORDEM_TIPO) {
    const n = counts.get(t) ?? 0;
    if (n > bestN) {
      bestN = n;
      bestTipo = t;
    }
  }
  if (bestTipo && bestN > 0) {
    return SLUG_POR_TIPO[bestTipo] ?? 'receita_servicos';
  }
  return 'receita_servicos';
}

function ymdFromDate(d: string | Date | null | undefined): string {
  if (d == null) return '';
  if (typeof d === 'string') return d.slice(0, 10);
  if (d instanceof Date) {
    const m = d.getMonth() + 1;
    const day = d.getDate();
    return `${d.getFullYear()}-${m < 10 ? `0${m}` : m}-${day < 10 ? `0${day}` : day}`;
  }
  return '';
}

export async function getCategoriaIdPorSlug(
  db: Db,
  slug: string,
): Promise<number> {
  const [r] = await db
    .select({ id: categoriasFinanceiras.id })
    .from(categoriasFinanceiras)
    .where(eq(categoriasFinanceiras.slug, slug.trim()))
    .limit(1);
  if (!r) {
    throw new Error(
      `Categoria financeira não encontrada (slug: ${slug}). Corra a migração 0003.`,
    );
  }
  return r.id;
}

/**
 * Garante uma única receita por `id_atendimento` com origem de confirmação (índice único parcial).
 */
export async function inserirReceitaConfirmacaoPagamento(
  db: Db,
  o: {
    idAtendimento: string;
    dataMov: string;
    valorTotal: number;
    categoriaSlug: string;
    metodoPagamento: string;
    descricao: string | null;
  },
): Promise<number | null> {
  if (o.valorTotal <= 0) return null;
  const [existente] = await db
    .select({ id: movimentacoes.id })
    .from(movimentacoes)
    .where(
      and(
        eq(movimentacoes.idAtendimento, o.idAtendimento),
        eq(movimentacoes.origem, ORIGEM_ATENDIMENTO_CONFIRMACAO),
        eq(movimentacoes.natureza, 'receita'),
      ),
    )
    .limit(1);
  if (existente) return existente.id;

  const categoriaId = await getCategoriaIdPorSlug(db, o.categoriaSlug);
  const valorStr = o.valorTotal.toFixed(2);
  try {
    const [ins] = await db
      .insert(movimentacoes)
      .values({
        dataMov: o.dataMov,
        natureza: 'receita',
        valor: valorStr,
        categoriaId,
        descricao: o.descricao,
        idAtendimento: o.idAtendimento,
        metodoPagamento: o.metodoPagamento,
        origem: ORIGEM_ATENDIMENTO_CONFIRMACAO,
      })
      .returning({ id: movimentacoes.id });
    return ins?.id ?? null;
  } catch (e: unknown) {
    const code =
      e && typeof e === 'object' && 'code' in e
        ? String((e as { code?: string }).code)
        : '';
    if (code !== '23505') throw e;
    const [again] = await db
      .select({ id: movimentacoes.id })
      .from(movimentacoes)
      .where(
        and(
          eq(movimentacoes.idAtendimento, o.idAtendimento),
          eq(movimentacoes.origem, ORIGEM_ATENDIMENTO_CONFIRMACAO),
          eq(movimentacoes.natureza, 'receita'),
        ),
      )
      .limit(1);
    return again?.id ?? null;
  }
}

export async function listCategoriasFinanceirasApi(db: Db) {
  const rows = await db
    .select()
    .from(categoriasFinanceiras)
    .where(eq(categoriasFinanceiras.ativo, true))
    .orderBy(asc(categoriasFinanceiras.ordem), asc(categoriasFinanceiras.id));
  return rows.map((r) => ({
    id: r.id,
    nome: r.nome,
    natureza: r.natureza,
    slug: r.slug,
    ordem: r.ordem,
  }));
}

export async function listMovimentacoesApi(
  db: Db,
  opts?: { dataInicio?: string; dataFim?: string; natureza?: NaturezaFinanceira },
) {
  const di = String(opts?.dataInicio ?? '').trim();
  const df = String(opts?.dataFim ?? '').trim();
  const nat = opts?.natureza;

  const conds = [];
  if (di) conds.push(gte(movimentacoes.dataMov, di));
  if (df) conds.push(lte(movimentacoes.dataMov, df));
  if (nat) conds.push(eq(movimentacoes.natureza, nat));

  const base = db
    .select({
      id: movimentacoes.id,
      data_mov: movimentacoes.dataMov,
      natureza: movimentacoes.natureza,
      valor: movimentacoes.valor,
      categoria_id: movimentacoes.categoriaId,
      descricao: movimentacoes.descricao,
      id_atendimento: movimentacoes.idAtendimento,
      metodo_pagamento: movimentacoes.metodoPagamento,
      origem: movimentacoes.origem,
      created_at: movimentacoes.createdAt,
      despesa_tipo: despesas.tipo,
      despesa_categoria_livre: despesas.categoria,
    })
    .from(movimentacoes)
    .leftJoin(despesas, eq(despesas.movimentacaoId, movimentacoes.id));

  const rows = conds.length
    ? await base
        .where(and(...conds))
        .orderBy(desc(movimentacoes.dataMov), desc(movimentacoes.id))
    : await base.orderBy(
        desc(movimentacoes.dataMov),
        desc(movimentacoes.id),
      );
  return rows.map((r) => ({
    id: r.id,
    data_mov: r.data_mov,
    natureza: r.natureza,
    valor: String(r.valor),
    categoria_id: r.categoria_id,
    descricao: r.descricao,
    id_atendimento: r.id_atendimento,
    metodo_pagamento: r.metodo_pagamento,
    origem: r.origem,
    created_at: r.created_at,
    despesa_tipo: r.despesa_tipo ?? null,
    despesa_categoria_livre: r.despesa_categoria_livre ?? null,
  }));
}

export async function getCaixaDiaApi(db: Db, data: string) {
  const d = data.trim().slice(0, 10);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(d)) {
    throw new Error('data inválida; use YYYY-MM-DD');
  }

  const [totais] = await db
    .select({
      total_receitas: sql<string>`coalesce(sum(case when ${movimentacoes.natureza} = 'receita' then ${movimentacoes.valor}::numeric else 0 end), 0)`,
      total_despesas: sql<string>`coalesce(sum(case when ${movimentacoes.natureza} = 'despesa' then ${movimentacoes.valor}::numeric else 0 end), 0)`,
    })
    .from(movimentacoes)
    .where(eq(movimentacoes.dataMov, d));

  const porMetodo = await db
    .select({
      metodo: movimentacoes.metodoPagamento,
      total: sql<string>`coalesce(sum(${movimentacoes.valor}::numeric), 0)`,
    })
    .from(movimentacoes)
    .where(
      and(eq(movimentacoes.dataMov, d), eq(movimentacoes.natureza, 'receita')),
    )
    .groupBy(movimentacoes.metodoPagamento);

  return {
    data: d,
    total_receitas: String(totais?.total_receitas ?? '0'),
    total_despesas: String(totais?.total_despesas ?? '0'),
    saldo_dia: (
      parseFloat(String(totais?.total_receitas ?? '0')) -
      parseFloat(String(totais?.total_despesas ?? '0'))
    ).toFixed(2),
    receitas_por_metodo: porMetodo.map((x) => ({
      metodo: x.metodo ?? '(sem método)',
      total: String(x.total),
    })),
  };
}

export async function criarMovimentacaoManual(
  db: Db,
  body: {
    data_mov: string;
    natureza: NaturezaFinanceira;
    valor: number;
    categoria_id: number;
    descricao?: string;
    metodo_pagamento?: string;
    id_atendimento?: string;
  },
): Promise<number> {
  const d = String(body.data_mov || '').trim().slice(0, 10);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(d)) {
    throw new Error('data_mov inválida; use YYYY-MM-DD');
  }
  if (!Number.isFinite(body.valor) || body.valor === 0) {
    throw new Error('valor deve ser um número diferente de zero');
  }
  const vStr = Math.abs(body.valor).toFixed(2);

  const [cat] = await db
    .select()
    .from(categoriasFinanceiras)
    .where(eq(categoriasFinanceiras.id, body.categoria_id))
    .limit(1);
  if (!cat) throw new Error('categoria_id inválida');
  if (cat.natureza !== body.natureza) {
    throw new Error('natureza não corresponde à categoria escolhida');
  }

  const [ins] = await db
    .insert(movimentacoes)
    .values({
      dataMov: d,
      natureza: body.natureza,
      valor: vStr,
      categoriaId: body.categoria_id,
      descricao: body.descricao != null ? String(body.descricao) : null,
      idAtendimento:
        body.id_atendimento != null && String(body.id_atendimento).trim()
          ? String(body.id_atendimento).trim()
          : null,
      metodoPagamento:
        body.metodo_pagamento != null && String(body.metodo_pagamento).trim()
          ? String(body.metodo_pagamento).trim()
          : null,
      origem: ORIGEM_MANUAL,
    })
    .returning({ id: movimentacoes.id });
  if (!ins) throw new Error('Falha ao gravar movimentação');
  return ins.id;
}

export async function atualizarMovimentacaoPorId(
  db: Db,
  id: number,
  patch: {
    valor?: number;
    descricao?: string | null;
    categoria_id?: number;
    metodo_pagamento?: string | null;
  },
): Promise<void> {
  if (!Number.isFinite(id) || id <= 0) {
    throw new Error('id inválido');
  }

  const [row] = await db
    .select()
    .from(movimentacoes)
    .where(eq(movimentacoes.id, id))
    .limit(1);
  if (!row) throw new Error('Movimentação não encontrada');

  const updates: {
    valor?: string;
    descricao?: string | null;
    categoriaId?: number;
    metodoPagamento?: string | null;
  } = {};

  if (patch.valor !== undefined) {
    if (!Number.isFinite(patch.valor) || patch.valor === 0) {
      throw new Error('valor deve ser um número diferente de zero');
    }
    updates.valor = Math.abs(patch.valor).toFixed(2);
  }

  if (patch.descricao !== undefined) {
    const t = String(patch.descricao ?? '').trim();
    updates.descricao = t ? t : null;
  }

  if (patch.metodo_pagamento !== undefined) {
    const t = String(patch.metodo_pagamento ?? '').trim();
    updates.metodoPagamento = t ? t : null;
  }

  if (patch.categoria_id !== undefined) {
    const [cat] = await db
      .select()
      .from(categoriasFinanceiras)
      .where(eq(categoriasFinanceiras.id, patch.categoria_id))
      .limit(1);
    if (!cat) throw new Error('categoria_id inválida');
    if (cat.natureza !== row.natureza) {
      throw new Error('A categoria deve ter a mesma natureza da movimentação');
    }
    updates.categoriaId = patch.categoria_id;
  }

  if (Object.keys(updates).length === 0) {
    return;
  }

  await db.update(movimentacoes).set(updates).where(eq(movimentacoes.id, id));
}

export async function excluirMovimentacaoPorId(db: Db, id: number): Promise<boolean> {
  if (!Number.isFinite(id) || id <= 0) {
    throw new Error('id inválido');
  }
  const del = await db
    .delete(movimentacoes)
    .where(eq(movimentacoes.id, id))
    .returning({ id: movimentacoes.id });
  return del.length > 0;
}

/**
 * Insere `movimentacoes` (despesa) e `despesas` na mesma transação. Saldo/caixa continuam a usar só `movimentacoes`.
 */
export async function criarDespesaCadastro(
  db: Db,
  body: {
    data_mov: string;
    valor: number;
    categoria_id: number;
    descricao?: string;
    metodo_pagamento?: string;
    tipo?: string;
    categoria_livre?: string;
  },
): Promise<{ movimentacao_id: number; despesa_id: number }> {
  const d = String(body.data_mov || '').trim().slice(0, 10);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(d)) {
    throw new Error('data_mov inválida; use YYYY-MM-DD');
  }
  if (!Number.isFinite(body.valor) || body.valor === 0) {
    throw new Error('valor deve ser um número diferente de zero');
  }
  const vStr = Math.abs(body.valor).toFixed(2);

  const [cat] = await db
    .select()
    .from(categoriasFinanceiras)
    .where(eq(categoriasFinanceiras.id, body.categoria_id))
    .limit(1);
  if (!cat) throw new Error('categoria_id inválida');
  if (cat.natureza !== 'despesa') {
    throw new Error('A categoria deve ser de natureza despesa');
  }

  return await db.transaction(async (tx) => {
    const [mov] = await tx
      .insert(movimentacoes)
      .values({
        dataMov: d,
        natureza: 'despesa',
        valor: vStr,
        categoriaId: body.categoria_id,
        descricao:
          body.descricao != null && String(body.descricao).trim()
            ? String(body.descricao).trim()
            : null,
        idAtendimento: null,
        metodoPagamento:
          body.metodo_pagamento != null &&
          String(body.metodo_pagamento).trim()
            ? String(body.metodo_pagamento).trim()
            : null,
        origem: ORIGEM_DESPESA_CADASTRO,
      })
      .returning({ id: movimentacoes.id });
    if (!mov) throw new Error('Falha ao gravar movimentação');

    const [desp] = await tx
      .insert(despesas)
      .values({
        movimentacaoId: mov.id,
        dataRegisto: d,
        tipo:
          body.tipo != null && String(body.tipo).trim()
            ? String(body.tipo).trim()
            : null,
        categoria:
          body.categoria_livre != null && String(body.categoria_livre).trim()
            ? String(body.categoria_livre).trim()
            : null,
      })
      .returning({ id: despesas.id });
    if (!desp) throw new Error('Falha ao gravar detalhe da despesa');

    return { movimentacao_id: mov.id, despesa_id: desp.id };
  });
}
