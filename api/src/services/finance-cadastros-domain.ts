import { and, asc, eq, ilike, sql } from 'drizzle-orm';
import type { Db } from '../db';
import {
  categoriasFinanceiras,
  formasPagamentoFinanceiras,
  movimentacoes,
} from '../db/schema';

/** Slugs referenciados em código — não podem ser excluídos. */
export const SLUGS_CATEGORIA_SISTEMA = new Set([
  'receita_servicos',
  'receita_produtos',
  'receita_pacotes',
  'receita_mega',
  'receita_cabelo',
  'despesa_aluguel',
  'despesa_produtos',
  'despesa_salario',
  'despesa_marketing',
  'despesa_outras',
  'despesa_comissao',
]);

/** Códigos internos ligados ao enum de comanda — não podem ser excluídos. */
export const CODIGOS_FORMA_SISTEMA = new Set([
  'dinheiro',
  'cartao_credito',
  'cartao_debito',
  'pix',
  'transferencia',
  'outros',
  'pendente',
]);

function slugifyNome(nome: string): string {
  return nome
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '')
    .slice(0, 80);
}

function codigoInternoFromNome(nome: string): string {
  const base = slugifyNome(nome) || 'forma';
  return base.slice(0, 60);
}

async function slugUnico(
  db: Db,
  base: string,
  natureza: 'receita' | 'despesa',
  excludeId?: number,
): Promise<string> {
  const prefix = natureza === 'receita' ? 'receita_' : 'despesa_';
  let slug = `${prefix}${slugifyNome(base) || 'categoria'}`;
  let n = 0;
  for (;;) {
    const candidate = n === 0 ? slug : `${slug}_${n}`;
    const [row] = await db
      .select({ id: categoriasFinanceiras.id })
      .from(categoriasFinanceiras)
      .where(eq(categoriasFinanceiras.slug, candidate))
      .limit(1);
    if (!row || (excludeId != null && row.id === excludeId)) return candidate;
    n++;
  }
}

async function codigoInternoUnico(
  db: Db,
  base: string,
  excludeId?: number,
): Promise<string> {
  let codigo = codigoInternoFromNome(base);
  let n = 0;
  for (;;) {
    const candidate = n === 0 ? codigo : `${codigo}_${n}`;
    const [row] = await db
      .select({ id: formasPagamentoFinanceiras.id })
      .from(formasPagamentoFinanceiras)
      .where(eq(formasPagamentoFinanceiras.codigoInterno, candidate))
      .limit(1);
    if (!row || (excludeId != null && row.id === excludeId)) return candidate;
    n++;
  }
}

async function nomeCategoriaDuplicado(
  db: Db,
  nome: string,
  excludeId?: number,
): Promise<boolean> {
  const t = nome.trim();
  const [row] = await db
    .select({ id: categoriasFinanceiras.id })
    .from(categoriasFinanceiras)
    .where(ilike(categoriasFinanceiras.nome, t))
    .limit(1);
  if (!row) return false;
  return excludeId == null || row.id !== excludeId;
}

async function nomeFormaDuplicado(
  db: Db,
  nome: string,
  excludeId?: number,
): Promise<boolean> {
  const t = nome.trim();
  const [row] = await db
    .select({ id: formasPagamentoFinanceiras.id })
    .from(formasPagamentoFinanceiras)
    .where(ilike(formasPagamentoFinanceiras.nome, t))
    .limit(1);
  if (!row) return false;
  return excludeId == null || row.id !== excludeId;
}

export type CategoriaFinanceiraCadastroApi = {
  id: number;
  nome: string;
  natureza: 'receita' | 'despesa';
  slug: string;
  ordem: number;
  ativo: boolean;
  sistema: boolean;
};

export type FormaPagamentoFinanceiraCadastroApi = {
  id: number;
  nome: string;
  codigo_interno: string;
  baixa_automatica: boolean;
  taxa_percentual: number;
  taxa_fixa: number;
  prazo_recebimento: number;
  ordem: number;
  ativo: boolean;
  sistema: boolean;
};

export type FormaTaxaConfig = {
  pct: number;
  fixa: number;
};

