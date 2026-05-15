/**
 * Domínio de pagamentos da comanda (sub-drawer Faturar).
 *
 * Modelo:
 * - 1 linha em `comanda_pagamentos` por evento de pagamento (parcial ou total).
 * - 1 movimentação financeira (`receita`) ligada por FK para cada pagamento **com caixa**
 *   (método diferente de `pendente`).
 * - Status da comanda derivado por SUM(valor): pago / parcial / pendente.
 *
 * NÃO usa o índice único `movimentacoes_confirm_receita_id_at_idx` (que
 * limita 1 receita por `id_atendimento` com origem `atendimento_confirmacao`).
 * Origem nova: `comanda_pagamento`.
 */
import { and, asc, eq, inArray, sql } from 'drizzle-orm';
import { db } from '../db';
import type { Db } from '../db';
import {
  atendimentoItens,
  atendimentos,
  clientes,
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
  | 'outros'
  | 'pendente';

const METODOS: ReadonlySet<MetodoPagamentoComanda> = new Set<
  MetodoPagamentoComanda
>([
  'dinheiro',
  'cartao_credito',
  'cartao_debito',
  'pix',
  'transferencia',
  'outros',
  'pendente',
]);

const ROTULOS_METODO: Record<MetodoPagamentoComanda, string> = {
  dinheiro: 'Dinheiro',
  cartao_credito: 'Cartão de crédito',
  cartao_debito: 'Cartão de débito',
  pix: 'Pix',
  transferencia: 'Transferência',
  outros: 'Outros',
  pendente: 'Pendente',
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

interface ItemLinhaResumo {
  /** Numero (NUMERIC) ou null. */
  valorUnitario: string | number | null;
  /** Numero (NUMERIC) ou null. */
  desconto: string | number | null;
  quantidade: number | null;
}

/**
 * Soma de itens da pivot `atendimento_itens`. Quando NENHUM item tem `valor_unitario`,
 * devolve `null` (sinal para o caller cair no cálculo legado por `atendimentos`).
 */
function calcularTotaisDeItens(rows: ItemLinhaResumo[]): {
  total_bruto: number;
  desconto: number;
  total: number;
} | null {
  let bruto = 0;
  let desc = 0;
  let temValor = false;
  for (const r of rows) {
    const v =
      r.valorUnitario === null || r.valorUnitario === undefined
        ? null
        : Number(r.valorUnitario);
    if (v !== null && Number.isFinite(v)) {
      temValor = true;
      const q = Number(r.quantidade ?? 0);
      bruto += v * (Number.isFinite(q) ? q : 0);
    }
    const d =
      r.desconto === null || r.desconto === undefined
        ? null
        : Number(r.desconto);
    if (d !== null && Number.isFinite(d) && d > 0) {
      desc += d;
    }
  }
  if (!temValor) return null;
  const total = Math.max(0, bruto - desc);
  return {
    total_bruto: Math.round(bruto * 100) / 100,
    desconto: Math.round(desc * 100) / 100,
    total: Math.round(total * 100) / 100,
  };
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
 * Pagamento com método `pendente` entra no SUM de `total_pago`, mas não é receita;
 * o status derivado não pode ser `pago` quando ainda há dívida pendente.
 */
function statusComOverridePendente(
  status: StatusCobrancaDerivado,
  cobrancaStatus: string | null,
  hasPendente: boolean,
): StatusCobrancaDerivado {
  const cs = String(cobrancaStatus ?? '').trim().toLowerCase();
  if (hasPendente && cs === 'finalizada') return 'pendente';
  return status;
}

async function idsComPagamentoPendente(
  db: Db,
  ids: string[],
): Promise<Set<string>> {
  const lista = Array.from(
    new Set(ids.map((s) => String(s || '').trim()).filter((s) => s.length > 0)),
  );
  const out = new Set<string>();
  if (lista.length === 0) return out;
  const rows = await db
    .select({ idAtendimento: comandaPagamentos.idAtendimento })
    .from(comandaPagamentos)
    .where(
      and(
        inArray(comandaPagamentos.idAtendimento, lista),
        eq(comandaPagamentos.metodo, 'pendente'),
      ),
    )
    .groupBy(comandaPagamentos.idAtendimento);
  for (const r of rows) {
    const k = String(r.idAtendimento || '').trim();
    if (k) out.add(k);
  }
  return out;
}

/**
 * A pivot `atendimento_itens` pode cobrir só parte do que está em `atendimentos`
 * (ex.: Mega/Pacote sem `valor_unitario`, linhas antigas, ajustes só na planilha).
 * Nesse caso o total pela pivot fica **abaixo** do somatório real das linhas — a UI
 * da comanda usa as linhas (`faixaPrecoBloc`); alinhamos ao legado quando for maior.
 */
function mesclarTotaisPivotELegado(
  totaisItens: { total_bruto: number; desconto: number; total: number } | null,
  legacy: {
    total_bruto: number;
    desconto: number;
    total: number;
    cobranca_status: string | null;
  },
): {
  total_bruto: number;
  desconto: number;
  total: number;
  cobranca_status: string | null;
} {
  if (!totaisItens) {
    return legacy;
  }
  if (legacy.total > totaisItens.total + 0.005) {
    return legacy;
  }
  /**
   * `atendimentos.desconto` (1.ª linha) pode espelhar o mesmo valor já somado na pivot,
   * ou ser desconto «Na comanda» extra / total do pedido. Não somar cegamente pivot+legacy.
   */
  const p = totaisItens.desconto;
  const l = legacy.desconto;
  let descontoMerged: number;
  if (p <= 0.005) {
    descontoMerged = l;
  } else if (l <= 0.005) {
    descontoMerged = p;
  } else if (Math.abs(l - p) <= 0.005) {
    descontoMerged = p;
  } else if (l > p) {
    descontoMerged = l;
  } else {
    descontoMerged = p + l;
  }
  descontoMerged = Math.round(descontoMerged * 100) / 100;
  const totalMerged = Math.max(
    0,
    Math.round((totaisItens.total_bruto - descontoMerged) * 100) / 100,
  );
  return {
    total_bruto: totaisItens.total_bruto,
    desconto: descontoMerged,
    total: totalMerged,
    cobranca_status: legacy.cobranca_status,
  };
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

  const itens = await db
    .select({
      valorUnitario: atendimentoItens.valorUnitario,
      desconto: atendimentoItens.desconto,
      quantidade: atendimentoItens.quantidade,
    })
    .from(atendimentoItens)
    .where(eq(atendimentoItens.idAtendimento, id));

  const totaisItens = calcularTotaisDeItens(itens as ItemLinhaResumo[]);
  const legacy = calcularTotaisDeLinhas(linhas as AtendLinhaResumo[]);
  const { total_bruto, desconto, total, cobranca_status } =
    mesclarTotaisPivotELegado(totaisItens, legacy);

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
  const pendenteIds = await idsComPagamentoPendente(db, [id]);
  const status = statusComOverridePendente(
    statusDerivado(total, totalPago, cobranca_status),
    cobranca_status,
    pendenteIds.has(id),
  );

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

  const itensRows = await db
    .select({
      idAtendimento: atendimentoItens.idAtendimento,
      valorUnitario: atendimentoItens.valorUnitario,
      desconto: atendimentoItens.desconto,
      quantidade: atendimentoItens.quantidade,
    })
    .from(atendimentoItens)
    .where(inArray(atendimentoItens.idAtendimento, lista));

  const itensPorId = new Map<string, ItemLinhaResumo[]>();
  for (const r of itensRows) {
    const k = String(r.idAtendimento || '').trim();
    const arr = itensPorId.get(k) ?? [];
    arr.push({
      valorUnitario: r.valorUnitario,
      desconto: r.desconto,
      quantidade: r.quantidade,
    });
    itensPorId.set(k, arr);
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

  const pendenteIds = await idsComPagamentoPendente(db, lista);

  for (const id of lista) {
    const rows = linhasPorId.get(id) ?? [];
    const itens = itensPorId.get(id) ?? [];
    const totaisItens = calcularTotaisDeItens(itens);
    const legacy = calcularTotaisDeLinhas(rows);
    const { total_bruto, desconto, total, cobranca_status } =
      mesclarTotaisPivotELegado(totaisItens, legacy);
    const totalPago = pagosMap.get(id) ?? 0;
    const saldo = Math.max(0, Math.round((total - totalPago) * 100) / 100);
    out.set(id, {
      total_bruto,
      desconto,
      total,
      total_pago: totalPago,
      saldo,
      status: statusComOverridePendente(
        statusDerivado(total, totalPago, cobranca_status),
        cobranca_status,
        pendenteIds.has(id),
      ),
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

function prepararInputPagamentoComanda(
  input: CriarPagamentoComandaInput,
): {
  metodo: MetodoPagamentoComanda;
  valor: number;
  valorStr: string;
  parcelas: number;
  trocoStr: string | null;
  dataPagamento: string;
  observacao: string | null;
} {
  const metodoRaw = String(input.metodo ?? '').trim().toLowerCase();
  if (!METODOS.has(metodoRaw as MetodoPagamentoComanda)) {
    throw new Error(
      'Método inválido. Use dinheiro, cartao_credito, cartao_debito, pix, transferencia, outros ou pendente.',
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

  return {
    metodo,
    valor,
    valorStr,
    parcelas,
    trocoStr,
    dataPagamento,
    observacao,
  };
}

type DbLike = Pick<
  typeof db,
  'select' | 'insert' | 'delete' | 'update' | 'transaction'
>;

/**
 * Insere uma linha em `comanda_pagamentos` (e receita em `movimentacoes`, exceto método `pendente`).
 * Usado dentro de `db.transaction`.
 */
export async function inserirPagamentoComandaEmTx(
  tx: DbLike,
  idAtendimento: string,
  input: CriarPagamentoComandaInput,
): Promise<(typeof comandaPagamentos.$inferSelect)> {
  const id = String(idAtendimento || '').trim();
  if (!id) throw new Error('id_atendimento é obrigatório');

  const prep = prepararInputPagamentoComanda(input);
  const {
    metodo,
    valorStr,
    parcelas,
    trocoStr,
    dataPagamento,
    observacao,
  } = prep;

  const linhas = await tx
    .select()
    .from(atendimentos)
    .where(eq(atendimentos.idAtendimento, id))
    .orderBy(asc(atendimentos.id));
  if (linhas.length === 0) {
    throw new Error('Atendimento não encontrado para este id.');
  }

  let movimentacaoId: number | null = null;

  if (metodo !== 'pendente') {
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
    movimentacaoId = movIns?.id ?? null;
  }

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
  return pagIns;
}

/**
 * Abate `clientes.credito_saldo` e regista pagamento na comanda (método `outros`).
 */
export async function usarCreditoClienteNaComandaEmTx(
  tx: DbLike,
  idAtendimento: string,
  idCliente: string,
  valor: number,
): Promise<void> {
  const idAt = String(idAtendimento || '').trim();
  const cid = String(idCliente || '').trim();
  if (!idAt || !cid) {
    throw new Error('id_atendimento e id_cliente são obrigatórios.');
  }
  const v = Math.round(Number(valor) * 100) / 100;
  if (!Number.isFinite(v) || v <= 0) {
    throw new Error('Valor de crédito a usar deve ser maior que zero.');
  }

  const [cli] = await tx
    .select({ saldo: clientes.creditoSaldo })
    .from(clientes)
    .where(eq(clientes.idCliente, cid))
    .limit(1);
  const saldoAtual =
    Math.round((parseFloat(String(cli?.saldo ?? '0')) || 0) * 100) / 100;
  if (saldoAtual + 0.0001 < v) {
    throw new Error(
      `Saldo de crédito insuficiente (disponível ${saldoAtual.toFixed(2)}).`,
    );
  }

  const resumo = await getResumoComanda(tx as unknown as Db, idAt);
  if (v - 0.0001 > resumo.saldo) {
    throw new Error(
      'O crédito a usar não pode ser maior que o saldo em aberto da comanda.',
    );
  }

  await inserirPagamentoComandaEmTx(tx, idAt, {
    valor: v,
    metodo: 'outros',
    parcelas: 1,
    observacao: 'Crédito do cliente',
    data_pagamento: ymdHoje(),
  });

  await tx
    .update(clientes)
    .set({
      creditoSaldo: sql`GREATEST(0::numeric, ${clientes.creditoSaldo}::numeric - ${v.toFixed(2)}::numeric)`,
    })
    .where(eq(clientes.idCliente, cid));
}

/**
 * Receita sem linha em `comanda_pagamentos`; incrementa `clientes.credito_saldo`.
 * Não aceita método `pendente`.
 */
export async function aplicarCreditoClientePorExcessoEmTx(
  tx: DbLike,
  idAtendimento: string,
  idCliente: string,
  input: CriarPagamentoComandaInput,
): Promise<void> {
  const idAt = String(idAtendimento || '').trim();
  const cid = String(idCliente || '').trim();
  if (!idAt || !cid) {
    throw new Error('id_atendimento e id_cliente são obrigatórios.');
  }

  const prep = prepararInputPagamentoComanda(input);
  if (prep.metodo === 'pendente') {
    throw new Error(
      'O método «pendente» não pode ser usado para crédito de cliente.',
    );
  }

  const linhas = await tx
    .select()
    .from(atendimentos)
    .where(eq(atendimentos.idAtendimento, idAt))
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
    ? `Crédito cliente (excesso de pagamento) — ${nomeCliente}`
    : 'Crédito cliente (excesso de pagamento)';

  await tx.insert(movimentacoes).values({
    dataMov: prep.dataPagamento,
    natureza: 'receita',
    valor: prep.valorStr,
    categoriaId,
    descricao: descricaoMov,
    idAtendimento: idAt,
    metodoPagamento: rotuloMetodoComanda(prep.metodo),
    origem: ORIGEM_COMANDA_PAGAMENTO,
  });

  await tx
    .update(clientes)
    .set({
      creditoSaldo: sql`${clientes.creditoSaldo}::numeric + ${prep.valor}::numeric`,
    })
    .where(eq(clientes.idCliente, cid));
}

/**
 * Alinha `atendimentos.pagamento_status` com o resumo e com linhas `pendente` (dívida).
 */
export async function sincronizarPagamentoStatusAtendimento(
  db: Db,
  idAtendimento: string,
): Promise<void> {
  const id = String(idAtendimento || '').trim();
  if (!id) return;

  const [pendRow] = await db
    .select({ id: comandaPagamentos.id })
    .from(comandaPagamentos)
    .where(
      and(
        eq(comandaPagamentos.idAtendimento, id),
        eq(comandaPagamentos.metodo, 'pendente'),
      ),
    )
    .limit(1);
  const hasPendente = pendRow != null;

  const resumo = await getResumoComanda(db, id);

  const [linha] = await db
    .select({ cobrancaStatus: atendimentos.cobrancaStatus })
    .from(atendimentos)
    .where(eq(atendimentos.idAtendimento, id))
    .limit(1);
  const finalizada =
    String(linha?.cobrancaStatus ?? '').trim().toLowerCase() === 'finalizada';
  if (!finalizada) return;

  let pagamentoStatus: string;
  if (hasPendente) {
    pagamentoStatus = 'pendente';
  } else if (resumo.status === 'pago') {
    pagamentoStatus = 'confirmado';
  } else if (resumo.total_pago > 0) {
    pagamentoStatus = 'parcial';
  } else {
    pagamentoStatus = 'pendente';
  }

  await db
    .update(atendimentos)
    .set({ pagamentoStatus })
    .where(
      and(
        eq(atendimentos.idAtendimento, id),
        eq(atendimentos.cobrancaStatus, 'finalizada'),
      ),
    );
}

/**
 * Cria 1 pagamento da comanda + a movimentação financeira correspondente
 * (exceto método `pendente`, sem movimentação).
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

  const result = await db.transaction(async (tx) => {
    const pagamentoRow = await inserirPagamentoComandaEmTx(tx, id, input);
    return { pagamentoRow };
  });

  const resumo = await getResumoComanda(db, id);
  await sincronizarPagamentoStatusAtendimento(db, id);
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
    await sincronizarPagamentoStatusAtendimento(db, idAtendimento);
    await recalcularFolhaAposMudancaAtendimento(db, idAtendimento).catch(() => {});
  }

  return { idAtendimento };
}

