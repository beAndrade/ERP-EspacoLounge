import { and, asc, desc, eq, gte, inArray, lte, sql } from 'drizzle-orm';
import type { Db } from '../db';
import {
  atendimentos,
  atendimentosPedido,
  categoriasFinanceiras,
  comandaPagamentos,
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

export type FinTransacaoItemTipo = 'movimentacao' | 'pendencia';

/** Linha unificada para `GET /api/financeiro/transacoes`. */
export interface FinTransacaoItemApi {
  tipo: FinTransacaoItemTipo;
  /** ID positivo = `movimentacoes.id`; negativo = `-comanda_pagamentos.id`. */
  id_ui: number;
  data_mov: string;
  natureza: 'receita' | 'despesa';
  valor: string;
  categoria_id: number;
  categoria_nome: string;
  descricao: string | null;
  id_atendimento: string | null;
  metodo_pagamento: string | null;
  origem: string;
  numero_comanda: number | null;
  nome_cliente: string | null;
  id_cliente: string | null;
  subtitulo: string;
  origem_label: string;
  movimentacao_id: number | null;
  comanda_pagamento_id: number | null;
  status: 'pago' | 'atrasado';
  editavel: boolean;
}

function validarIntervaloDatas(di: string, df: string): { di: string; df: string } {
  const a = di.trim().slice(0, 10);
  const b = df.trim().slice(0, 10);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(a) || !/^\d{4}-\d{2}-\d{2}$/.test(b)) {
    throw new Error('dataInicio e dataFim são obrigatórias (YYYY-MM-DD)');
  }
  if (a > b) throw new Error('dataInicio não pode ser posterior a dataFim');
  return { di: a, df: b };
}

function rotuloOrigemApi(origem: string, numeroComanda: number | null): string {
  if (numeroComanda != null && numeroComanda > 0) {
    return `C#${numeroComanda}`;
  }
  const o = String(origem || '').trim();
  if (o === ORIGEM_ATENDIMENTO_CONFIRMACAO) return 'Confirmação';
  if (o === ORIGEM_MANUAL) return 'Manual';
  if (o === ORIGEM_DESPESA_CADASTRO) return 'Despesa';
  if (o === 'comanda_pagamento') return 'Comanda';
  return o || '—';
}

function subtituloTransacao(
  numeroComanda: number | null,
  nomeCliente: string,
  descricao: string | null,
  tipo: FinTransacaoItemTipo,
): string {
  const nome = String(nomeCliente || '').trim() || 'cliente';
  if (numeroComanda != null && numeroComanda > 0) {
    return `Referente à comanda #${numeroComanda} para ${nome}`;
  }
  const d = String(descricao ?? '').trim();
  if (d) return d;
  return tipo === 'pendencia' ? 'Prestação pendente' : '—';
}

async function mapaPagamentoIdPorMovimentacaoId(
  db: Db,
  movIds: number[],
): Promise<Map<number, number>> {
  const uniq = [...new Set(movIds.filter((id) => Number.isFinite(id) && id > 0))];
  const map = new Map<number, number>();
  if (uniq.length === 0) return map;

  const rows = await db
    .select({
      movId: comandaPagamentos.movimentacaoId,
      pagId: comandaPagamentos.id,
    })
    .from(comandaPagamentos)
    .where(inArray(comandaPagamentos.movimentacaoId, uniq));

  for (const r of rows) {
    const mid = r.movId;
    const pid = r.pagId;
    if (mid != null && pid > 0 && !map.has(mid)) {
      map.set(mid, pid);
    }
  }
  return map;
}

