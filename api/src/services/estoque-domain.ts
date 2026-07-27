import { and, eq, inArray } from 'drizzle-orm';
import type { Db } from '../db';
import {
  atendimentoItens,
  atendimentosPedido,
  estoqueMovimentos,
  produtos,
  servicoProdutosConsumidos,
} from '../db/schema';
import { normalizeMoneyTextForDb } from '../lib/normalize-money-text';
import { normalizePercentTextForDb } from '../lib/normalize-percent-text';
import { toNumberPt } from './finance-domain';

export type EstoqueMovimentoTipo =
  | 'entrada'
  | 'baixa_venda'
  | 'baixa_consumo_servico'
  | 'ajuste';

/** Quantidade disponível em estoque a partir do texto da coluna `produtos.estoque`. */
export function parseQuantidadeEstoque(raw: string | null | undefined): number {
  if (raw == null || String(raw).trim() === '') return 0;
  const n = toNumberPt(String(raw).trim());
  if (n === null || !Number.isFinite(n)) return 0;
  return Math.max(0, n);
}

export function formatEstoqueArmazenamento(n: number): string {
  if (!Number.isFinite(n)) return '0';
  if (Number.isInteger(n)) return String(n);
  return String(Math.round(n * 1000) / 1000);
}

function parseEquivalente(raw: string | null | undefined): number {
  const n = parseQuantidadeEstoque(raw);
  return n > 0 ? n : 1;
}

function roundQty(n: number): number {
  return Math.round(n * 1000) / 1000;
}

type BaixaAgregada = {
  produtoId: number;
  venda: number;
  consumo: number;
};

/**
 * Baixa idempotente ao finalizar cobrança:
 * - itens `tipo=produto` → baixa_venda
 * - itens `tipo=servico` × receita `servico_produtos_consumidos` → baixa_consumo_servico
 *
 * Usa `atendimentos_pedido.estoque_baixado_em` como trava; grava ledger em `estoque_movimentos`.
 */
