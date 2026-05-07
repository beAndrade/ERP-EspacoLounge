/**
 * Domínio de pagamentos da comanda (sub-drawer Faturar).
 *
 * Modelo:
 * - 1 linha em `comanda_pagamentos` por evento de pagamento (parcial ou total).
 * - 1 movimentação financeira (`receita`) ligada por FK para garantir que o
 *   razão financeiro espelha cada parcial.
 * - Status da comanda derivado por SUM(valor): pago / parcial / pendente.
 *
 * NÃO usa o índice único `movimentacoes_confirm_receita_id_at_idx` (que
 * limita 1 receita por `id_atendimento` com origem `atendimento_confirmacao`).
 * Origem nova: `comanda_pagamento`.
 */
import { and, asc, eq, inArray, sql } from 'drizzle-orm';
import type { Db } from '../db';
import {
  atendimentos,
  comandaPagamentos,
  movimentacoes,
} from '../db/schema';
import {
  getCategoriaIdPorSlug,
  slugCategoriaReceitaPredominante,
  toNumberPt,
} from './finance-domain';
import { recalcularFolhaAposMudancaAtendimento } from './folha-domain';

export const ORIGEM_COMANDA_PAGAMENTO = 'comanda_pagamento';

export type MetodoPagamentoComanda =
  | 'dinheiro'
  | 'cartao_credito'
  | 'cartao_debito'
  | 'pix'
  | 'transferencia'
  | 'outros';

const METODOS: ReadonlySet<MetodoPagamentoComanda> = new Set<
  MetodoPagamentoComanda
>([
  'dinheiro',
  'cartao_credito',
  'cartao_debito',
  'pix',
  'transferencia',
  'outros',
]);

const ROTULOS_METODO: Record<MetodoPagamentoComanda, string> = {
  dinheiro: 'Dinheiro',
  cartao_credito: 'Cartão de crédito',
  cartao_debito: 'Cartão de débito',
  pix: 'Pix',
  transferencia: 'Transferência',
  outros: 'Outros',
};

export function rotuloMetodoComanda(m: MetodoPagamentoComanda): string {
  return ROTULOS_METODO[m] ?? 'Outros';
}

export type StatusCobrancaDerivado = 'aberto' | 'pendente' | 'parcial' | 'pago';

export interface ResumoComanda {
  /** Soma dos valores brutos das linhas (antes do desconto). */
  total_bruto: number;
  /** Desconto aplicado (em reais). */
  desconto: number;
  /** Total a pagar = total_bruto − desconto (mín. 0). */
  total: number;
  /** Soma de `comanda_pagamentos.valor` para o pedido. */
  total_pago: number;
  /** total − total_pago (mín. 0). */
  saldo: number;
  /** Estado para a UI: aberto / pendente / parcial / pago. */
  status: StatusCobrancaDerivado;
  /** Status legado (`atendimentos.cobranca_status`). */
  cobranca_status: string | null;
}

interface AtendLinhaResumo {
  tipo: string | null;
  valor: string | null;
  valorManual: string | null;
  desconto: string | null;
  data: string | Date | null;
  cobrancaStatus: string | null;
}

function calcularTotaisDeLinhas(rows: AtendLinhaResumo[]): {
  total_bruto: number;
  desconto: number;
  total: number;
  cobranca_status: string | null;
} {
  let bruto = 0;
  for (const r of rows) {
    const raw =
      r.valorManual != null && String(r.valorManual).trim()
        ? r.valorManual
        : r.valor;
    const v = toNumberPt(raw);
    if (v !== null) bruto += v;
  }
  const d = rows[0] ? toNumberPt(rows[0].desconto) : null;
  const desconto = d != null && d > 0 ? d : 0;
  const total = Math.max(0, bruto - desconto);
  return {
    total_bruto: Math.round(bruto * 100) / 100,
    desconto: Math.round(desconto * 100) / 100,
    total: Math.round(total * 100) / 100,
    cobranca_status: rows[0]?.cobrancaStatus ?? null,
  };
}

function statusDerivado(
  total: number,
  totalPago: number,
  cobrancaStatus: string | null,
): StatusCobrancaDerivado {
  const cs = String(cobrancaStatus ?? '').trim().toLowerCase();
  if (cs !== 'finalizada' && totalPago <= 0) return 'aberto';
  if (totalPago <= 0) return 'pendente';
  if (totalPago + 0.005 < total) return 'parcial';
  return 'pago';
}

