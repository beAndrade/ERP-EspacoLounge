import { and, asc, desc, eq, gte, inArray, isNotNull, isNull, lte, sql } from 'drizzle-orm';
import type { Db } from '../db';
import {
  mapaBaixaAutomaticaFormas,
  mapaTaxaFormas,
  metodoTemBaixaAutomatica,
  taxaFormaPorMetodo,
} from './finance-cadastros-domain';
import {
  atendimentos,
  atendimentosPedido,
  categoriasFinanceiras,
  clientes,
  comandaPagamentos,
  despesas,
  folha,
  movimentacoes,
  naturezaFinanceiraEnum,
  pagamentos,
  profissionais,
} from '../db/schema';
import { descricaoParaListaLinha } from '../modules/beauty/domain/descricao-lista';
import { instantEmDateParaSqlLocalBrasil } from '../lib/sql-local-datetime';

export const ORIGEM_ATENDIMENTO_CONFIRMACAO = 'atendimento_confirmacao';
export const ORIGEM_MANUAL = 'manual';
/** Despesa registada pelo cadastro (detalhe em `despesas`; valor só em `movimentacoes`). */
export const ORIGEM_DESPESA_CADASTRO = 'despesa_cadastro';
/** Pagamento de comissão à profissional (espelha linha em `pagamentos`). */
export const ORIGEM_COMISSAO_PAGAMENTO = 'comissao_pagamento';

/** `id_ui` negativo para linhas legadas de `pagamentos` em Transações (evita colisão com pendências). */
const PAGAMENTO_TRANSACAO_ID_OFFSET = 2_000_000;

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

