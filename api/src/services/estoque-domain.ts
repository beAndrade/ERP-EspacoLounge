import { and, eq } from 'drizzle-orm';
import type { Db } from '../db';
import { atendimentoItens, produtos } from '../db/schema';
import { normalizeMoneyTextForDb } from '../lib/normalize-money-text';
import { normalizePercentTextForDb } from '../lib/normalize-percent-text';
import { toNumberPt } from './finance-domain';

/** Quantidade disponível em estoque a partir do texto da coluna `produtos.estoque`. */
export function parseQuantidadeEstoque(raw: string | null | undefined): number {
  if (raw == null || String(raw).trim() === '') return 0;
  const n = toNumberPt(String(raw).trim());
  if (n === null || !Number.isFinite(n)) return 0;
  return Math.max(0, n);
}

/**
 * Na confirmação de pagamento: baixa agregada por `produto_id` nas linhas `tipo = produto`
 * da pivot `atendimento_itens`. Bloqueia estoque negativo; usa `SELECT … FOR UPDATE` por produto.
 */
export async function darBaixaEstoqueProdutosDoPedido(
  tx: Db,
  idAtendimento: string,
): Promise<void> {
  const id = String(idAtendimento || '').trim();
  if (!id) return;

  const linhas = await tx
    .select({
      produtoId: atendimentoItens.produtoId,
      quantidade: atendimentoItens.quantidade,
    })
    .from(atendimentoItens)
    .where(
      and(
        eq(atendimentoItens.idAtendimento, id),
        eq(atendimentoItens.tipo, 'produto'),
      ),
    );

  const porProduto = new Map<number, number>();
  for (const l of linhas) {
    const pid = l.produtoId;
    if (pid == null) continue;
    const q = Math.max(0, Math.trunc(Number(l.quantidade ?? 0)));
    if (q <= 0) continue;
    porProduto.set(pid, (porProduto.get(pid) ?? 0) + q);
  }

  const ids = Array.from(porProduto.keys()).sort((a, b) => a - b);
  for (const produtoId of ids) {
    const necessario = porProduto.get(produtoId)!;

    const locked = await tx
      .select()
      .from(produtos)
      .where(eq(produtos.id, produtoId))
      .for('update')
      .limit(1);

    const row = locked[0];
    if (!row) {
      throw new Error(`Produto id ${produtoId} não encontrado para baixa de estoque.`);
    }

    const nome = String(row.produto || '').trim() || `id ${produtoId}`;
    const atual = parseQuantidadeEstoque(row.estoque);
    if (atual < necessario) {
      throw new Error(
        `Estoque insuficiente para "${nome}". Disponível: ${atual}, necessário: ${necessario}.`,
      );
    }
    const novo = atual - necessario;
    await tx
      .update(produtos)
      .set({ estoque: formatEstoqueArmazenamento(novo) })
      .where(eq(produtos.id, produtoId));
  }
}

function formatEstoqueArmazenamento(n: number): string {
  if (!Number.isFinite(n)) return '0';
  if (Number.isInteger(n)) return String(n);
  return String(Math.round(n * 1000) / 1000);
}

/**
 * Entrada manual de mercadoria (tela Estoque). Soma unidades ao `produtos.estoque` existente.
 */
export async function incrementarEstoqueProduto(
  db: Db,
  produtoId: number,
  adicionar: number,
): Promise<{ id: number; produto: string; estoque: string }> {
  if (!Number.isFinite(adicionar) || adicionar <= 0) {
    throw new Error('Quantidade a adicionar deve ser maior que zero.');
  }
  const delta = Math.trunc(adicionar);
  if (delta !== adicionar) {
    throw new Error('Use um número inteiro de unidades.');
  }

  return await db.transaction(async (tx) => {
    const locked = await tx
      .select()
      .from(produtos)
      .where(eq(produtos.id, produtoId))
      .for('update')
      .limit(1);
    const row = locked[0];
    if (!row) {
      throw new Error('Produto não encontrado');
    }
    const atual = parseQuantidadeEstoque(row.estoque);
    const novo = atual + delta;
    const estoqueStr = formatEstoqueArmazenamento(novo);
    await tx
      .update(produtos)
      .set({ estoque: estoqueStr })
      .where(eq(produtos.id, produtoId));
    const nome = String(row.produto || '').trim();
    return { id: produtoId, produto: nome, estoque: estoqueStr };
  });
}

function textoOpcional(v: unknown): string | null {
  const s = String(v ?? '').trim();
  return s.length > 0 ? s : null;
}

export type ProdutoCatalogoApi = {
  id: number;
  produto: string;
  categoria: string;
  marca: string;
  preco: string | null;
  custo: string | null;
  estoque: string | null;
  estoque_inicial: string | null;
  estoque_minimo: string | null;
  unidade: string;
  preco_profissional: string | null;
  custo_adicional: string | null;
  comissao_padrao: string | null;
  codigo_item: string | null;
  codigo_barras: string | null;
  observacoes: string | null;
  foto_url: string | null;
};