function taxaNum(v: unknown): number {
  const n = parseFloat(String(v ?? '0'));
  return Number.isFinite(n) ? Math.round(n * 1000) / 1000 : 0;
}

function taxaFixaNum(v: unknown): number {
  const n = parseFloat(String(v ?? '0'));
  return Number.isFinite(n) ? Math.round(n * 100) / 100 : 0;
}

function parseTaxaPercentualInput(v: unknown): number {
  const n = parseFloat(String(v ?? '').replace(',', '.'));
  if (!Number.isFinite(n) || n < 0) {
    throw new Error('Taxa percentual inválida.');
  }
  if (n > 100) throw new Error('Taxa percentual não pode ser maior que 100.');
  return Math.round(n * 1000) / 1000;
}

function parseTaxaFixaInput(v: unknown): number {
  const n = parseFloat(String(v ?? '').replace(',', '.'));
  if (!Number.isFinite(n) || n < 0) {
    throw new Error('Taxa fixa inválida.');
  }
  return Math.round(n * 100) / 100;
}

function parsePrazoRecebimentoInput(v: unknown): number {
  const n = parseInt(String(v ?? '').trim(), 10);
  if (!Number.isFinite(n) || n < 0) {
    throw new Error('Prazo de recebimento inválido.');
  }
  if (n > 9999) throw new Error('Prazo de recebimento não pode ser maior que 9999 dias.');
  return n;
}

function prazoNum(v: unknown): number {
  const n = parseInt(String(v ?? '0'), 10);
  return Number.isFinite(n) && n >= 0 ? n : 0;
}

function mapCategoriaRow(r: {
  id: number;
  nome: string;
  natureza: 'receita' | 'despesa';
  slug: string;
  ordem: number;
  ativo: boolean;
}): CategoriaFinanceiraCadastroApi {
  return {
    id: r.id,
    nome: r.nome,
    natureza: r.natureza,
    slug: r.slug,
    ordem: r.ordem,
    ativo: r.ativo,
    sistema: SLUGS_CATEGORIA_SISTEMA.has(r.slug),
  };
}

function mapFormaRow(r: {
  id: number;
  nome: string;
  codigoInterno: string;
  baixaAutomatica: boolean;
  taxaPercentual: unknown;
  taxaFixa: unknown;
  prazoRecebimento: unknown;
  ordem: number;
  ativo: boolean;
}): FormaPagamentoFinanceiraCadastroApi {
  return {
    id: r.id,
    nome: r.nome,
    codigo_interno: r.codigoInterno,
    baixa_automatica: r.baixaAutomatica,
    taxa_percentual: taxaNum(r.taxaPercentual),
    taxa_fixa: taxaFixaNum(r.taxaFixa),
    prazo_recebimento: prazoNum(r.prazoRecebimento),
    ordem: r.ordem,
    ativo: r.ativo,
    sistema: CODIGOS_FORMA_SISTEMA.has(r.codigoInterno),
  };
}

export async function listCategoriasCadastroApi(
  db: Db,
  opts?: { incluirInativas?: boolean },
): Promise<CategoriaFinanceiraCadastroApi[]> {
  const conds = opts?.incluirInativas
    ? undefined
    : eq(categoriasFinanceiras.ativo, true);
  const rows = conds
    ? await db
        .select()
        .from(categoriasFinanceiras)
        .where(conds)
        .orderBy(asc(categoriasFinanceiras.ordem), asc(categoriasFinanceiras.id))
    : await db
        .select()
        .from(categoriasFinanceiras)
        .orderBy(asc(categoriasFinanceiras.ordem), asc(categoriasFinanceiras.id));
  return rows.map(mapCategoriaRow);
}

export async function criarCategoriaCadastroApi(
  db: Db,
  body: { nome: string; natureza: 'receita' | 'despesa' },
): Promise<number> {
  const nome = String(body.nome ?? '').trim();
  if (!nome) throw new Error('Informe o nome da categoria.');
  if (await nomeCategoriaDuplicado(db, nome)) {
    throw new Error('Já existe uma categoria com este nome.');
  }
  const slug = await slugUnico(db, nome, body.natureza);
  const [maxOrd] = await db
    .select({ m: sql<number>`coalesce(max(${categoriasFinanceiras.ordem}), 0)` })
    .from(categoriasFinanceiras);
  const ordem = Number(maxOrd?.m ?? 0) + 10;
  const [ins] = await db
    .insert(categoriasFinanceiras)
    .values({ nome, natureza: body.natureza, slug, ordem, ativo: true })
    .returning({ id: categoriasFinanceiras.id });
  return ins!.id;
}