export async function darBaixaEstoqueDoPedido(
  db: Db,
  idAtendimento: string,
): Promise<{ baixou: boolean }> {
  const id = String(idAtendimento || '').trim();
  if (!id) return { baixou: false };

  return await db.transaction(async (tx) => {
    const [pedido] = await tx
      .select({
        idAtendimento: atendimentosPedido.idAtendimento,
        estoqueBaixadoEm: atendimentosPedido.estoqueBaixadoEm,
      })
      .from(atendimentosPedido)
      .where(eq(atendimentosPedido.idAtendimento, id))
      .for('update')
      .limit(1);

    if (!pedido) return { baixou: false };
    if (pedido.estoqueBaixadoEm) return { baixou: false };

    const linhas = await tx
      .select({
        tipo: atendimentoItens.tipo,
        produtoId: atendimentoItens.produtoId,
        servicoId: atendimentoItens.servicoId,
        quantidade: atendimentoItens.quantidade,
      })
      .from(atendimentoItens)
      .where(eq(atendimentoItens.idAtendimento, id));

    const agregados = new Map<number, BaixaAgregada>();

    const bump = (
      produtoId: number,
      campo: 'venda' | 'consumo',
      qtd: number,
    ) => {
      const q = roundQty(Math.max(0, qtd));
      if (q <= 0) return;
      const cur = agregados.get(produtoId) ?? {
        produtoId,
        venda: 0,
        consumo: 0,
      };
      cur[campo] = roundQty(cur[campo] + q);
      agregados.set(produtoId, cur);
    };

    for (const l of linhas) {
      if (l.tipo === 'produto' && l.produtoId != null) {
        bump(l.produtoId, 'venda', Number(l.quantidade ?? 0));
      }
    }

    const servicoQtys = new Map<number, number>();
    for (const l of linhas) {
      if (l.tipo !== 'servico' || l.servicoId == null) continue;
      const q = Math.max(0, Number(l.quantidade ?? 0));
      if (q <= 0) continue;
      servicoQtys.set(
        l.servicoId,
        roundQty((servicoQtys.get(l.servicoId) ?? 0) + q),
      );
    }

    const servicoIds = Array.from(servicoQtys.keys());
    if (servicoIds.length > 0) {
      const receitas = await tx
        .select({
          servicoId: servicoProdutosConsumidos.servicoId,
          produtoId: servicoProdutosConsumidos.produtoId,
          quantidade: servicoProdutosConsumidos.quantidade,
        })
        .from(servicoProdutosConsumidos)
        .where(inArray(servicoProdutosConsumidos.servicoId, servicoIds));

      for (const r of receitas) {
        const vezes = servicoQtys.get(r.servicoId) ?? 0;
        const porServico = Number(r.quantidade);
        if (!Number.isFinite(porServico) || porServico <= 0 || vezes <= 0) {
          continue;
        }
        bump(r.produtoId, 'consumo', porServico * vezes);
      }
    }

    const ids = Array.from(agregados.keys()).sort((a, b) => a - b);
    for (const produtoId of ids) {
      const agg = agregados.get(produtoId)!;
      const necessario = roundQty(agg.venda + agg.consumo);
      if (necessario <= 0) continue;

      const locked = await tx
        .select()
        .from(produtos)
        .where(eq(produtos.id, produtoId))
        .for('update')
        .limit(1);

      const row = locked[0];
      if (!row) {
        throw new Error(
          `Produto id ${produtoId} não encontrado para baixa de estoque.`,
        );
      }

      const nome = String(row.produto || '').trim() || `id ${produtoId}`;
      const atual = parseQuantidadeEstoque(row.estoque);
      if (atual + 1e-9 < necessario) {
        throw new Error(
          `Estoque insuficiente para "${nome}". Disponível: ${formatEstoqueArmazenamento(atual)}, necessário: ${formatEstoqueArmazenamento(necessario)}.`,
        );
      }

      let saldo = atual;
      if (agg.venda > 0) {
        saldo = roundQty(saldo - agg.venda);
        const saldoStr = formatEstoqueArmazenamento(saldo);
        await tx.insert(estoqueMovimentos).values({
          produtoId,
          idAtendimento: id,
          tipo: 'baixa_venda',
          quantidade: String(agg.venda),
          saldoApos: saldoStr,
        });
      }
      if (agg.consumo > 0) {
        saldo = roundQty(saldo - agg.consumo);
        const saldoStr = formatEstoqueArmazenamento(saldo);
        await tx.insert(estoqueMovimentos).values({
          produtoId,
          idAtendimento: id,
          tipo: 'baixa_consumo_servico',
          quantidade: String(agg.consumo),
          saldoApos: saldoStr,
        });
      }

      await tx
        .update(produtos)
        .set({ estoque: formatEstoqueArmazenamento(saldo) })
        .where(eq(produtos.id, produtoId));
    }

    await tx
      .update(atendimentosPedido)
      .set({ estoqueBaixadoEm: new Date().toISOString() })
      .where(eq(atendimentosPedido.idAtendimento, id));

    return { baixou: true };
  });
}

/** @deprecated Preferir `darBaixaEstoqueDoPedido` (venda + consumo, idempotente). */
export async function darBaixaEstoqueProdutosDoPedido(
  tx: Db,
  idAtendimento: string,
): Promise<void> {
  await darBaixaEstoqueDoPedido(tx, idAtendimento);
}

export type IncrementarEstoqueInput = {
  /** Delta direto na unidade de saída (ml/g/unidade). */
  adicionar?: number;
  /**
   * Frascos / unidades físicas: multiplica por `unidade_equivalente`
   * quando a unidade de saída é ml/g.
   */
  adicionar_unidades?: number;
};

/**
 * Entrada manual de mercadoria. Soma ao `produtos.estoque` e grava movimento `entrada`.
 */