/** Texto pt-BR canónico para colunas tipo planilha (ex.: folha, desconto). */
export function formatMoedaReciboPt(n: number): string {
  const r = Math.round(n * 100) / 100;
  if (!Number.isFinite(r)) return 'R$ 0,00';
  const sign = r < 0 ? '-' : '';
  const formatted = Math.abs(r).toLocaleString('pt-BR', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
  return `${sign}R$ ${formatted}`;
}

const SLUG_POR_TIPO: Record<string, string> = {
  Serviço: 'receita_servicos',
  Mega: 'receita_mega',
  Pacote: 'receita_pacotes',
  'Pacote Adesivo+Queratina': 'receita_pacotes',
  /** Legado (pré-0051). */
  'Pacote Queratina': 'receita_pacotes',
  Produto: 'receita_produtos',
  Cabelo: 'receita_cabelo',
};

const ORDEM_TIPO: string[] = [
  'Pacote',
  'Pacote Adesivo+Queratina',
  'Pacote Queratina',
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

function ymdFromTimestamp(v: string | Date | null | undefined): string | null {
  if (v == null) return null;
  if (v instanceof Date) {
    const s = instantEmDateParaSqlLocalBrasil(v);
    return (s ?? '').trim().slice(0, 10) || null;
  }
  const s = String(v).trim();
  if (/^\d{4}-\d{2}-\d{2}/.test(s)) return s.slice(0, 10);
  const d = new Date(s);
  if (Number.isNaN(d.getTime())) return null;
  const local = instantEmDateParaSqlLocalBrasil(d);
  return (local ?? '').trim().slice(0, 10) || null;
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
        pagoEm: o.dataMov,
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
  /** Data de criação do lançamento (`YYYY-MM-DD`), para filtro por competência. */
  criado_em: string;
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
  status: 'pago' | 'atrasado' | 'em_aberto';
  editavel: boolean;
  /** Forma de pagamento com baixa automática (cadastro financeiro). */
  metodo_baixa_automatica: boolean;
  pago_em: string | null;
  /** Taxa percentual da forma (só receitas; 0 em despesas). */
  taxa_percentual: number;
  /** Taxa fixa em R$ da forma (só receitas; 0 em despesas). */
  taxa_fixa: number;
}

function ymdHojeSalao(): string {
  const s = instantEmDateParaSqlLocalBrasil(new Date());
  return (s ?? '').trim().slice(0, 10) || new Date().toISOString().slice(0, 10);
}

/** Prestação pendente: vencimento antes de hoje → atrasado; hoje ou futuro → em aberto. */
function statusPendenciaComanda(dataVencimentoYmd: string): 'atrasado' | 'em_aberto' {
  const venc = String(dataVencimentoYmd ?? '').trim().slice(0, 10);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(venc)) return 'atrasado';
  return venc < ymdHojeSalao() ? 'atrasado' : 'em_aberto';
}

function statusMovimentacaoPagamento(
  dataMovYmd: string,
  pagoEmYmd: string | null | undefined,
): 'pago' | 'atrasado' | 'em_aberto' {
  const pago = String(pagoEmYmd ?? '').trim().slice(0, 10);
  if (/^\d{4}-\d{2}-\d{2}$/.test(pago)) return 'pago';
  const mov = String(dataMovYmd ?? '').trim().slice(0, 10);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(mov)) return 'em_aberto';
  return mov < ymdHojeSalao() ? 'atrasado' : 'em_aberto';
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

function rotuloOrigemApi(
  origem: string,
  numeroComanda: number | null,
  categoriaNome?: string | null,
): string {
  if (numeroComanda != null && numeroComanda > 0) {
    return `C#${numeroComanda}`;
  }
  const cat = String(categoriaNome ?? '').trim();
  if (/^comiss[aã]o$/i.test(cat)) return 'Comissão';
  const o = String(origem || '').trim();
  if (o === ORIGEM_ATENDIMENTO_CONFIRMACAO) return 'Confirmação';
  if (o === ORIGEM_MANUAL) return 'Manual';
  if (o === ORIGEM_DESPESA_CADASTRO) return 'Despesa';
  if (o === ORIGEM_COMISSAO_PAGAMENTO) return 'Comissão';
  if (o === 'comanda_pagamento') return 'Comanda';
  return o || '—';
}

function ymdFromPagamentoData(data: string | null | undefined): string | null {
  const s = String(data ?? '').trim();
  if (!s) return null;
  if (/^\d{4}-\d{2}-\d{2}/.test(s)) return s.slice(0, 10);
  const iso = /^(\d{4})-(\d{2})-(\d{2})$/.exec(s.slice(0, 10));
  if (iso) return iso[0];
  const br = /^(\d{1,2})\/(\d{1,2})\/(\d{4})$/.exec(s);
  if (br) {
    const d = br[1].padStart(2, '0');
    const mo = br[2].padStart(2, '0');
    return `${br[3]}-${mo}-${d}`;
  }
  return null;
}

function metodoRotuloComissaoApi(metodo: string): string {
  const m = String(metodo ?? '').trim().toLowerCase();
  if (m === 'dinheiro') return 'Dinheiro';
  if (m === 'pix') return 'Pix';
  if (m === 'cartao_credito' || m === 'cartão de crédito') return 'Cartão de crédito';
  if (m === 'cartao_debito' || m === 'cartão de débito') return 'Cartão de débito';
  return metodo.trim() || '—';
}

function parseObservacaoMovId(observacao: string | null | undefined): number | null {
  const m = /(?:^|;)mov:(\d+)/.exec(String(observacao ?? '').trim());
  if (!m) return null;
  const id = Number(m[1]);
  return Number.isFinite(id) && id > 0 ? id : null;
}

function parseObservacaoAtendIds(
  observacao: string | null | undefined,
): number[] {
  const m = /(?:^|;)atend:([\d,]+)/.exec(String(observacao ?? '').trim());
  if (!m?.[1]) return [];
  return [
    ...new Set(
      m[1]
        .split(',')
        .map((x) => Number(x.trim()))
        .filter((x) => Number.isFinite(x) && x > 0),
    ),
  ];
}

function observacaoComissaoPagamento(
  movId: number,
  atendimentoIds: number[],
): string {
  const ids = [...new Set(atendimentoIds)].filter((x) => x > 0);
  return ids.length > 0
    ? `mov:${movId};atend:${ids.join(',')}`
    : `mov:${movId}`;
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
      idCliente: atendimentos.idCliente,
      nomeCliente: atendimentos.nomeCliente,
    })
    .from(atendimentos)
    .where(inArray(atendimentos.idAtendimento, uniq))
    .orderBy(asc(atendimentos.id));

  const clienteIds = Array.from(
    new Set(
      linhas
        .map((r) => String(r.idCliente || '').trim())
        .filter(Boolean),
    ),
  );
  const nomeAtualPorCliente = new Map<string, string>();
  if (clienteIds.length > 0) {
    const cliRows = await db
      .select({
        id: clientes.idCliente,
        nome: clientes.nomeExibido,
      })
      .from(clientes)
      .where(inArray(clientes.idCliente, clienteIds));
    for (const r of cliRows) {
      const id = String(r.id || '').trim();
      const nome = String(r.nome || '').trim();
      if (id && nome) nomeAtualPorCliente.set(id, nome);
    }
  }

  for (const r of linhas) {
    const id = String(r.idAtendimento || '').trim();
    if (!id || map.has(id)) continue;
    const cid = String(r.idCliente || '').trim();
    const atual = cid ? nomeAtualPorCliente.get(cid) : '';
    map.set(
      id,
      String(atual || r.nomeCliente || '').trim(),
    );
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
 * Razão unificado de Transações (`GET /api/financeiro/transacoes`):
 * - `movimentacoes` (receitas/despesas: comanda faturada, manual, despesa, comissão paga)
 * - `comanda_pagamentos` com método `pendente` / `a_receber_cartao` (comanda já faturada)
 * - `pagamentos` legados (folha) sem `movimentacao` espelhada (`observacao` ≠ `mov:{id}`)
 * Comandas **sem faturar** não entram. Fiado só após Faturar com método Pendente /
 * A receber (cartão): status Em aberto (venc. ≥ hoje) ou Atrasado (venc. < hoje).
 * Comissões *a pagar* em Comissões só entram aqui após `POST /api/financeiro/comissoes/pagar`.
 */
export type FinTransacoesTipoDataApi = 'vencimento' | 'competencia' | 'pagamento';

function parseTipoDataTransacoes(v: string | undefined): FinTransacoesTipoDataApi {
  const t = String(v ?? '').trim().toLowerCase();
  if (t === 'competencia' || t === 'pagamento') return t;
  return 'vencimento';
}

export async function listTransacoesFinanceirasApi(
  db: Db,
  opts: {
    dataInicio: string;
    dataFim: string;
    tipoData?: string;
  },
): Promise<FinTransacaoItemApi[]> {
  const { di, df } = validarIntervaloDatas(opts.dataInicio, opts.dataFim);
  const tipoData = parseTipoDataTransacoes(opts.tipoData);

  const movDateFilter =
    tipoData === 'competencia'
      ? and(
          gte(sql`(${movimentacoes.createdAt})::date`, di),
          lte(sql`(${movimentacoes.createdAt})::date`, df),
        )
      : tipoData === 'pagamento'
        ? and(
            isNotNull(movimentacoes.pagoEm),
            gte(movimentacoes.pagoEm, di),
            lte(movimentacoes.pagoEm, df),
          )
        : and(gte(movimentacoes.dataMov, di), lte(movimentacoes.dataMov, df));

  const movRows = await db
    .select({
      id: movimentacoes.id,
      data_mov: movimentacoes.dataMov,
      criado_em: movimentacoes.createdAt,
      pago_em: movimentacoes.pagoEm,
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
    .where(movDateFilter)
    .orderBy(desc(movimentacoes.dataMov), desc(movimentacoes.id));

  const catReceitaPadraoId = await getCategoriaIdPorSlug(db, 'receita_servicos');
  const [catReceitaPadrao] = await db
    .select({ nome: categoriasFinanceiras.nome })
    .from(categoriasFinanceiras)
    .where(eq(categoriasFinanceiras.id, catReceitaPadraoId))
    .limit(1);
  const catReceitaPadraoNome =
    String(catReceitaPadrao?.nome ?? '').trim() || 'Serviços';

  const catComissaoId = await getCategoriaIdPorSlug(db, 'despesa_comissao');
  const [catComissao] = await db
    .select({ nome: categoriasFinanceiras.nome })
    .from(categoriasFinanceiras)
    .where(eq(categoriasFinanceiras.id, catComissaoId))
    .limit(1);
  const catComissaoNome = String(catComissao?.nome ?? '').trim() || 'Comissão';

  const movComissaoIds = new Set(
    movRows
      .filter((r) => String(r.origem ?? '').trim() === ORIGEM_COMISSAO_PAGAMENTO)
      .map((r) => r.id),
  );

  const pagFolhaRows = await db
    .select({
      id: pagamentos.id,
      data: pagamentos.data,
      valor: pagamentos.valor,
      tipo: pagamentos.tipo,
      observacao: pagamentos.observacao,
      profissionalId: pagamentos.profissionalId,
      profissionalNome: profissionais.nome,
      profissionalLegado: pagamentos.profissional,
    })
    .from(pagamentos)
    .leftJoin(profissionais, eq(profissionais.id, pagamentos.profissionalId));

  const metodosSemCaixa = ['pendente', 'a_receber_cartao'] as const;

  const pendDateFilter =
    tipoData === 'competencia'
      ? and(
          inArray(comandaPagamentos.metodo, [...metodosSemCaixa]),
          gte(sql`(${comandaPagamentos.createdAt})::date`, di),
          lte(sql`(${comandaPagamentos.createdAt})::date`, df),
        )
      : tipoData === 'pagamento'
        ? sql`false`
        : and(
            inArray(comandaPagamentos.metodo, [...metodosSemCaixa]),
            gte(comandaPagamentos.dataPagamento, di),
            lte(comandaPagamentos.dataPagamento, df),
          );

  const pendRows =
    tipoData === 'pagamento'
      ? []
      : await db
          .select({
            id: comandaPagamentos.id,
            data_pagamento: comandaPagamentos.dataPagamento,
            criado_em: comandaPagamentos.createdAt,
            valor: comandaPagamentos.valor,
            metodo: comandaPagamentos.metodo,
            metodo_rotulo: comandaPagamentos.metodoRotulo,
            id_atendimento: comandaPagamentos.idAtendimento,
          })
          .from(comandaPagamentos)
          .where(pendDateFilter)
          .orderBy(
            desc(comandaPagamentos.dataPagamento),
            desc(comandaPagamentos.id),
          );

  const idsAt = [
    ...movRows.map((r) => r.id_atendimento),
    ...pendRows.map((r) => r.id_atendimento),
  ].filter((x): x is string => x != null && String(x).trim() !== '');

  const [nomes, numeros, clientes, pagPorMov, baixaMap, taxaMap] =
    await Promise.all([
      mapaNomeClientePorAtendimento(db, idsAt),
      mapaNumeroComandaPorAtendimento(db, idsAt),
      mapaIdClientePorAtendimento(db, idsAt),
      mapaPagamentoIdPorMovimentacaoId(
        db,
        movRows.map((r) => r.id),
      ),
      mapaBaixaAutomaticaFormas(db),
      mapaTaxaFormas(db),
    ]);

  const items: FinTransacaoItemApi[] = [];

  for (const r of movRows) {
    const idAt = r.id_atendimento ? String(r.id_atendimento).trim() : '';
    const numero = idAt ? (numeros.get(idAt) ?? null) : null;
    const nomeCli = idAt ? (nomes.get(idAt) ?? null) : null;
    const idCli = idAt ? (clientes.get(idAt) ?? null) : null;
    const catNome = String(r.categoria_nome ?? '').trim() || '—';
    const taxaCfg =
      r.natureza === 'receita'
        ? taxaFormaPorMetodo(taxaMap, r.metodo_pagamento)
        : { pct: 0, fixa: 0 };
    items.push({
      tipo: 'movimentacao',
      id_ui: r.id,
      data_mov: String(r.data_mov),
      criado_em: ymdFromTimestamp(r.criado_em) ?? String(r.data_mov),
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
      origem_label: rotuloOrigemApi(r.origem, numero, catNome),
      movimentacao_id: r.id,
      comanda_pagamento_id: pagPorMov.get(r.id) ?? null,
      status: statusMovimentacaoPagamento(String(r.data_mov), r.pago_em),
      editavel: movimentacaoEditavel(r.origem),
      metodo_baixa_automatica: metodoTemBaixaAutomatica(
        baixaMap,
        r.metodo_pagamento,
      ),
      pago_em: r.pago_em ? String(r.pago_em).slice(0, 10) : null,
      taxa_percentual: taxaCfg.pct,
      taxa_fixa: taxaCfg.fixa,
    });
  }

  for (const r of pendRows) {
    const idAt = String(r.id_atendimento || '').trim();
    const numero = numeros.get(idAt) ?? null;
    const nomeCli = nomes.get(idAt) ?? null;
    const idCli = clientes.get(idAt) ?? null;
    const isCartao = String(r.metodo ?? '').trim() === 'a_receber_cartao';
    const rotuloBase = String(r.metodo_rotulo ?? '').trim();
    const forma = isCartao
      ? rotuloBase
        ? `A receber (cartão) · ${rotuloBase}`
        : 'A receber (cartão)'
      : rotuloBase || 'Pendente';
    const taxaPend = taxaFormaPorMetodo(taxaMap, forma);
    items.push({
      tipo: 'pendencia',
      id_ui: -r.id,
      data_mov: String(r.data_pagamento),
      criado_em: ymdFromTimestamp(r.criado_em) ?? String(r.data_pagamento),
      natureza: 'receita',
      valor: String(r.valor),
      categoria_id: catReceitaPadraoId,
      categoria_nome: catReceitaPadraoNome,
      descricao: null,
      id_atendimento: idAt || null,
      metodo_pagamento: forma,
      origem: isCartao ? 'comanda_a_receber_cartao' : 'comanda_pendente',
      numero_comanda: numero,
      nome_cliente: nomeCli,
      id_cliente: idCli,
      subtitulo: subtituloTransacao(numero, nomeCli ?? '', null, 'pendencia'),
      origem_label: rotuloOrigemApi(
        'comanda_pagamento',
        numero,
        catReceitaPadraoNome,
      ),
      movimentacao_id: null,
      comanda_pagamento_id: r.id,
      status: statusPendenciaComanda(String(r.data_pagamento)),
      editavel: false,
      metodo_baixa_automatica: metodoTemBaixaAutomatica(baixaMap, forma),
      pago_em: null,
      taxa_percentual: taxaPend.pct,
      taxa_fixa: taxaPend.fixa,
    });
  }

  for (const r of pagFolhaRows) {
    const movEspelho = parseObservacaoMovId(r.observacao);
    if (movEspelho != null && movComissaoIds.has(movEspelho)) continue;

    const dataYmd = ymdFromPagamentoData(r.data);
    if (!dataYmd) continue;
    if (dataYmd < di || dataYmd > df) continue;

    const valorN = toNumberPt(r.valor);
    if (valorN == null || valorN <= 0) continue;

    const nomeProf =
      String(r.profissionalNome ?? '').trim() ||
      String(r.profissionalLegado ?? '').trim() ||
      'Profissional';
    const forma = String(r.tipo ?? '').trim() || '—';
    const desc = `Pagamento de comissão para ${nomeProf}`;

    items.push({
      tipo: 'movimentacao',
      id_ui: -(PAGAMENTO_TRANSACAO_ID_OFFSET + r.id),
      data_mov: dataYmd,
      criado_em: dataYmd,
      natureza: 'despesa',
      valor: String(r.valor ?? valorN.toFixed(2)),
      categoria_id: catComissaoId,
      categoria_nome: catComissaoNome,
      descricao: desc,
      id_atendimento: null,
      metodo_pagamento: forma,
      origem: ORIGEM_COMISSAO_PAGAMENTO,
      numero_comanda: null,
      nome_cliente: null,
      id_cliente: null,
      subtitulo: desc,
      origem_label: 'Comissão',
      movimentacao_id: null,
      comanda_pagamento_id: null,
      status: 'pago',
      editavel: false,
      metodo_baixa_automatica: metodoTemBaixaAutomatica(baixaMap, forma),
      pago_em: dataYmd,
      taxa_percentual: 0,
      taxa_fixa: 0,
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

  const baixaMap = await mapaBaixaAutomaticaFormas(db);
  const autoBaixa = metodoTemBaixaAutomatica(baixaMap, body.metodo_pagamento);

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
      pagoEm: autoBaixa ? d : null,
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
    data_mov?: string;
    pago_em?: string | null;
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
    dataMov?: string;
    pagoEm?: string | null;
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

  if (patch.data_mov !== undefined) {
    const d = String(patch.data_mov ?? '').trim().slice(0, 10);
    if (!/^\d{4}-\d{2}-\d{2}$/.test(d)) {
      throw new Error('data_mov inválida; use YYYY-MM-DD');
    }
    updates.dataMov = d;
  }

  if (patch.pago_em !== undefined) {
    if (patch.pago_em === null) {
      updates.pagoEm = null;
    } else {
      const d = String(patch.pago_em ?? '').trim().slice(0, 10);
      if (!/^\d{4}-\d{2}-\d{2}$/.test(d)) {
        throw new Error('pago_em inválida; use YYYY-MM-DD');
      }
      updates.pagoEm = d;
    }
  }

  if (Object.keys(updates).length === 0) {
    return;
  }

  await db.update(movimentacoes).set(updates).where(eq(movimentacoes.id, id));
}

export async function marcarMovimentacaoComoPagaApi(
  db: Db,
  id: number,
  dataPagamentoYmd: string,
): Promise<void> {
  if (!Number.isFinite(id) || id <= 0) {
    throw new Error('id inválido');
  }
  const data = String(dataPagamentoYmd ?? '').trim().slice(0, 10);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(data)) {
    throw new Error('data_pagamento inválida; use YYYY-MM-DD');
  }
  const updated = await db
    .update(movimentacoes)
    .set({ pagoEm: data })
    .where(eq(movimentacoes.id, id))
    .returning({ id: movimentacoes.id });
  if (!updated.length) {
    throw new Error('Movimentação não encontrada');
  }
}

export async function estornarMovimentacaoPagamentoApi(
  db: Db,
  id: number,
): Promise<void> {
  if (!Number.isFinite(id) || id <= 0) {
    throw new Error('id inválido');
  }
  const [row] = await db
    .select({
      id: movimentacoes.id,
      origem: movimentacoes.origem,
    })
    .from(movimentacoes)
    .where(eq(movimentacoes.id, id))
    .limit(1);
  if (!row) {
    throw new Error('Movimentação não encontrada');
  }
  const origem = String(row.origem ?? '').trim();
  if (origem === ORIGEM_COMISSAO_PAGAMENTO) {
    throw new Error('Use o fluxo de estorno específico desta origem.');
  }
  await db
    .update(movimentacoes)
    .set({ pagoEm: null })
    .where(eq(movimentacoes.id, id));
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
        pagoEm: d,
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

/** Tabela principal da listagem detalhada de comissões (1 linha = 1 serviço finalizado). */
export const COMISSOES_DETALHE_FONTE_TABELA = 'atendimentos' as const;

/** Linha da listagem detalhada de comissões (`GET /api/financeiro/comissoes/detalhadas`). */
export interface FinComissaoDetalheItemApi {
  id: number;
  data_ymd: string;
  id_atendimento: string;
  id_cliente: string;
  cliente_nome: string;
  numero_comanda: number | null;
  servico: string;
  quantidade: number;
  valor: number;
  comissao: number;
  comissao_pct: number | null;
  comissao_tipo: string;
  disponivel: number;
}

export type ListComissoesDetalhadasOpts = {
  dataInicio: string;
  dataFim: string;
  profissionalId: number;
  /** Quando false (padrão), só atendimentos com pagamento confirmado na comanda. */
  mostrarAnteriores?: boolean;
};

function ymdFromDateCol(v: string | Date | null | undefined): string | null {
  if (v == null) return null;
  if (v instanceof Date) {
    const y = v.getUTCFullYear();
    const m = String(v.getUTCMonth() + 1).padStart(2, '0');
    const d = String(v.getUTCDate()).padStart(2, '0');
    return `${y}-${m}-${d}`;
  }
  const s = String(v).trim().slice(0, 10);
  return /^\d{4}-\d{2}-\d{2}$/.test(s) ? s : null;
}

function rotuloServicoComissao(row: {
  servicos: string | null;
  produto: string | null;
  tipo: string | null;
  pacote: string | null;
  etapa: string | null;
  descricao: string | null;
  descricaoManual: string | null;
}): string {
  const srv = String(row.servicos ?? '').trim();
  if (srv) return srv;
  const d = descricaoParaListaLinha(row);
  if (d) return d;
  const prod = String(row.produto ?? '').trim();
  return prod || '—';
}

/**
 * Comissões detalhadas — fonte de dados:
 * - **Principal:** `atendimentos` (`comissao`, `valor`, `profissional_id`, `data`, `servicos`, …)
 * - **Comanda #:** `atendimentos_pedido.numero_comanda` (join por `id_atendimento`)
 * - **Disponível (padrão):** comanda com resumo `status === 'pago'` via `comanda_pagamentos`
 *   (mesma regra que `sincronizarPagamentoStatusAtendimento`), não `movimentacoes`.
 * - **Folha:** `recalcularTotaisComissaoFolhaPorPeriodo` usa a mesma tabela `atendimentos.comissao`.
 */
export async function listComissoesDetalhadasApi(
  db: Db,
  opts: ListComissoesDetalhadasOpts,
): Promise<FinComissaoDetalheItemApi[]> {
  const di = String(opts.dataInicio ?? '').trim();
  const df = String(opts.dataFim ?? '').trim();
  const profId = Number(opts.profissionalId);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(di) || !/^\d{4}-\d{2}-\d{2}$/.test(df)) {
    throw new Error('data_inicio e data_fim são obrigatórias (YYYY-MM-DD)');
  }
  if (di > df) {
    throw new Error('data_inicio não pode ser posterior a data_fim');
  }
  if (!Number.isFinite(profId) || profId <= 0) {
    throw new Error('profissional_id é obrigatório');
  }

  const conds = [
    eq(atendimentos.profissionalId, profId),
    gte(atendimentos.data, di),
    lte(atendimentos.data, df),
    sql`lower(coalesce(${atendimentos.cobrancaStatus}, '')) = 'finalizada'`,
    isNull(atendimentos.comissaoPagaEm),
  ];

  const rows = await db
    .select()
    .from(atendimentos)
    .where(and(...conds))
    .orderBy(asc(atendimentos.data), asc(atendimentos.id));

  const idsAt = Array.from(
    new Set(
      rows
        .map((r) => String(r.idAtendimento ?? '').trim())
        .filter((x) => x.length > 0),
    ),
  );

  const { getProfissionalComissaoPolitica } = await import(
    './profissional-comissao-domain.js'
  );
  const politica = await getProfissionalComissaoPolitica(db, profId);
  const exigePagamentoCliente =
    politica?.comissao_listagem_modo !== 'competencia';

  let resumosPorIdAt: Map<string, { status: string }> | null = null;
  if (exigePagamentoCliente && !opts.mostrarAnteriores && idsAt.length > 0) {
    const { getResumosPorAtendimento } = await import(
      './comanda-pagamentos-domain.js'
    );
    const resumos = await getResumosPorAtendimento(db, idsAt);
    resumosPorIdAt = new Map(
      [...resumos.entries()].map(([id, r]) => [id, { status: r.status }]),
    );
  }

  const numeroPorIdAt = new Map<string, number>();
  if (idsAt.length > 0) {
    const ped = await db
      .select({
        id: atendimentosPedido.idAtendimento,
        n: atendimentosPedido.numeroComanda,
      })
      .from(atendimentosPedido)
      .where(inArray(atendimentosPedido.idAtendimento, idsAt));
    for (const p of ped) {
      const k = String(p.id ?? '').trim();
      const nv = p.n != null ? Number(p.n) : NaN;
      if (k && Number.isFinite(nv) && nv > 0) numeroPorIdAt.set(k, nv);
    }
  }

  const out: FinComissaoDetalheItemApi[] = [];
  for (const a of rows) {
    const idAt = String(a.idAtendimento ?? '').trim();
    if (resumosPorIdAt != null) {
      const st = resumosPorIdAt.get(idAt)?.status;
      if (st !== 'pago') continue;
    }

    const comissao = toNumberPt(a.comissao);
    if (comissao == null || comissao <= 0) continue;

    const dataYmd = ymdFromDateCol(a.data as string | Date | null);
    if (!dataYmd) continue;

    const valor = toNumberPt(a.valor) ?? 0;
    const qtd = Math.max(1, Number(a.quantidade ?? 1) || 1);
    let comissaoPct: number | null = null;
    if (valor > 0) {
      comissaoPct = Math.round((comissao / valor) * 10000) / 100;
    }

    out.push({
      id: a.id,
      data_ymd: dataYmd,
      id_atendimento: idAt,
      id_cliente: String(a.idCliente ?? '').trim(),
      cliente_nome: String(a.nomeCliente ?? '').trim() || '—',
      numero_comanda: idAt ? (numeroPorIdAt.get(idAt) ?? null) : null,
      servico: rotuloServicoComissao(a),
      quantidade: qtd,
      valor: Math.round(valor * 100) / 100,
      comissao: Math.round(comissao * 100) / 100,
      comissao_pct: comissaoPct,
      comissao_tipo: 'Normal',
      disponivel: Math.round(comissao * 100) / 100,
    });
  }

  return out;
}

/** Linha agregada de um lote de pagamento de comissões (`GET /api/financeiro/comissoes/pagas`). */
export interface FinComissaoPagaItemApi {
  movimentacao_id: number;
  data_ymd: string;
  pagamento_ymd: string;
  profissional_id: number;
  profissional_nome: string;
  usuario_nome: string;
  comissoes: number;
  vales: number;
  bonificacoes: number;
  valor_pago: number;
}

export type ListComissoesPagasOpts = {
  dataInicio: string;
  dataFim: string;
  /** Omitir ou ≤0 para listar todos os profissionais no período. */
  profissionalId?: number | null;
};

function atendTokenFromObservacao(
  observacao: string | null | undefined,
): string | null {
  const m = /(?:^|;)atend:([\d,]+)/.exec(String(observacao ?? '').trim());
  const token = m?.[1]?.trim();
  return token && token.length > 0 ? token : null;
}

/**
 * Histórico de pagamentos de comissões — agrupa `pagamentos` com observação
 * `mov:…;atend:…` (mesmo lote que `POST /api/financeiro/comissoes/pagar`).
 */
export async function listComissoesPagasApi(
  db: Db,
  opts: ListComissoesPagasOpts,
): Promise<FinComissaoPagaItemApi[]> {
  const di = String(opts.dataInicio ?? '').trim();
  const df = String(opts.dataFim ?? '').trim();
  if (!/^\d{4}-\d{2}-\d{2}$/.test(di) || !/^\d{4}-\d{2}-\d{2}$/.test(df)) {
    throw new Error('data_inicio e data_fim são obrigatórias (YYYY-MM-DD)');
  }
  if (di > df) {
    throw new Error('data_inicio não pode ser posterior a data_fim');
  }

  const profFiltro = Number(opts.profissionalId);
  const filtrarProf = Number.isFinite(profFiltro) && profFiltro > 0;

  const conds = [
    sql`${pagamentos.observacao} LIKE ${'%mov:%'}`,
    sql`${pagamentos.observacao} LIKE ${'%atend:%'}`,
    gte(pagamentos.data, di),
    lte(pagamentos.data, df),
  ];
  if (filtrarProf) {
    conds.push(eq(pagamentos.profissionalId, profFiltro));
  }

  const pagRows = await db
    .select({
      id: pagamentos.id,
      data: pagamentos.data,
      profissionalId: pagamentos.profissionalId,
      profissional: pagamentos.profissional,
      valor: pagamentos.valor,
      observacao: pagamentos.observacao,
    })
    .from(pagamentos)
    .where(and(...conds))
    .orderBy(desc(pagamentos.data), desc(pagamentos.id));

  type Grupo = {
    pagamentoYmd: string;
    profissionalId: number;
    profissionalNome: string;
    usuarioNome: string;
    atendIds: number[];
    movimentacaoId: number;
    valorPago: number;
  };

  const grupos = new Map<string, Grupo>();

  for (const p of pagRows) {
    const token = atendTokenFromObservacao(p.observacao);
    if (!token) continue;
    const movId = parseObservacaoMovId(p.observacao);
    if (movId == null) continue;

    const pagYmd = String(p.data ?? '').trim().slice(0, 10);
    if (!/^\d{4}-\d{2}-\d{2}$/.test(pagYmd)) continue;

    const profId = Number(p.profissionalId);
    if (!Number.isFinite(profId) || profId <= 0) continue;

    const key = `${profId}|${pagYmd}|${token}`;
    const valorLinha = toNumberPt(p.valor) ?? 0;
    const nomeProf = String(p.profissional ?? '').trim() || '—';

    const existente = grupos.get(key);
    if (existente) {
      existente.valorPago =
        Math.round((existente.valorPago + valorLinha) * 100) / 100;
      if (movId < existente.movimentacaoId) {
        existente.movimentacaoId = movId;
      }
      continue;
    }

    const atendIds = [
      ...new Set(
        token
          .split(',')
          .map((x) => Number(x.trim()))
          .filter((x) => Number.isFinite(x) && x > 0),
      ),
    ];

    grupos.set(key, {
      pagamentoYmd: pagYmd,
      profissionalId: profId,
      profissionalNome: nomeProf,
      usuarioNome: nomeProf,
      atendIds,
      movimentacaoId: movId,
      valorPago: Math.round(valorLinha * 100) / 100,
    });
  }

  if (grupos.size === 0) return [];

  const todosAtendIds = [
    ...new Set([...grupos.values()].flatMap((g) => g.atendIds)),
  ];

  const atendRows =
    todosAtendIds.length > 0
      ? await db
          .select({
            id: atendimentos.id,
            data: atendimentos.data,
            comissao: atendimentos.comissao,
            comissaoPagaEm: atendimentos.comissaoPagaEm,
          })
          .from(atendimentos)
          .where(inArray(atendimentos.id, todosAtendIds))
      : [];

  const atendPorId = new Map(atendRows.map((a) => [a.id, a]));

  const out: FinComissaoPagaItemApi[] = [];

  for (const g of grupos.values()) {
    let comissoes = 0;
    let dataMin: string | null = null;

    for (const aid of g.atendIds) {
      const a = atendPorId.get(aid);
      if (!a) continue;
      const c = toNumberPt(a.comissao);
      if (c != null && c > 0) comissoes += c;
      const dYmd = ymdFromDateCol(a.data as string | Date | null);
      if (dYmd && (dataMin == null || dYmd < dataMin)) dataMin = dYmd;
    }

    comissoes = Math.round(comissoes * 100) / 100;
    const dataYmd = dataMin ?? g.pagamentoYmd;

    out.push({
      movimentacao_id: g.movimentacaoId,
      data_ymd: dataYmd,
      pagamento_ymd: g.pagamentoYmd,
      profissional_id: g.profissionalId,
      profissional_nome: g.profissionalNome,
      usuario_nome: g.usuarioNome,
      comissoes,
      vales: 0,
      bonificacoes: 0,
      valor_pago: g.valorPago,
    });
  }

  out.sort((a, b) => {
    if (a.pagamento_ymd !== b.pagamento_ymd) {
      return a.pagamento_ymd < b.pagamento_ymd ? 1 : -1;
    }
    return b.movimentacao_id - a.movimentacao_id;
  });

  return out;
}

export interface PagarComissoesPagamentoLinha {
  metodo: string;
  valor: number;
}

export interface PagarComissoesBody {
  profissional_id: number;
  data_pagamento: string;
  atendimento_ids: number[];
  pagamentos: PagarComissoesPagamentoLinha[];
}

/** Marca linhas como pagas e gera despesas em `movimentacoes` (origem `comissao_pagamento`). */
export async function pagarComissoesApi(
  db: Db,
  body: PagarComissoesBody,
): Promise<{ movimentacao_ids: number[]; total_comissao: number }> {
  const profId = Number(body.profissional_id);
  const dataPag = String(body.data_pagamento ?? '').trim().slice(0, 10);
  if (!Number.isFinite(profId) || profId <= 0) {
    throw new Error('profissional_id é obrigatório');
  }
  if (!/^\d{4}-\d{2}-\d{2}$/.test(dataPag)) {
    throw new Error('data_pagamento inválida; use YYYY-MM-DD');
  }

  const ids = [
    ...new Set(
      (body.atendimento_ids ?? [])
        .map((x) => Number(x))
        .filter((x) => Number.isFinite(x) && x > 0),
    ),
  ];
  if (ids.length === 0) {
    throw new Error('Selecione pelo menos uma linha de comissão');
  }

  const pagamentosLinhas = (body.pagamentos ?? [])
    .map((p) => ({
      metodo: String(p.metodo ?? '').trim(),
      valor: Math.round(Number(p.valor) * 100) / 100,
    }))
    .filter((p) => p.metodo && p.valor > 0);
  if (pagamentosLinhas.length === 0) {
    throw new Error('Informe pelo menos uma forma de pagamento');
  }

  const rows = await db
    .select({
      id: atendimentos.id,
      data: atendimentos.data,
      comissao: atendimentos.comissao,
      profissionalId: atendimentos.profissionalId,
      comissaoPagaEm: atendimentos.comissaoPagaEm,
      cobrancaStatus: atendimentos.cobrancaStatus,
    })
    .from(atendimentos)
    .where(inArray(atendimentos.id, ids));

  if (rows.length !== ids.length) {
    throw new Error('Uma ou mais linhas de comissão não foram encontradas');
  }

  let totalComissao = 0;
  for (const r of rows) {
    if (Number(r.profissionalId) !== profId) {
      throw new Error('Todas as linhas devem ser da mesma profissional');
    }
    if (r.comissaoPagaEm != null) {
      throw new Error('Uma ou mais comissões já foram pagas');
    }
    if (String(r.cobrancaStatus ?? '').trim().toLowerCase() !== 'finalizada') {
      throw new Error('Só é possível pagar comissões de atendimentos finalizados');
    }
    const c = toNumberPt(r.comissao);
    if (c == null || c <= 0) {
      throw new Error('Linha sem valor de comissão válido');
    }
    totalComissao += c;
  }
  totalComissao = Math.round(totalComissao * 100) / 100;

  const totalPag = Math.round(
    pagamentosLinhas.reduce((s, p) => s + p.valor, 0) * 100,
  ) / 100;
  if (Math.abs(totalPag - totalComissao) > 0.02) {
    throw new Error(
      'O total dos pagamentos deve coincidir com o total das comissões selecionadas',
    );
  }

  const [prof] = await db
    .select({ nome: profissionais.nome })
    .from(profissionais)
    .where(eq(profissionais.id, profId))
    .limit(1);
  const nomeProf = String(prof?.nome ?? '').trim() || 'Profissional';
  const catComissaoId = await getCategoriaIdPorSlug(db, 'despesa_comissao');
  const descBase = `Pagamento de comissão para ${nomeProf}`;

  const { folhaIdPrincipalParaLoteAtendimentos, recalcularFolhaAposIdsAtendimento } =
    await import('./folha-domain.js');
  const { folhaId, periodoYm } = await folhaIdPrincipalParaLoteAtendimentos(
    db,
    profId,
    ids,
  );
  const mesRefLegivel = periodoYm
    ? `${periodoYm.slice(5, 7)}/${periodoYm.slice(0, 4)}`
    : null;

  const result = await db.transaction(async (tx) => {
    await tx
      .update(atendimentos)
      .set({ comissaoPagaEm: dataPag })
      .where(
        and(
          inArray(atendimentos.id, ids),
          eq(atendimentos.profissionalId, profId),
          isNull(atendimentos.comissaoPagaEm),
        ),
      );

    const movimentacaoIds: number[] = [];
    for (const p of pagamentosLinhas) {
      const [mov] = await tx
        .insert(movimentacoes)
        .values({
          dataMov: dataPag,
          natureza: 'despesa',
          valor: p.valor.toFixed(2),
          categoriaId: catComissaoId,
          descricao: descBase,
          idAtendimento: null,
          metodoPagamento: metodoRotuloComissaoApi(p.metodo),
          pagoEm: dataPag,
          origem: ORIGEM_COMISSAO_PAGAMENTO,
        })
        .returning({ id: movimentacoes.id });
      if (!mov?.id) throw new Error('Falha ao registar movimentação de comissão');
      movimentacaoIds.push(mov.id);

      await tx.insert(pagamentos).values({
        data: dataPag,
        profissionalId: profId,
        profissional: nomeProf,
        folhaId: folhaId ?? undefined,
        tipo: metodoRotuloComissaoApi(p.metodo),
        valor: p.valor.toFixed(2),
        mesRef: mesRefLegivel,
        observacao: observacaoComissaoPagamento(mov.id, ids),
      });
    }

    return { movimentacao_ids: movimentacaoIds, total_comissao: totalComissao };
  });

  await recalcularFolhaAposIdsAtendimento(db, ids);
  return result;
}

/** Estorna o lote de pagamento de comissão ligado à movimentação (todas as parcelas do mesmo pagamento). */
export async function estornarComissaoMovimentacaoApi(
  db: Db,
  movimentacaoId: number,
): Promise<{ periodos_ym: string[] }> {
  const movId = Number(movimentacaoId);
  if (!Number.isFinite(movId) || movId <= 0) {
    throw new Error('movimentacao_id inválido');
  }

  const [mov] = await db
    .select({
      id: movimentacoes.id,
      origem: movimentacoes.origem,
      dataMov: movimentacoes.dataMov,
    })
    .from(movimentacoes)
    .where(eq(movimentacoes.id, movId))
    .limit(1);

  if (!mov) {
    throw new Error('Movimentação não encontrada');
  }
  if (String(mov.origem ?? '').trim() !== ORIGEM_COMISSAO_PAGAMENTO) {
    throw new Error('Esta transação não é um pagamento de comissão');
  }

  const dataPag = String(mov.dataMov ?? '').trim().slice(0, 10);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(dataPag)) {
    throw new Error('Data da movimentação inválida');
  }

  const pagAlvo = await db
    .select({
      id: pagamentos.id,
      observacao: pagamentos.observacao,
    })
    .from(pagamentos)
    .where(sql`${pagamentos.observacao} LIKE ${`%mov:${movId}%`}`);

  let atendIds: number[] = [];
  for (const p of pagAlvo) {
    atendIds.push(...parseObservacaoAtendIds(p.observacao));
  }
  atendIds = [...new Set(atendIds)].sort((a, b) => a - b);

  const atendToken =
    atendIds.length > 0 ? `atend:${atendIds.join(',')}` : null;

  const pagLote =
    atendToken != null
      ? await db
          .select({
            id: pagamentos.id,
            observacao: pagamentos.observacao,
          })
          .from(pagamentos)
          .where(sql`${pagamentos.observacao} LIKE ${`%${atendToken}%`}`)
      : pagAlvo;

  const movIdsLote = new Set<number>([movId]);
  for (const p of pagLote) {
    const mid = parseObservacaoMovId(p.observacao);
    if (mid != null) movIdsLote.add(mid);
  }

  await db.transaction(async (tx) => {
    const pagIds = pagLote.map((p) => p.id);
    if (pagIds.length > 0) {
      await tx.delete(pagamentos).where(inArray(pagamentos.id, pagIds));
    }
    if (movIdsLote.size > 0) {
      await tx
        .update(movimentacoes)
        .set({ pagoEm: null })
        .where(inArray(movimentacoes.id, [...movIdsLote]));
    }
    if (atendIds.length > 0) {
      await tx
        .update(atendimentos)
        .set({ comissaoPagaEm: null })
        .where(inArray(atendimentos.id, atendIds));
    }
  });

  const { recalcularFolhaAposIdsAtendimento, dataAtendimentoParaPeriodoYm } =
    await import('./folha-domain.js');
  await recalcularFolhaAposIdsAtendimento(db, atendIds);

  const periodos = new Set<string>();
  if (atendIds.length > 0) {
    const rows = await db
      .select({ data: atendimentos.data })
      .from(atendimentos)
      .where(inArray(atendimentos.id, atendIds));
    for (const r of rows) {
      const ym = dataAtendimentoParaPeriodoYm(
        r.data as string | Date | null | undefined,
      );
      if (ym) periodos.add(ym);
    }
  }
  if (periodos.size === 0) periodos.add(dataPag.slice(0, 7));

  return { periodos_ym: [...periodos] };
}

/** Remove o lote de pagamento de comissão ligado à movimentação (exclusão definitiva). */
export async function excluirComissaoMovimentacaoApi(
  db: Db,
  movimentacaoId: number,
): Promise<{ periodos_ym: string[] }> {
  const movId = Number(movimentacaoId);
  if (!Number.isFinite(movId) || movId <= 0) {
    throw new Error('movimentacao_id inválido');
  }

  const [mov] = await db
    .select({
      id: movimentacoes.id,
      origem: movimentacoes.origem,
      dataMov: movimentacoes.dataMov,
    })
    .from(movimentacoes)
    .where(eq(movimentacoes.id, movId))
    .limit(1);

  if (!mov) {
    throw new Error('Movimentação não encontrada');
  }
  if (String(mov.origem ?? '').trim() !== ORIGEM_COMISSAO_PAGAMENTO) {
    throw new Error('Esta transação não é um pagamento de comissão');
  }

  const dataPag = String(mov.dataMov ?? '').trim().slice(0, 10);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(dataPag)) {
    throw new Error('Data da movimentação inválida');
  }

  const pagAlvo = await db
    .select({
      id: pagamentos.id,
      observacao: pagamentos.observacao,
    })
    .from(pagamentos)
    .where(sql`${pagamentos.observacao} LIKE ${`%mov:${movId}%`}`);

  let atendIds: number[] = [];
  for (const p of pagAlvo) {
    atendIds.push(...parseObservacaoAtendIds(p.observacao));
  }
  atendIds = [...new Set(atendIds)].sort((a, b) => a - b);

  const atendToken =
    atendIds.length > 0 ? `atend:${atendIds.join(',')}` : null;

  const pagLote =
    atendToken != null
      ? await db
          .select({
            id: pagamentos.id,
            observacao: pagamentos.observacao,
          })
          .from(pagamentos)
          .where(sql`${pagamentos.observacao} LIKE ${`%${atendToken}%`}`)
      : pagAlvo;

  const movIdsLote = new Set<number>([movId]);
  for (const p of pagLote) {
    const mid = parseObservacaoMovId(p.observacao);
    if (mid != null) movIdsLote.add(mid);
  }

  await db.transaction(async (tx) => {
    const pagIds = pagLote.map((p) => p.id);
    if (pagIds.length > 0) {
      await tx.delete(pagamentos).where(inArray(pagamentos.id, pagIds));
    }
    if (movIdsLote.size > 0) {
      await tx
        .delete(movimentacoes)
        .where(inArray(movimentacoes.id, [...movIdsLote]));
    }
    if (atendIds.length > 0) {
      await tx
        .update(atendimentos)
        .set({ comissaoPagaEm: null })
        .where(inArray(atendimentos.id, atendIds));
    }
  });

  const { recalcularFolhaAposIdsAtendimento, dataAtendimentoParaPeriodoYm } =
    await import('./folha-domain.js');
  await recalcularFolhaAposIdsAtendimento(db, atendIds);

  const periodos = new Set<string>();
  if (atendIds.length > 0) {
    const rows = await db
      .select({ data: atendimentos.data })
      .from(atendimentos)
      .where(inArray(atendimentos.id, atendIds));
    for (const r of rows) {
      const ym = dataAtendimentoParaPeriodoYm(
        r.data as string | Date | null | undefined,
      );
      if (ym) periodos.add(ym);
    }
  }
  if (periodos.size === 0) periodos.add(dataPag.slice(0, 7));

  return { periodos_ym: [...periodos] };
}