function mapProdutoRow(r: typeof produtos.$inferSelect): ProdutoCatalogoApi {
  return {
    id: r.id,
    produto: String(r.produto || '').trim(),
    categoria: r.categoria != null ? String(r.categoria).trim() : '',
    marca: r.marca != null ? String(r.marca).trim() : '',
    preco: r.preco,
    custo: r.custo,
    estoque: r.estoque,
    estoque_inicial: r.estoqueInicial,
    estoque_minimo: r.estoqueMinimo,
    unidade: r.unidade != null ? String(r.unidade) : '',
    preco_profissional: r.precoProfissional,
    custo_adicional: r.custoAdicional,
    comissao_padrao: r.comissaoPadrao,
    codigo_item: r.codigoItem,
    codigo_barras: r.codigoBarras,
    observacoes: r.observacoes,
    foto_url: r.fotoUrl,
  };
}

export type CriarProdutoInput = {
  produto: string;
  categoria?: string | null;
  marca?: string | null;
  preco?: string | null;
  custo?: string | null;
  estoque_inicial?: string | null;
  estoque_minimo?: string | null;
  unidade?: string | null;
  preco_profissional?: string | null;
  custo_adicional?: string | null;
  comissao_padrao?: string | null;
  codigo_item?: string | null;
  codigo_barras?: string | null;
  observacoes?: string | null;
  foto_url?: string | null;
};

export async function criarProdutoApi(
  db: Db,
  input: CriarProdutoInput,
): Promise<ProdutoCatalogoApi> {
  const nome = String(input.produto ?? '').trim();
  if (!nome) throw new Error('Informe o nome do produto.');
  const categoria = textoOpcional(input.categoria);
  if (!categoria) throw new Error('Informe a categoria.');

  const estoqueInicial = textoOpcional(input.estoque_inicial) ?? '0';
  const estoqueNum = parseQuantidadeEstoque(estoqueInicial);
  const estoqueStr = formatEstoqueArmazenamento(estoqueNum);

  const [row] = await db
    .insert(produtos)
    .values({
      produto: nome,
      categoria,
      marca: textoOpcional(input.marca),
      preco: normalizeMoneyTextForDb(input.preco),
      custo: normalizeMoneyTextForDb(input.custo),
      estoque: estoqueStr,
      estoqueInicial: estoqueStr,
      estoqueMinimo: textoOpcional(input.estoque_minimo) ?? '0',
      unidade: textoOpcional(input.unidade) ?? 'unidade',
      precoProfissional: normalizeMoneyTextForDb(input.preco_profissional),
      custoAdicional: normalizeMoneyTextForDb(input.custo_adicional),
      comissaoPadrao: normalizePercentTextForDb(input.comissao_padrao),
      codigoItem: textoOpcional(input.codigo_item),
      codigoBarras: textoOpcional(input.codigo_barras),
      observacoes: textoOpcional(input.observacoes),
      fotoUrl: textoOpcional(input.foto_url),
    })
    .returning();

  if (!row) throw new Error('Não foi possível criar o produto.');
  return mapProdutoRow(row);
}

export async function atualizarProdutoApi(
  db: Db,
  id: number,
  input: CriarProdutoInput,
): Promise<ProdutoCatalogoApi> {
  const produtoId = Math.trunc(Number(id));
  if (!Number.isFinite(produtoId) || produtoId < 1) {
    throw new Error('Produto inválido.');
  }
  const nome = String(input.produto ?? '').trim();
  if (!nome) throw new Error('Informe o nome do produto.');
  const categoria = textoOpcional(input.categoria);
  if (!categoria) throw new Error('Informe a categoria.');

  const [existing] = await db
    .select()
    .from(produtos)
    .where(eq(produtos.id, produtoId))
    .limit(1);
  if (!existing) throw new Error('Produto não encontrado.');

  const estoqueMinimo = textoOpcional(input.estoque_minimo) ?? existing.estoqueMinimo ?? '0';

  const [row] = await db
    .update(produtos)
    .set({
      produto: nome,
      categoria,
      marca: textoOpcional(input.marca),
      preco: normalizeMoneyTextForDb(input.preco),
      custo: normalizeMoneyTextForDb(input.custo),
      estoqueMinimo,
      unidade: textoOpcional(input.unidade) ?? existing.unidade ?? 'unidade',
      precoProfissional: normalizeMoneyTextForDb(input.preco_profissional),
      custoAdicional: normalizeMoneyTextForDb(input.custo_adicional),
      comissaoPadrao: normalizePercentTextForDb(input.comissao_padrao),
      codigoItem: textoOpcional(input.codigo_item),
      codigoBarras: textoOpcional(input.codigo_barras),
      observacoes: textoOpcional(input.observacoes),
      fotoUrl: textoOpcional(input.foto_url),
    })
    .where(eq(produtos.id, produtoId))
    .returning();

  if (!row) throw new Error('Não foi possível atualizar o produto.');
  return mapProdutoRow(row);
}