export async function incrementarEstoqueProduto(
  db: Db,
  produtoId: number,
  input: number | IncrementarEstoqueInput,
): Promise<{ id: number; produto: string; estoque: string }> {
  const opts: IncrementarEstoqueInput =
    typeof input === 'number' ? { adicionar: input } : input;

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

    const unidade = String(row.unidade || 'unidade').trim().toLowerCase();
    const eqv = parseEquivalente(row.unidadeEquivalente);
    let delta = 0;

    if (opts.adicionar_unidades != null) {
      const u = Number(opts.adicionar_unidades);
      if (!Number.isFinite(u) || u <= 0) {
        throw new Error('Quantidade de unidades deve ser maior que zero.');
      }
      if (unidade === 'ml' || unidade === 'g') {
        delta = roundQty(u * eqv);
      } else {
        if (Math.trunc(u) !== u) {
          throw new Error('Use um número inteiro de unidades.');
        }
        delta = Math.trunc(u);
      }
    } else if (opts.adicionar != null) {
      const a = Number(opts.adicionar);
      if (!Number.isFinite(a) || a <= 0) {
        throw new Error('Quantidade a adicionar deve ser maior que zero.');
      }
      if (unidade === 'unidade') {
        if (Math.trunc(a) !== a) {
          throw new Error('Use um número inteiro de unidades.');
        }
        delta = Math.trunc(a);
      } else {
        delta = roundQty(a);
      }
    } else {
      throw new Error('Informe adicionar ou adicionar_unidades.');
    }

    if (delta <= 0) {
      throw new Error('Quantidade a adicionar deve ser maior que zero.');
    }

    const atual = parseQuantidadeEstoque(row.estoque);
    const novo = roundQty(atual + delta);
    const estoqueStr = formatEstoqueArmazenamento(novo);
    await tx
      .update(produtos)
      .set({ estoque: estoqueStr })
      .where(eq(produtos.id, produtoId));
    await tx.insert(estoqueMovimentos).values({
      produtoId,
      idAtendimento: null,
      tipo: 'entrada',
      quantidade: String(delta),
      saldoApos: estoqueStr,
    });
    const nome = String(row.produto || '').trim();
    return { id: produtoId, produto: nome, estoque: estoqueStr };
  });
}

function textoOpcional(v: unknown): string | null {
  const s = String(v ?? '').trim();
  return s.length > 0 ? s : null;
}