/**
 * Resumo financeiro consolidado de UMA comanda (`id_atendimento`).
 * Quando o atendimento não existe, devolve totais zerados e status `aberto`.
 */
export async function getResumoComanda(
  db: Db,
  idAtendimento: string,
): Promise<ResumoComanda> {
  const id = String(idAtendimento || '').trim();
  if (!id) {
    return {
      total_bruto: 0,
      desconto: 0,
      total: 0,
      total_pago: 0,
      saldo: 0,
      status: 'aberto',
      cobranca_status: null,
    };
  }
  const linhas = await db
    .select({
      tipo: atendimentos.tipo,
      valor: atendimentos.valor,
      valorManual: atendimentos.valorManual,
      desconto: atendimentos.desconto,
      data: atendimentos.data,
      cobrancaStatus: atendimentos.cobrancaStatus,
    })
    .from(atendimentos)
    .where(eq(atendimentos.idAtendimento, id));

  const { total_bruto, desconto, total, cobranca_status } =
    calcularTotaisDeLinhas(linhas as AtendLinhaResumo[]);

  const [agg] = await db
    .select({
      total_pago: sql<string>`coalesce(sum(${comandaPagamentos.valor}::numeric), 0)`,
    })
    .from(comandaPagamentos)
    .where(eq(comandaPagamentos.idAtendimento, id));

  const totalPago = Math.round(
    (parseFloat(String(agg?.total_pago ?? '0')) || 0) * 100,
  ) / 100;
  const saldo = Math.max(0, Math.round((total - totalPago) * 100) / 100);
  const status = statusDerivado(total, totalPago, cobranca_status);

  return {
    total_bruto,
    desconto,
    total,
    total_pago: totalPago,
    saldo,
    status,
    cobranca_status,
  };
}

/**
 * Versão batch: dado um conjunto de `id_atendimento`, devolve um Map
 * `id → ResumoComanda` para uso em listagens (evita N+1).
 */
export async function getResumosPorAtendimento(
  db: Db,
  ids: string[],
): Promise<Map<string, ResumoComanda>> {
  const out = new Map<string, ResumoComanda>();
  const lista = Array.from(
    new Set(
      ids
        .map((s) => String(s || '').trim())
        .filter((s) => s.length > 0),
    ),
  );
  if (lista.length === 0) return out;

  const linhas = await db
    .select({
      idAtendimento: atendimentos.idAtendimento,
      tipo: atendimentos.tipo,
      valor: atendimentos.valor,
      valorManual: atendimentos.valorManual,
      desconto: atendimentos.desconto,
      data: atendimentos.data,
      cobrancaStatus: atendimentos.cobrancaStatus,
    })
    .from(atendimentos)
    .where(inArray(atendimentos.idAtendimento, lista));

  const linhasPorId = new Map<string, AtendLinhaResumo[]>();
  for (const r of linhas) {
    const k = String(r.idAtendimento || '').trim();
    const arr = linhasPorId.get(k) ?? [];
    arr.push(r as AtendLinhaResumo);
    linhasPorId.set(k, arr);
  }

  const pagosRows = await db
    .select({
      idAtendimento: comandaPagamentos.idAtendimento,
      total_pago: sql<string>`coalesce(sum(${comandaPagamentos.valor}::numeric), 0)`,
    })
    .from(comandaPagamentos)
    .where(inArray(comandaPagamentos.idAtendimento, lista))
    .groupBy(comandaPagamentos.idAtendimento);

  const pagosMap = new Map<string, number>();
  for (const r of pagosRows) {
    pagosMap.set(
      String(r.idAtendimento || '').trim(),
      Math.round((parseFloat(String(r.total_pago ?? '0')) || 0) * 100) / 100,
    );
  }

  for (const id of lista) {
    const rows = linhasPorId.get(id) ?? [];
    const { total_bruto, desconto, total, cobranca_status } =
      calcularTotaisDeLinhas(rows);
    const totalPago = pagosMap.get(id) ?? 0;
    const saldo = Math.max(0, Math.round((total - totalPago) * 100) / 100);
    out.set(id, {
      total_bruto,
      desconto,
      total,
      total_pago: totalPago,
      saldo,
      status: statusDerivado(total, totalPago, cobranca_status),
      cobranca_status,
    });
  }

  return out;
}