async function mapaIdClientePorAtendimento(
  db: Db,
  ids: string[],
): Promise<Map<string, string>> {
  const uniq = [...new Set(ids.map((x) => String(x || '').trim()).filter(Boolean))];
  const map = new Map<string, string>();
  if (uniq.length === 0) return map;

  const linhas = await db
    .select({
      idAtendimento: atendimentos.idAtendimento,
      idCliente: atendimentos.idCliente,
    })
    .from(atendimentos)
    .where(inArray(atendimentos.idAtendimento, uniq))
    .orderBy(asc(atendimentos.id));

  for (const r of linhas) {
    const id = String(r.idAtendimento || '').trim();
    const cid = String(r.idCliente || '').trim();
    if (!id || !cid || map.has(id)) continue;
    map.set(id, cid);
  }
  return map;
}

async function mapaNomeClientePorAtendimento(
  db: Db,
  ids: string[],
): Promise<Map<string, string>> {
  const uniq = [...new Set(ids.map((x) => String(x || '').trim()).filter(Boolean))];
  const map = new Map<string, string>();
  if (uniq.length === 0) return map;

  const linhas = await db
    .select({
      idAtendimento: atendimentos.idAtendimento,
      nomeCliente: atendimentos.nomeCliente,
    })
    .from(atendimentos)
    .where(inArray(atendimentos.idAtendimento, uniq))
    .orderBy(asc(atendimentos.id));

  for (const r of linhas) {
    const id = String(r.idAtendimento || '').trim();
    if (!id || map.has(id)) continue;
    map.set(id, String(r.nomeCliente ?? '').trim());
  }
  return map;
}

async function mapaNumeroComandaPorAtendimento(
  db: Db,
  ids: string[],
): Promise<Map<string, number>> {
  const uniq = [...new Set(ids.map((x) => String(x || '').trim()).filter(Boolean))];
  const map = new Map<string, number>();
  if (uniq.length === 0) return map;

  const rows = await db
    .select({
      idAtendimento: atendimentosPedido.idAtendimento,
      numeroComanda: atendimentosPedido.numeroComanda,
    })
    .from(atendimentosPedido)
    .where(inArray(atendimentosPedido.idAtendimento, uniq));

  for (const r of rows) {
    const id = String(r.idAtendimento || '').trim();
    if (!id) continue;
    map.set(id, r.numeroComanda);
  }
  return map;
}

function movimentacaoEditavel(origem: string): boolean {
  const o = String(origem || '').trim();
  return o === ORIGEM_MANUAL || o === ORIGEM_DESPESA_CADASTRO;
}

/**
 * Lista movimentações enriquecidas + prestações `pendente` de comandas no período.
 */
