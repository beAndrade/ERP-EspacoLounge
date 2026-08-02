import { asc, eq, ilike, inArray, sql } from 'drizzle-orm';
import type { Db } from '../db';
import {
  categoriasFinanceiras,
  formasPagamentoFinanceiras,
  formasPagamentoPrazosFaixas,
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
  prazos_faixas: FormaPrazoFaixaApi[];
};

export type FormaPrazoFaixaApi = {
  id: number;
  parcelas_de: number;
  parcelas_ate: number;
  dias_ate_primeira: number;
  intervalo_dias: number;
  /** null = usa taxa da forma. */
  taxa_percentual: number | null;
  juros_cliente: boolean;
};

export type FormaPrazoFaixaInput = {
  id?: number;
  parcelas_de: number;
  parcelas_ate: number;
  dias_ate_primeira: number;
  intervalo_dias: number;
  taxa_percentual?: number | null;
  juros_cliente?: boolean;
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

function mapFormaRow(
  r: {
    id: number;
    nome: string;
    codigoInterno: string;
    baixaAutomatica: boolean;
    taxaPercentual: unknown;
    taxaFixa: unknown;
    prazoRecebimento: unknown;
    ordem: number;
    ativo: boolean;
  },
  faixas: FormaPrazoFaixaApi[] = [],
): FormaPagamentoFinanceiraCadastroApi {
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
    prazos_faixas: faixas,
  };
}

function mapFaixaRow(r: {
  id: number;
  parcelasDe: number;
  parcelasAte: number;
  diasAtePrimeira: number;
  intervaloDias: number;
  taxaPercentual: unknown;
  jurosCliente: boolean;
}): FormaPrazoFaixaApi {
  return {
    id: r.id,
    parcelas_de: r.parcelasDe,
    parcelas_ate: r.parcelasAte,
    dias_ate_primeira: r.diasAtePrimeira,
    intervalo_dias: r.intervaloDias,
    taxa_percentual:
      r.taxaPercentual == null || String(r.taxaPercentual).trim() === ''
        ? null
        : taxaNum(r.taxaPercentual),
    juros_cliente: r.jurosCliente === true,
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

  const ids = rows.map((r) => r.id);
  const faixasPorForma = await carregarFaixasPorFormaIds(db, ids);
  return rows.map((r) => mapFormaRow(r, faixasPorForma.get(r.id) ?? []));
}

async function carregarFaixasPorFormaIds(
  db: Db,
  formaIds: number[],
): Promise<Map<number, FormaPrazoFaixaApi[]>> {
  const out = new Map<number, FormaPrazoFaixaApi[]>();
  if (formaIds.length === 0) return out;
  const rows = await db
    .select()
    .from(formasPagamentoPrazosFaixas)
    .where(inArray(formasPagamentoPrazosFaixas.formaId, formaIds))
    .orderBy(
      asc(formasPagamentoPrazosFaixas.parcelasDe),
      asc(formasPagamentoPrazosFaixas.id),
    );
  for (const r of rows) {
    const list = out.get(r.formaId) ?? [];
    list.push(mapFaixaRow(r));
    out.set(r.formaId, list);
  }
  return out;
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
  if (m.includes('crédito') || m.includes('credito')) {
    return map.get('cartao_credito') === true;
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
    prazos_faixas?: FormaPrazoFaixaInput[];
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

  if (Object.keys(patch).length > 0) {
    await db
      .update(formasPagamentoFinanceiras)
      .set(patch)
      .where(eq(formasPagamentoFinanceiras.id, id));
  }

  if (body.prazos_faixas !== undefined) {
    await substituirPrazosFaixasForma(db, id, body.prazos_faixas);
  }
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

/** Opções para dropdowns (nome visível + código interno + faixas de prazo). */
export async function listFormasPagamentoOpcoesApi(db: Db): Promise<
  {
    id: number;
    nome: string;
    codigo_interno: string;
    baixa_automatica: boolean;
    taxa_percentual: number;
    taxa_fixa: number;
    prazo_recebimento: number;
    prazos_faixas: FormaPrazoFaixaApi[];
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
    prazos_faixas: r.prazos_faixas,
  }));
}