export async function atualizarCategoriaCadastroApi(
  db: Db,
  id: number,
  body: { nome?: string; natureza?: 'receita' | 'despesa' },
): Promise<void> {
  const [row] = await db
    .select()
    .from(categoriasFinanceiras)
    .where(eq(categoriasFinanceiras.id, id))
    .limit(1);
  if (!row) throw new Error('Categoria não encontrada.');

  const sistema = SLUGS_CATEGORIA_SISTEMA.has(row.slug);
  const patch: Partial<{
    nome: string;
    natureza: 'receita' | 'despesa';
    slug: string;
  }> = {};

  if (body.nome !== undefined) {
    const nome = String(body.nome).trim();
    if (!nome) throw new Error('Informe o nome da categoria.');
    if (await nomeCategoriaDuplicado(db, nome, id)) {
      throw new Error('Já existe uma categoria com este nome.');
    }
    patch.nome = nome;
    if (!sistema) {
      const nat = body.natureza ?? row.natureza;
      patch.slug = await slugUnico(db, nome, nat, id);
    }
  }

  if (body.natureza !== undefined && !sistema) {
    patch.natureza = body.natureza;
    const nome = patch.nome ?? row.nome;
    patch.slug = await slugUnico(db, nome, body.natureza, id);
  } else if (body.natureza !== undefined && sistema && body.natureza !== row.natureza) {
    throw new Error('A natureza desta categoria de sistema não pode ser alterada.');
  }

  if (Object.keys(patch).length === 0) return;
  await db
    .update(categoriasFinanceiras)
    .set(patch)
    .where(eq(categoriasFinanceiras.id, id));
}

export async function excluirCategoriaCadastroApi(
  db: Db,
  id: number,
): Promise<'removed' | 'deactivated'> {
  const [row] = await db
    .select()
    .from(categoriasFinanceiras)
    .where(eq(categoriasFinanceiras.id, id))
    .limit(1);
  if (!row) throw new Error('Categoria não encontrada.');

  const [uso] = await db
    .select({ id: movimentacoes.id })
    .from(movimentacoes)
    .where(eq(movimentacoes.categoriaId, id))
    .limit(1);

  if (uso) {
    await db
      .update(categoriasFinanceiras)
      .set({ ativo: false })
      .where(eq(categoriasFinanceiras.id, id));
    return 'deactivated';
  }

  await db.delete(categoriasFinanceiras).where(eq(categoriasFinanceiras.id, id));
  return 'removed';
}

export async function listFormasPagamentoCadastroApi(
  db: Db,
  opts?: { incluirInativas?: boolean; apenasAtivas?: boolean },
): Promise<FormaPagamentoFinanceiraCadastroApi[]> {
  const incluirInativas = opts?.incluirInativas === true;
  const rows = incluirInativas
    ? await db
        .select()
        .from(formasPagamentoFinanceiras)
        .orderBy(
          asc(formasPagamentoFinanceiras.ordem),
          asc(formasPagamentoFinanceiras.id),
        )
    : await db
        .select()
        .from(formasPagamentoFinanceiras)
        .where(eq(formasPagamentoFinanceiras.ativo, true))
        .orderBy(
          asc(formasPagamentoFinanceiras.ordem),
          asc(formasPagamentoFinanceiras.id),
        );
  return rows.map(mapFormaRow);
}

/** Mapa nome/código → baixa automática (para transações e criação de movimentações). */
export async function mapaBaixaAutomaticaFormas(
  db: Db,
): Promise<Map<string, boolean>> {
  const rows = await db
    .select({
      nome: formasPagamentoFinanceiras.nome,
      codigo: formasPagamentoFinanceiras.codigoInterno,
      baixa: formasPagamentoFinanceiras.baixaAutomatica,
    })
    .from(formasPagamentoFinanceiras)
    .where(eq(formasPagamentoFinanceiras.ativo, true));

  const map = new Map<string, boolean>();
  for (const r of rows) {
    map.set(r.nome.trim().toLowerCase(), r.baixa);
    map.set(r.codigo.trim().toLowerCase(), r.baixa);
  }
  return map;
}

