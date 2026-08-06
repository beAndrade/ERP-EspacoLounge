import { desc, eq, inArray, sql } from 'drizzle-orm';
import { syncSerialIdSequence, type Db } from '../db';
import {
  atendimentoItens,
  atendimentosPedido,
  estoqueMovimentos,
  profissionais,
  produtos,
  servicoProdutosConsumidos,
  usuarios,
} from '../db/schema';
import { normalizeMoneyTextForDb } from '../lib/normalize-money-text';
import { normalizePercentTextForDb } from '../shared/utils/normalize-percent-text';
import { toNumberPt } from './finance-domain';

export type EstoqueMovimentoTipo =
  | 'entrada'
  | 'estoque_inicial'
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

export type EstoqueMovimentoActor = {
  usuario_id?: number | null;
  profissional_id?: number | null;
};

type BaixaAgregada = {
  produtoId: number;
  venda: number;
  consumo: number;
  profissionalVendaId: number | null;
  profissionalConsumoId: number | null;
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
        profissionalId: atendimentoItens.profissionalId,
      })
      .from(atendimentoItens)
      .where(eq(atendimentoItens.idAtendimento, id));

    const agregados = new Map<number, BaixaAgregada>();

    const bump = (
      produtoId: number,
      campo: 'venda' | 'consumo',
      qtd: number,
      profissionalId: number | null,
    ) => {
      const q = roundQty(Math.max(0, qtd));
      if (q <= 0) return;
      const cur = agregados.get(produtoId) ?? {
        produtoId,
        venda: 0,
        consumo: 0,
        profissionalVendaId: null,
        profissionalConsumoId: null,
      };
      cur[campo] = roundQty(cur[campo] + q);
      if (profissionalId != null && Number.isFinite(profissionalId) && profissionalId > 0) {
        if (campo === 'venda' && cur.profissionalVendaId == null) {
          cur.profissionalVendaId = profissionalId;
        }
        if (campo === 'consumo' && cur.profissionalConsumoId == null) {
          cur.profissionalConsumoId = profissionalId;
        }
      }
      agregados.set(produtoId, cur);
    };

    for (const l of linhas) {
      if (l.tipo === 'produto' && l.produtoId != null) {
        bump(
          l.produtoId,
          'venda',
          Number(l.quantidade ?? 0),
          l.profissionalId ?? null,
        );
      }
    }

    const servicoQtys = new Map<number, number>();
    const servicoProf = new Map<number, number | null>();
    for (const l of linhas) {
      if (l.tipo !== 'servico' || l.servicoId == null) continue;
      const q = Math.max(0, Number(l.quantidade ?? 0));
      if (q <= 0) continue;
      servicoQtys.set(
        l.servicoId,
        roundQty((servicoQtys.get(l.servicoId) ?? 0) + q),
      );
      if (!servicoProf.has(l.servicoId)) {
        servicoProf.set(l.servicoId, l.profissionalId ?? null);
      }
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
        bump(
          r.produtoId,
          'consumo',
          porServico * vezes,
          servicoProf.get(r.servicoId) ?? null,
        );
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
          profissionalId: agg.profissionalVendaId,
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
          profissionalId: agg.profissionalConsumoId,
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

export type EstoqueMovimentoApi = {
  id: number;
  produto_id: number;
  id_atendimento: string | null;
  tipo: EstoqueMovimentoTipo | string;
  origem: string;
  tipo_exibicao: 'Entrada' | 'Saída';
  quantidade: string;
  saldo_anterior: string;
  saldo_apos: string | null;
  created_at: string;
  descricao: string;
  /** Reservado para lotes/validades (ainda sem coluna na BD). */
  lote: string | null;
  /** Nome de quem fez o movimento (profissional ou usuário). */
  profissional: string | null;
  profissional_id: number | null;
};

function rotuloOrigem(tipo: string): string {
  switch (tipo) {
    case 'entrada':
    case 'estoque_inicial':
      return 'Ajuste manual';
    case 'baixa_venda':
      return 'Venda na comanda';
    case 'baixa_consumo_servico':
      return 'Consumo em serviço';
    case 'ajuste':
      return 'Ajuste';
    default:
      return tipo || 'Movimento';
  }
}

function isEntradaTipo(tipo: string): boolean {
  return tipo === 'entrada' || tipo === 'estoque_inicial' || tipo === 'ajuste';
}

export async function listEstoqueMovimentosProduto(
  db: Db,
  produtoId: number,
): Promise<EstoqueMovimentoApi[]> {
  const pid = Math.trunc(Number(produtoId));
  if (!Number.isFinite(pid) || pid < 1) {
    throw new Error('Produto inválido.');
  }

  const [prod] = await db
    .select({
      id: produtos.id,
      estoque: produtos.estoque,
      estoqueInicial: produtos.estoqueInicial,
    })
    .from(produtos)
    .where(eq(produtos.id, pid))
    .limit(1);
  if (!prod) throw new Error('Produto não encontrado');

  let rows = await db
    .select({
      id: estoqueMovimentos.id,
      produtoId: estoqueMovimentos.produtoId,
      idAtendimento: estoqueMovimentos.idAtendimento,
      tipo: estoqueMovimentos.tipo,
      quantidade: estoqueMovimentos.quantidade,
      saldoApos: estoqueMovimentos.saldoApos,
      createdAt: estoqueMovimentos.createdAt,
      profissionalId: estoqueMovimentos.profissionalId,
      usuarioId: estoqueMovimentos.usuarioId,
      profissionalNome: profissionais.nome,
      usuarioNome: usuarios.nomeExibicao,
    })
    .from(estoqueMovimentos)
    .leftJoin(
      profissionais,
      eq(estoqueMovimentos.profissionalId, profissionais.id),
    )
    .leftJoin(usuarios, eq(estoqueMovimentos.usuarioId, usuarios.id))
    .where(eq(estoqueMovimentos.produtoId, pid))
    .orderBy(desc(estoqueMovimentos.createdAt), desc(estoqueMovimentos.id));

  // Produtos criados antes desta regra: gera o lançamento inicial a partir
  // do estoque cadastrado, para o histórico não ficar vazio.
  if (rows.length === 0) {
    const q =
      parseQuantidadeEstoque(prod.estoqueInicial) ||
      parseQuantidadeEstoque(prod.estoque);
    const saldo = formatEstoqueArmazenamento(q);
    await db.insert(estoqueMovimentos).values({
      produtoId: pid,
      idAtendimento: null,
      tipo: 'estoque_inicial',
      quantidade: String(q),
      saldoApos: saldo,
    });
    rows = await db
      .select({
        id: estoqueMovimentos.id,
        produtoId: estoqueMovimentos.produtoId,
        idAtendimento: estoqueMovimentos.idAtendimento,
        tipo: estoqueMovimentos.tipo,
        quantidade: estoqueMovimentos.quantidade,
        saldoApos: estoqueMovimentos.saldoApos,
        createdAt: estoqueMovimentos.createdAt,
        profissionalId: estoqueMovimentos.profissionalId,
        usuarioId: estoqueMovimentos.usuarioId,
        profissionalNome: profissionais.nome,
        usuarioNome: usuarios.nomeExibicao,
      })
      .from(estoqueMovimentos)
      .leftJoin(
        profissionais,
        eq(estoqueMovimentos.profissionalId, profissionais.id),
      )
      .leftJoin(usuarios, eq(estoqueMovimentos.usuarioId, usuarios.id))
      .where(eq(estoqueMovimentos.produtoId, pid))
      .orderBy(desc(estoqueMovimentos.createdAt), desc(estoqueMovimentos.id));
  }

  return rows.map((r) => {
    const tipo = String(r.tipo ?? '');
    const q = parseQuantidadeEstoque(String(r.quantidade));
    const saldoApos = parseQuantidadeEstoque(r.saldoApos);
    const entrada = isEntradaTipo(tipo);
    const anterior = entrada
      ? Math.max(0, roundQty(saldoApos - q))
      : roundQty(saldoApos + q);
    const idAt = r.idAtendimento != null ? String(r.idAtendimento).trim() : '';
    let descricao = '';
    if (tipo === 'estoque_inicial') {
      descricao = 'Lançamento de estoque inicial';
    } else if (tipo === 'entrada' && !idAt) {
      descricao = 'Entrada manual de estoque';
    } else if (tipo === 'baixa_venda') {
      descricao = idAt ? `Baixa por venda (comanda ${idAt})` : 'Baixa por venda';
    } else if (tipo === 'baixa_consumo_servico') {
      descricao = idAt
        ? `Consumo em serviço (comanda ${idAt})`
        : 'Consumo em serviço';
    } else if (tipo === 'ajuste') {
      descricao = 'Ajuste de estoque';
    }

    const nomeProf = String(r.profissionalNome ?? '').trim();
    const nomeUser = String(r.usuarioNome ?? '').trim();
    const profissional = nomeProf || nomeUser || null;

    return {
      id: r.id,
      produto_id: r.produtoId,
      id_atendimento: idAt || null,
      tipo,
      origem: rotuloOrigem(tipo),
      tipo_exibicao: entrada ? 'Entrada' : 'Saída',
      quantidade: formatEstoqueArmazenamento(q),
      saldo_anterior: formatEstoqueArmazenamento(anterior),
      saldo_apos: r.saldoApos,
      created_at:
        typeof r.createdAt === 'string'
          ? r.createdAt
          : r.createdAt instanceof Date
            ? r.createdAt.toISOString()
            : String(r.createdAt ?? ''),
      descricao,
      lote: null,
      profissional,
      profissional_id: r.profissionalId ?? null,
    };
  });
}

export type IncrementarEstoqueInput = {
  /** Delta direto na unidade de saída (ml/g/unidade). */
  adicionar?: number;
  /**
   * Frascos / unidades físicas: multiplica por `unidade_equivalente`
   * quando a unidade de saída é ml/g.
   */
  adicionar_unidades?: number;
  /** Quem registrou a entrada. */
  actor?: EstoqueMovimentoActor;
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
      if (unidadeUsaEquivalente(unidade)) {
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
      if (unidadeUsaEquivalente(unidade)) {
        delta = roundQty(a);
      } else {
        if (Math.trunc(a) !== a) {
          throw new Error('Use um número inteiro de unidades.');
        }
        delta = Math.trunc(a);
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
    const actorProf = opts.actor?.profissional_id;
    const actorUser = opts.actor?.usuario_id;
    await tx.insert(estoqueMovimentos).values({
      produtoId,
      idAtendimento: null,
      tipo: 'entrada',
      quantidade: String(delta),
      saldoApos: estoqueStr,
      profissionalId:
        actorProf != null && Number.isFinite(actorProf) && actorProf > 0
          ? Math.trunc(actorProf)
          : null,
      usuarioId:
        actorUser != null && Number.isFinite(actorUser) && actorUser > 0
          ? Math.trunc(actorUser)
          : null,
    });
    const nome = String(row.produto || '').trim();
    return { id: produtoId, produto: nome, estoque: estoqueStr };
  });
}

function textoOpcional(v: unknown): string | null {
  const s = String(v ?? '').trim();
  return s.length > 0 ? s : null;
}

/** Unidades contínuas: entrada por frasco × `unidade_equivalente`. */
const UNIDADES_MEDIDA_CONTINUA = new Set([
  'ml',
  'g',
  'l',
  'mg',
  'kg',
  'cm',
  'm',
]);

function unidadeUsaEquivalente(unidade: string): boolean {
  const u = String(unidade || 'unidade').trim().toLowerCase();
  if (u === 'gramas' || u === 'mililitros') return true;
  return UNIDADES_MEDIDA_CONTINUA.has(u);
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
  actor?: EstoqueMovimentoActor;
};

function keyNomeCatalogo(raw: string): string {
  return String(raw ?? '')
    .trim()
    .toLocaleLowerCase('pt-BR');
}

async function produtoNomeDuplicado(
  db: Db,
  nome: string,
  exceptId?: number,
): Promise<boolean> {
  const key = keyNomeCatalogo(nome);
  if (!key) return false;
  const rows = await db
    .select({ id: produtos.id, produto: produtos.produto })
    .from(produtos);
  return rows.some(
    (r) =>
      keyNomeCatalogo(r.produto) === key &&
      (exceptId == null || r.id !== exceptId),
  );
}

export async function criarProdutoApi(
  db: Db,
  input: CriarProdutoInput,
): Promise<ProdutoCatalogoApi> {
  const nome = String(input.produto ?? '').trim();
  if (!nome) throw new Error('Informe o nome do produto.');
  const categoria = textoOpcional(input.categoria);
  if (!categoria) throw new Error('Informe a categoria.');
  if (await produtoNomeDuplicado(db, nome)) {
    throw new Error('Já existe um produto com este nome.');
  }

  const unidade = textoOpcional(input.unidade) ?? 'unidade';
  const estoqueInicial = textoOpcional(input.estoque_inicial) ?? '0';
  const estoqueNum = parseQuantidadeEstoque(estoqueInicial);
  const estoqueStr = formatEstoqueArmazenamento(estoqueNum);
  const unidadeEquivalente = normalizarUnidadeEquivalente(
    input.unidade_equivalente,
    unidade,
  );

  // Sequência pode estar atrás do MAX(id) após import/restore.
  await syncSerialIdSequence('produtos');
  await syncSerialIdSequence('estoque_movimentos');

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

  // Sempre grava o lançamento inicial (mesmo com quantidade 0), para o
  // histórico de movimentações refletir a criação do produto.
  const actorProf = input.actor?.profissional_id;
  const actorUser = input.actor?.usuario_id;
  await db.insert(estoqueMovimentos).values({
    produtoId: row.id,
    idAtendimento: null,
    tipo: 'estoque_inicial',
    quantidade: String(estoqueNum),
    saldoApos: estoqueStr,
    profissionalId:
      actorProf != null && Number.isFinite(actorProf) && actorProf > 0
        ? Math.trunc(actorProf)
        : null,
    usuarioId:
      actorUser != null && Number.isFinite(actorUser) && actorUser > 0
        ? Math.trunc(actorUser)
        : null,
  });

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
  if (await produtoNomeDuplicado(db, nome, produtoId)) {
    throw new Error('Já existe um produto com este nome.');
  }

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

export async function excluirProdutoApi(
  db: Db,
  idRaw: string | number,
): Promise<{ id: number }> {
  const produtoId = Math.trunc(Number(idRaw));
  if (!Number.isFinite(produtoId) || produtoId < 1) {
    throw new Error('Produto inválido.');
  }

  const [exist] = await db
    .select({ id: produtos.id })
    .from(produtos)
    .where(eq(produtos.id, produtoId))
    .limit(1);
  if (!exist) throw new Error('Produto não encontrado.');

  const [usoReceita] = await db
    .select({ n: sql<number>`count(*)::int` })
    .from(servicoProdutosConsumidos)
    .where(eq(servicoProdutosConsumidos.produtoId, produtoId));
  if (Number(usoReceita?.n ?? 0) > 0) {
    throw new Error(
      'Não é possível excluir: este produto está vinculado a serviços.',
    );
  }

  const [usoComanda] = await db
    .select({ n: sql<number>`count(*)::int` })
    .from(atendimentoItens)
    .where(eq(atendimentoItens.produtoId, produtoId));
  if (Number(usoComanda?.n ?? 0) > 0) {
    throw new Error(
      'Não é possível excluir: este produto já foi usado em comandas.',
    );
  }

  await db
    .delete(estoqueMovimentos)
    .where(eq(estoqueMovimentos.produtoId, produtoId));
  await db.delete(produtos).where(eq(produtos.id, produtoId));
  return { id: produtoId };
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