export interface PagamentoComandaDTO {
  id: number;
  id_atendimento: string;
  data_pagamento: string;
  valor: string;
  metodo: MetodoPagamentoComanda;
  metodo_rotulo: string;
  parcelas: number;
  troco: string | null;
  observacao: string | null;
  movimentacao_id: number | null;
  created_at: string;
}

function rowParaDto(row: {
  id: number;
  idAtendimento: string;
  dataPagamento: string;
  valor: string;
  metodo: MetodoPagamentoComanda;
  parcelas: number;
  troco: string | null;
  observacao: string | null;
  movimentacaoId: number | null;
  createdAt: Date | string;
}): PagamentoComandaDTO {
  return {
    id: row.id,
    id_atendimento: row.idAtendimento,
    data_pagamento: String(row.dataPagamento ?? '').slice(0, 10),
    valor: String(row.valor ?? '0'),
    metodo: row.metodo,
    metodo_rotulo: rotuloMetodoComanda(row.metodo),
    parcelas: Number(row.parcelas ?? 1),
    troco: row.troco != null ? String(row.troco) : null,
    observacao: row.observacao ?? null,
    movimentacao_id: row.movimentacaoId ?? null,
    created_at:
      row.createdAt instanceof Date
        ? row.createdAt.toISOString()
        : String(row.createdAt ?? ''),
  };
}

export async function listarPagamentosPorAtendimento(
  db: Db,
  idAtendimento: string,
): Promise<PagamentoComandaDTO[]> {
  const id = String(idAtendimento || '').trim();
  if (!id) return [];
  const rows = await db
    .select()
    .from(comandaPagamentos)
    .where(eq(comandaPagamentos.idAtendimento, id))
    .orderBy(asc(comandaPagamentos.dataPagamento), asc(comandaPagamentos.id));
  return rows.map(rowParaDto);
}

export interface CriarPagamentoComandaInput {
  data_pagamento?: string;
  valor: number | string;
  metodo: string;
  parcelas?: number;
  troco?: number | string | null;
  observacao?: string | null;
}

function ymdHoje(): string {
  const n = new Date();
  const m = n.getMonth() + 1;
  const d = n.getDate();
  return `${n.getFullYear()}-${m < 10 ? `0${m}` : m}-${d < 10 ? `0${d}` : d}`;
}

function normalizarYmd(s: unknown): string | null {
  const t = String(s ?? '').trim().slice(0, 10);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(t)) return null;
  return t;
}

/**
 * Cria 1 pagamento da comanda + a movimentação financeira correspondente.
 * Recalcula folha caso o status do atendimento mude para `pago`.
 */