/** Mapa nome/código → taxas (percentual + fixa em R$). */
export async function mapaTaxaFormas(
  db: Db,
): Promise<Map<string, FormaTaxaConfig>> {
  const rows = await db
    .select({
      nome: formasPagamentoFinanceiras.nome,
      codigo: formasPagamentoFinanceiras.codigoInterno,
      pct: formasPagamentoFinanceiras.taxaPercentual,
      fixa: formasPagamentoFinanceiras.taxaFixa,
    })
    .from(formasPagamentoFinanceiras)
    .where(eq(formasPagamentoFinanceiras.ativo, true));

  const map = new Map<string, FormaTaxaConfig>();
  for (const r of rows) {
    const cfg: FormaTaxaConfig = {
      pct: taxaNum(r.pct),
      fixa: taxaFixaNum(r.fixa),
    };
    map.set(r.nome.trim().toLowerCase(), cfg);
    map.set(r.codigo.trim().toLowerCase(), cfg);
  }
  return map;
}

export function taxaFormaPorMetodo(
  map: Map<string, FormaTaxaConfig>,
  metodo: string | null | undefined,
): FormaTaxaConfig {
  const m = String(metodo ?? '').trim().toLowerCase();
  if (!m) return { pct: 0, fixa: 0 };
  if (map.has(m)) return map.get(m)!;
  if (m.includes('pix') && map.has('pix')) return map.get('pix')!;
  if (m.includes('dinheiro') && map.has('dinheiro')) return map.get('dinheiro')!;
  if (m.includes('crédito') || m.includes('credito')) {
    if (map.has('cartao_credito')) return map.get('cartao_credito')!;
  }
  if (m.includes('débito') || m.includes('debito')) {
    if (map.has('cartao_debito')) return map.get('cartao_debito')!;
  }
  if (m.includes('transfer') && map.has('transferencia')) {
    return map.get('transferencia')!;
  }
  return { pct: 0, fixa: 0 };
}

export function calcularTaxaReais(
  bruto: number,
  cfg: FormaTaxaConfig,
): number {
  const b = Number.isFinite(bruto) ? bruto : 0;
  const pctPart = (b * cfg.pct) / 100;
  const total = pctPart + cfg.fixa;
  return Math.round(total * 100) / 100;
}

export function metodoTemBaixaAutomatica(
  map: Map<string, boolean>,
  metodo: string | null | undefined,
): boolean {
  const m = String(metodo ?? '').trim().toLowerCase();
  if (!m) return false;
  if (map.has(m)) return map.get(m) === true;
  if (m.includes('pix')) return map.get('pix') === true;
  if (m.includes('dinheiro')) return map.get('dinheiro') === true;
  if (m.includes('débito') || m.includes('debito')) {
    return map.get('cartao_debito') === true;
  }
  return false;
}

export async function criarFormaPagamentoCadastroApi(
  db: Db,
  body: {
    nome: string;
    baixa_automatica?: boolean;
    taxa_percentual?: number;
    taxa_fixa?: number;
    prazo_recebimento?: number;
    ativo?: boolean;
  },
): Promise<number> {
  const nome = String(body.nome ?? '').trim();
  if (!nome) throw new Error('Informe o nome da forma de pagamento.');
  if (await nomeFormaDuplicado(db, nome)) {
    throw new Error('Já existe uma forma de pagamento com este nome.');
  }
  const taxaPercentual =
    body.taxa_percentual !== undefined
      ? parseTaxaPercentualInput(body.taxa_percentual)
      : 0;
  const taxaFixa =
    body.taxa_fixa !== undefined ? parseTaxaFixaInput(body.taxa_fixa) : 0;
  const prazoRecebimento =
    body.prazo_recebimento !== undefined
      ? parsePrazoRecebimentoInput(body.prazo_recebimento)
      : 0;
  const codigoInterno = await codigoInternoUnico(db, nome);
  const [maxOrd] = await db
    .select({
      m: sql<number>`coalesce(max(${formasPagamentoFinanceiras.ordem}), 0)`,
    })
    .from(formasPagamentoFinanceiras);
  const ordem = Number(maxOrd?.m ?? 0) + 10;
  const [ins] = await db
    .insert(formasPagamentoFinanceiras)
    .values({
      nome,
      codigoInterno,
      baixaAutomatica: body.baixa_automatica === true,
      taxaPercentual: taxaPercentual.toFixed(3),
      taxaFixa: taxaFixa.toFixed(2),
      prazoRecebimento,
      ordem,
      ativo: body.ativo !== false,
    })
    .returning({ id: formasPagamentoFinanceiras.id });
  return ins!.id;
}