function parseFaixaInput(raw: FormaPrazoFaixaInput): {
  parcelasDe: number;
  parcelasAte: number;
  diasAtePrimeira: number;
  intervaloDias: number;
  taxaPercentual: string | null;
  jurosCliente: boolean;
} {
  const de = Math.floor(Number(raw.parcelas_de));
  const ate = Math.floor(Number(raw.parcelas_ate));
  if (!Number.isFinite(de) || de < 1) {
    throw new Error('Parcelas (de) inválidas.');
  }
  if (!Number.isFinite(ate) || ate < de) {
    throw new Error('Parcelas (até) devem ser ≥ parcelas (de).');
  }
  if (ate > 48) throw new Error('Parcelas (até) não podem passar de 48.');
  const dias = Math.floor(Number(raw.dias_ate_primeira));
  if (!Number.isFinite(dias) || dias < 0 || dias > 9999) {
    throw new Error('Dias até a primeira parcela inválidos.');
  }
  const intervalo = Math.floor(Number(raw.intervalo_dias));
  if (!Number.isFinite(intervalo) || intervalo < 0 || intervalo > 9999) {
    throw new Error('Intervalo entre parcelas inválido.');
  }
  let taxaPercentual: string | null = null;
  if (raw.taxa_percentual != null && String(raw.taxa_percentual).trim() !== '') {
    taxaPercentual = parseTaxaPercentualInput(raw.taxa_percentual).toFixed(3);
  }
  return {
    parcelasDe: de,
    parcelasAte: ate,
    diasAtePrimeira: dias,
    intervaloDias: intervalo,
    taxaPercentual,
    jurosCliente: raw.juros_cliente === true,
  };
}

/** Substitui todas as faixas da forma. */
export async function substituirPrazosFaixasForma(
  db: Db,
  formaId: number,
  faixas: FormaPrazoFaixaInput[],
): Promise<void> {
  const parsed = (faixas ?? []).map(parseFaixaInput);
  for (let i = 0; i < parsed.length; i++) {
    for (let j = i + 1; j < parsed.length; j++) {
      const a = parsed[i]!;
      const b = parsed[j]!;
      if (a.parcelasDe <= b.parcelasAte && b.parcelasDe <= a.parcelasAte) {
        throw new Error(
          `Faixas de parcelas se sobrepõem (${a.parcelasDe}–${a.parcelasAte} e ${b.parcelasDe}–${b.parcelasAte}).`,
        );
      }
    }
  }

  await db
    .delete(formasPagamentoPrazosFaixas)
    .where(eq(formasPagamentoPrazosFaixas.formaId, formaId));

  if (parsed.length === 0) return;

  await db.insert(formasPagamentoPrazosFaixas).values(
    parsed.map((p) => ({
      formaId,
      parcelasDe: p.parcelasDe,
      parcelasAte: p.parcelasAte,
      diasAtePrimeira: p.diasAtePrimeira,
      intervaloDias: p.intervaloDias,
      taxaPercentual: p.taxaPercentual,
      jurosCliente: p.jurosCliente,
    })),
  );
}

/** Resolve a faixa aplicável a N parcelas (ou null se não houver). */
export function resolverFaixaParcelas(
  faixas: FormaPrazoFaixaApi[],
  nParcelas: number,
): FormaPrazoFaixaApi | null {
  const n = Math.max(1, Math.floor(nParcelas));
  return (
    faixas.find((f) => n >= f.parcelas_de && n <= f.parcelas_ate) ?? null
  );
}

/** Soma dias a `YYYY-MM-DD` (calendário civil). */
export function ymdAddDays(ymd: string, days: number): string {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(String(ymd).trim().slice(0, 10));
  if (!m) return ymd;
  const dt = new Date(
    Number(m[1]),
    Number(m[2]) - 1,
    Number(m[3]) + Math.floor(days),
  );
  const mm = dt.getMonth() + 1;
  const dd = dt.getDate();
  return `${dt.getFullYear()}-${mm < 10 ? `0${mm}` : mm}-${dd < 10 ? `0${dd}` : dd}`;
}

/**
 * Datas de vencimento das parcelas de cartão.
 * Com faixa: venda + dias_ate_primeira + (i-1)*intervalo_dias.
 * Sem faixa: fallback ao prazo único da forma na 1ª + intervalo 30 dias.
 */
export function calcularDatasParcelasCartao(opts: {
  dataVendaYmd: string;
  nParcelas: number;
  faixa: FormaPrazoFaixaApi | null;
  prazoRecebimentoFallback?: number;
}): string[] {
  const n = Math.max(1, Math.floor(opts.nParcelas));
  const base = String(opts.dataVendaYmd).trim().slice(0, 10);
  if (opts.faixa) {
    return Array.from({ length: n }, (_, i) => {
      const offset =
        opts.faixa!.dias_ate_primeira + i * opts.faixa!.intervalo_dias;
      return ymdAddDays(base, offset);
    });
  }
  const prazo = Math.max(0, Math.floor(opts.prazoRecebimentoFallback ?? 0));
  const intervalo = n > 1 ? 30 : 0;
  return Array.from({ length: n }, (_, i) =>
    ymdAddDays(base, prazo + i * intervalo),
  );
}