export async function criarPagamentoComanda(
  db: Db,
  idAtendimento: string,
  input: CriarPagamentoComandaInput,
): Promise<{
  pagamento: PagamentoComandaDTO;
  resumo: ResumoComanda;
}> {
  const id = String(idAtendimento || '').trim();
  if (!id) throw new Error('id_atendimento é obrigatório');

  const metodoRaw = String(input.metodo ?? '').trim().toLowerCase();
  if (!METODOS.has(metodoRaw as MetodoPagamentoComanda)) {
    throw new Error(
      'Método inválido. Use dinheiro, cartao_credito, cartao_debito, pix, transferencia ou outros.',
    );
  }
  const metodo = metodoRaw as MetodoPagamentoComanda;

  const valorNum = toNumberPt(input.valor);
  if (valorNum === null || !Number.isFinite(valorNum) || valorNum <= 0) {
    throw new Error('Valor do pagamento deve ser maior que zero.');
  }
  const valor = Math.round(valorNum * 100) / 100;
  const valorStr = valor.toFixed(2);

  const parcelas = Math.max(
    1,
    Math.floor(Number(input.parcelas ?? 1) || 1),
  );

  const trocoNum =
    input.troco == null || String(input.troco).trim() === ''
      ? null
      : toNumberPt(input.troco);
  const trocoStr =
    trocoNum != null && trocoNum > 0
      ? (Math.round(trocoNum * 100) / 100).toFixed(2)
      : null;

  const dataPagamento = normalizarYmd(input.data_pagamento) ?? ymdHoje();
  const observacao =
    input.observacao != null && String(input.observacao).trim()
      ? String(input.observacao).trim()
      : null;

  const result = await db.transaction(async (tx) => {
    const linhas = await tx
      .select()
      .from(atendimentos)
      .where(eq(atendimentos.idAtendimento, id))
      .orderBy(asc(atendimentos.id));
    if (linhas.length === 0) {
      throw new Error('Atendimento não encontrado para este id.');
    }

    const slug = slugCategoriaReceitaPredominante(linhas);
    const categoriaId = await getCategoriaIdPorSlug(
      tx as unknown as Db,
      slug,
    );
    const nomeCliente = String(linhas[0]?.nomeCliente ?? '').trim();
    const descricaoMov = nomeCliente
      ? `Pagamento comanda — ${nomeCliente}`
      : 'Pagamento comanda';

    const [movIns] = await tx
      .insert(movimentacoes)
      .values({
        dataMov: dataPagamento,
        natureza: 'receita',
        valor: valorStr,
        categoriaId,
        descricao: descricaoMov,
        idAtendimento: id,
        metodoPagamento: rotuloMetodoComanda(metodo),
        origem: ORIGEM_COMANDA_PAGAMENTO,
      })
      .returning({ id: movimentacoes.id });
    const movimentacaoId = movIns?.id ?? null;

    const [pagIns] = await tx
      .insert(comandaPagamentos)
      .values({
        idAtendimento: id,
        dataPagamento,
        valor: valorStr,
        metodo,
        parcelas,
        troco: trocoStr,
        observacao,
        movimentacaoId,
      })
      .returning();
    if (!pagIns) throw new Error('Falha ao gravar pagamento da comanda.');

    return { pagamentoRow: pagIns };
  });

  const resumo = await getResumoComanda(db, id);

  if (resumo.status === 'pago') {
    await db
      .update(atendimentos)
      .set({ pagamentoStatus: 'confirmado' })
      .where(
        and(
          eq(atendimentos.idAtendimento, id),
          eq(atendimentos.cobrancaStatus, 'finalizada'),
        ),
      );
  } else if (resumo.total_pago > 0) {
    await db
      .update(atendimentos)
      .set({ pagamentoStatus: 'parcial' })
      .where(eq(atendimentos.idAtendimento, id));
  }

  await recalcularFolhaAposMudancaAtendimento(db, id).catch(() => {});

  return {
    pagamento: rowParaDto(result.pagamentoRow),
    resumo,
  };
}

/**
 * Remove um pagamento e sua movimentação. O `ON DELETE SET NULL` da FK
 * preserva a integridade caso a movimentação tenha sido apagada por outro caminho.
 */
export async function excluirPagamentoComanda(
  db: Db,
  pagamentoId: number,
): Promise<{ idAtendimento: string | null }> {
  if (!Number.isFinite(pagamentoId) || pagamentoId <= 0) {
    throw new Error('id de pagamento inválido');
  }

  const idAtendimento = await db.transaction(async (tx) => {
    const [row] = await tx
      .select()
      .from(comandaPagamentos)
      .where(eq(comandaPagamentos.id, pagamentoId))
      .limit(1);
    if (!row) return null;

    if (row.movimentacaoId != null) {
      await tx
        .delete(movimentacoes)
        .where(eq(movimentacoes.id, row.movimentacaoId));
    }
    await tx
      .delete(comandaPagamentos)
      .where(eq(comandaPagamentos.id, pagamentoId));
    return String(row.idAtendimento || '').trim() || null;
  });

  if (idAtendimento) {
    const resumo = await getResumoComanda(db, idAtendimento);
    if (resumo.status === 'pago') {
      await db
        .update(atendimentos)
        .set({ pagamentoStatus: 'confirmado' })
        .where(
          and(
            eq(atendimentos.idAtendimento, idAtendimento),
            eq(atendimentos.cobrancaStatus, 'finalizada'),
          ),
        );
    } else if (resumo.total_pago > 0) {
      await db
        .update(atendimentos)
        .set({ pagamentoStatus: 'parcial' })
        .where(eq(atendimentos.idAtendimento, idAtendimento));
    } else {
      await db
        .update(atendimentos)
        .set({ pagamentoStatus: 'pendente' })
        .where(
          and(
            eq(atendimentos.idAtendimento, idAtendimento),
            eq(atendimentos.cobrancaStatus, 'finalizada'),
          ),
        );
    }
    await recalcularFolhaAposMudancaAtendimento(db, idAtendimento).catch(() => {});
  }

  return { idAtendimento };
}