export async function listTransacoesFinanceirasApi(
  db: Db,
  opts: { dataInicio: string; dataFim: string },
): Promise<FinTransacaoItemApi[]> {
  const { di, df } = validarIntervaloDatas(opts.dataInicio, opts.dataFim);

  const movRows = await db
    .select({
      id: movimentacoes.id,
      data_mov: movimentacoes.dataMov,
      natureza: movimentacoes.natureza,
      valor: movimentacoes.valor,
      categoria_id: movimentacoes.categoriaId,
      categoria_nome: categoriasFinanceiras.nome,
      descricao: movimentacoes.descricao,
      id_atendimento: movimentacoes.idAtendimento,
      metodo_pagamento: movimentacoes.metodoPagamento,
      origem: movimentacoes.origem,
    })
    .from(movimentacoes)
    .innerJoin(
      categoriasFinanceiras,
      eq(categoriasFinanceiras.id, movimentacoes.categoriaId),
    )
    .where(and(gte(movimentacoes.dataMov, di), lte(movimentacoes.dataMov, df)))
    .orderBy(desc(movimentacoes.dataMov), desc(movimentacoes.id));

  const catReceitaPadraoId = await getCategoriaIdPorSlug(db, 'receita_servicos');
  const [catReceitaPadrao] = await db
    .select({ nome: categoriasFinanceiras.nome })
    .from(categoriasFinanceiras)
    .where(eq(categoriasFinanceiras.id, catReceitaPadraoId))
    .limit(1);
  const catReceitaPadraoNome =
    String(catReceitaPadrao?.nome ?? '').trim() || 'Serviços';

  const pendRows = await db
    .select({
      id: comandaPagamentos.id,
      data_pagamento: comandaPagamentos.dataPagamento,
      valor: comandaPagamentos.valor,
      metodo_rotulo: comandaPagamentos.metodoRotulo,
      id_atendimento: comandaPagamentos.idAtendimento,
    })
    .from(comandaPagamentos)
    .where(
      and(
        eq(comandaPagamentos.metodo, 'pendente'),
        gte(comandaPagamentos.dataPagamento, di),
        lte(comandaPagamentos.dataPagamento, df),
      ),
    )
    .orderBy(
      desc(comandaPagamentos.dataPagamento),
      desc(comandaPagamentos.id),
    );

  const idsAt = [
    ...movRows.map((r) => r.id_atendimento),
    ...pendRows.map((r) => r.id_atendimento),
  ].filter((x): x is string => x != null && String(x).trim() !== '');

  const [nomes, numeros, clientes, pagPorMov] = await Promise.all([
    mapaNomeClientePorAtendimento(db, idsAt),
    mapaNumeroComandaPorAtendimento(db, idsAt),
    mapaIdClientePorAtendimento(db, idsAt),
    mapaPagamentoIdPorMovimentacaoId(
      db,
      movRows.map((r) => r.id),
    ),
  ]);

  const items: FinTransacaoItemApi[] = [];

  for (const r of movRows) {
    const idAt = r.id_atendimento ? String(r.id_atendimento).trim() : '';
    const numero = idAt ? (numeros.get(idAt) ?? null) : null;
    const nomeCli = idAt ? (nomes.get(idAt) ?? null) : null;
    const idCli = idAt ? (clientes.get(idAt) ?? null) : null;
    const catNome = String(r.categoria_nome ?? '').trim() || '—';
    items.push({
      tipo: 'movimentacao',
      id_ui: r.id,
      data_mov: String(r.data_mov),
      natureza: r.natureza,
      valor: String(r.valor),
      categoria_id: r.categoria_id,
      categoria_nome: catNome,
      descricao: r.descricao,
      id_atendimento: idAt || null,
      metodo_pagamento: r.metodo_pagamento,
      origem: r.origem,
      numero_comanda: numero,
      nome_cliente: nomeCli,
      id_cliente: idCli,
      subtitulo: subtituloTransacao(numero, nomeCli ?? '', r.descricao, 'movimentacao'),
      origem_label: rotuloOrigemApi(r.origem, numero),
      movimentacao_id: r.id,
      comanda_pagamento_id: pagPorMov.get(r.id) ?? null,
      status: 'pago',
      editavel: movimentacaoEditavel(r.origem),
    });
  }

  for (const r of pendRows) {
    const idAt = String(r.id_atendimento || '').trim();
    const numero = numeros.get(idAt) ?? null;
    const nomeCli = nomes.get(idAt) ?? null;
    const idCli = clientes.get(idAt) ?? null;
    const forma = String(r.metodo_rotulo ?? '').trim() || 'Pendente';
    items.push({
      tipo: 'pendencia',
      id_ui: -r.id,
      data_mov: String(r.data_pagamento),
      natureza: 'receita',
      valor: String(r.valor),
      categoria_id: catReceitaPadraoId,
      categoria_nome: catReceitaPadraoNome,
      descricao: null,
      id_atendimento: idAt || null,
      metodo_pagamento: forma,
      origem: 'comanda_pendente',
      numero_comanda: numero,
      nome_cliente: nomeCli,
      id_cliente: idCli,
      subtitulo: subtituloTransacao(numero, nomeCli ?? '', null, 'pendencia'),
      origem_label: rotuloOrigemApi('comanda_pagamento', numero),
      movimentacao_id: null,
      comanda_pagamento_id: r.id,
      status: 'atrasado',
      editavel: false,
    });
  }

  items.sort((a, b) => {
    const d = b.data_mov.localeCompare(a.data_mov);
    if (d !== 0) return d;
    return b.id_ui - a.id_ui;
  });

  return items;
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