export async function atualizarFormaPagamentoCadastroApi(
  db: Db,
  id: number,
  body: {
    nome?: string;
    baixa_automatica?: boolean;
    taxa_percentual?: number;
    taxa_fixa?: number;
    prazo_recebimento?: number;
    ativo?: boolean;
  },
): Promise<void> {
  const [row] = await db
    .select()
    .from(formasPagamentoFinanceiras)
    .where(eq(formasPagamentoFinanceiras.id, id))
    .limit(1);
  if (!row) throw new Error('Forma de pagamento não encontrada.');

  const patch: Partial<{
    nome: string;
    baixaAutomatica: boolean;
    taxaPercentual: string;
    taxaFixa: string;
    prazoRecebimento: number;
    ativo: boolean;
  }> = {};

  if (body.nome !== undefined) {
    const nome = String(body.nome).trim();
    if (!nome) throw new Error('Informe o nome da forma de pagamento.');
    if (await nomeFormaDuplicado(db, nome, id)) {
      throw new Error('Já existe uma forma de pagamento com este nome.');
    }
    patch.nome = nome;
  }

  if (body.baixa_automatica !== undefined) {
    patch.baixaAutomatica = body.baixa_automatica === true;
  }

  if (body.taxa_percentual !== undefined) {
    patch.taxaPercentual = parseTaxaPercentualInput(body.taxa_percentual).toFixed(
      3,
    );
  }

  if (body.taxa_fixa !== undefined) {
    patch.taxaFixa = parseTaxaFixaInput(body.taxa_fixa).toFixed(2);
  }

  if (body.prazo_recebimento !== undefined) {
    patch.prazoRecebimento = parsePrazoRecebimentoInput(body.prazo_recebimento);
  }

  if (body.ativo !== undefined) {
    patch.ativo = body.ativo !== false;
  }

  if (Object.keys(patch).length === 0) return;
  await db
    .update(formasPagamentoFinanceiras)
    .set(patch)
    .where(eq(formasPagamentoFinanceiras.id, id));
}

export async function excluirFormaPagamentoCadastroApi(
  db: Db,
  id: number,
): Promise<'removed' | 'deactivated'> {
  const [row] = await db
    .select()
    .from(formasPagamentoFinanceiras)
    .where(eq(formasPagamentoFinanceiras.id, id))
    .limit(1);
  if (!row) throw new Error('Forma de pagamento não encontrada.');

  await db
    .delete(formasPagamentoFinanceiras)
    .where(eq(formasPagamentoFinanceiras.id, id));
  return 'removed';
}

/** Opções para dropdowns (nome visível + código interno). */
export async function listFormasPagamentoOpcoesApi(db: Db): Promise<
  {
    id: number;
    nome: string;
    codigo_interno: string;
    baixa_automatica: boolean;
    taxa_percentual: number;
    taxa_fixa: number;
    prazo_recebimento: number;
  }[]
> {
  const rows = await listFormasPagamentoCadastroApi(db);
  return rows.map((r) => ({
    id: r.id,
    nome: r.nome,
    codigo_interno: r.codigo_interno,
    baixa_automatica: r.baixa_automatica,
    taxa_percentual: r.taxa_percentual,
    taxa_fixa: r.taxa_fixa,
    prazo_recebimento: r.prazo_recebimento,
  }));
}