function normalizarUnidadeEquivalente(
  raw: unknown,
  unidade: string,
): string | null {
  const u = String(unidade || 'unidade').trim().toLowerCase();
  if (u === 'unidade') return '1';
  const n = parseQuantidadeEstoque(raw == null ? '1' : String(raw));
  if (n <= 0) return '1';
  return formatEstoqueArmazenamento(n);
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
  unidade_equivalente: string | null;
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
    unidade_equivalente: r.unidadeEquivalente,
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
  unidade_equivalente?: string | null;
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

  const unidade = textoOpcional(input.unidade) ?? 'unidade';
  const estoqueInicial = textoOpcional(input.estoque_inicial) ?? '0';
  const estoqueNum = parseQuantidadeEstoque(estoqueInicial);
  const estoqueStr = formatEstoqueArmazenamento(estoqueNum);
  const unidadeEquivalente = normalizarUnidadeEquivalente(
    input.unidade_equivalente,
    unidade,
  );

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
      unidade,
      unidadeEquivalente,
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

  if (estoqueNum > 0) {
    await db.insert(estoqueMovimentos).values({
      produtoId: row.id,
      idAtendimento: null,
      tipo: 'entrada',
      quantidade: String(estoqueNum),
      saldoApos: estoqueStr,
    });
  }

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

  const estoqueMinimo =
    textoOpcional(input.estoque_minimo) ?? existing.estoqueMinimo ?? '0';
  const unidade =
    textoOpcional(input.unidade) ?? existing.unidade ?? 'unidade';
  const unidadeEquivalente = normalizarUnidadeEquivalente(
    input.unidade_equivalente ?? existing.unidadeEquivalente,
    unidade,
  );

  const [row] = await db
    .update(produtos)
    .set({
      produto: nome,
      categoria,
      marca: textoOpcional(input.marca),
      preco: normalizeMoneyTextForDb(input.preco),
      custo: normalizeMoneyTextForDb(input.custo),
      estoqueMinimo,
      unidade,
      unidadeEquivalente,
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

export type ServicoProdutoConsumidoApi = {
  id: number;
  servico_id: number;
  produto_id: number;
  produto: string;
  unidade: string;
  quantidade: string;
};

export async function listServicoProdutosConsumidos(
  db: Db,
  servicoId: number,
): Promise<ServicoProdutoConsumidoApi[]> {
  const sid = Math.trunc(Number(servicoId));
  if (!Number.isFinite(sid) || sid < 1) {
    throw new Error('Serviço inválido.');
  }

  const rows = await db
    .select({
      id: servicoProdutosConsumidos.id,
      servicoId: servicoProdutosConsumidos.servicoId,
      produtoId: servicoProdutosConsumidos.produtoId,
      quantidade: servicoProdutosConsumidos.quantidade,
      produto: produtos.produto,
      unidade: produtos.unidade,
    })
    .from(servicoProdutosConsumidos)
    .innerJoin(produtos, eq(produtos.id, servicoProdutosConsumidos.produtoId))
    .where(eq(servicoProdutosConsumidos.servicoId, sid));

  return rows.map((r) => ({
    id: r.id,
    servico_id: r.servicoId,
    produto_id: r.produtoId,
    produto: String(r.produto || '').trim(),
    unidade: r.unidade != null ? String(r.unidade) : 'unidade',
    quantidade: String(r.quantidade),
  }));
}

export type ServicoProdutoConsumidoInput = {
  produto_id: number;
  quantidade: number | string;
};

/**
 * Substitui a receita de produtos consumidos do serviço (lista completa).
 */
export async function replaceServicoProdutosConsumidos(
  db: Db,
  servicoId: number,
  items: ServicoProdutoConsumidoInput[],
): Promise<ServicoProdutoConsumidoApi[]> {
  const sid = Math.trunc(Number(servicoId));
  if (!Number.isFinite(sid) || sid < 1) {
    throw new Error('Serviço inválido.');
  }

  const cleaned: { produtoId: number; quantidade: string }[] = [];
  const seen = new Set<number>();
  for (const raw of items ?? []) {
    const pid = Math.trunc(Number(raw.produto_id));
    if (!Number.isFinite(pid) || pid < 1) {
      throw new Error('produto_id inválido na receita.');
    }
    if (seen.has(pid)) {
      throw new Error('Produto duplicado na receita do serviço.');
    }
    seen.add(pid);
    const q =
      typeof raw.quantidade === 'number'
        ? raw.quantidade
        : parseQuantidadeEstoque(String(raw.quantidade));
    if (!Number.isFinite(q) || q <= 0) {
      throw new Error('Quantidade de consumo deve ser maior que zero.');
    }
    cleaned.push({ produtoId: pid, quantidade: String(roundQty(q)) });
  }

  await db.transaction(async (tx) => {
    if (cleaned.length > 0) {
      const ids = cleaned.map((c) => c.produtoId);
      const found = await tx
        .select({ id: produtos.id })
        .from(produtos)
        .where(inArray(produtos.id, ids));
      if (found.length !== ids.length) {
        throw new Error('Um ou mais produtos da receita não existem.');
      }
    }

    await tx
      .delete(servicoProdutosConsumidos)
      .where(eq(servicoProdutosConsumidos.servicoId, sid));

    if (cleaned.length > 0) {
      await tx.insert(servicoProdutosConsumidos).values(
        cleaned.map((c) => ({
          servicoId: sid,
          produtoId: c.produtoId,
          quantidade: c.quantidade,
        })),
      );
    }
  });

  return listServicoProdutosConsumidos(db, sid);
}
