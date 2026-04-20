import { and, eq } from 'drizzle-orm';
import type { Db } from '../db';
import { atendimentoItens, produtos } from '../db/schema';
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
