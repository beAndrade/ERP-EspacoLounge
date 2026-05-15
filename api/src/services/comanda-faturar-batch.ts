import type { Db } from '../db';
import { finalizarCobrancaPorIdAtendimento } from './atendimentos-domain';
import {
  aplicarCreditoClientePorExcessoEmTx,
  getResumoComanda,
  inserirPagamentoComandaEmTx,
  listarPagamentosPorAtendimento,
  sincronizarPagamentoStatusAtendimento,
  type CriarPagamentoComandaInput,
  type PagamentoComandaDTO,
  type ResumoComanda,
} from './comanda-pagamentos-domain';
import { toNumberPt } from './finance-domain';
import { recalcularFolhaAposMudancaAtendimento } from './folha-domain';
import { eq } from 'drizzle-orm';
import { atendimentos } from '../db/schema';

const EPS = 0.02;

function somaValoresPagamentos(list: CriarPagamentoComandaInput[]): number {
  let s = 0;
  for (const p of list) {
    const v = toNumberPt(p.valor);
    if (v == null || !Number.isFinite(v) || v <= 0) {
      throw new Error('Cada pagamento da comanda deve ter valor maior que zero.');
    }
    s += Math.round(v * 100) / 100;
  }
  return Math.round(s * 100) / 100;
}

export interface FaturarComandaComRascunhoInput {
  pagamentos: CriarPagamentoComandaInput[];
  /** Valores pagos a mais que viram saldo em `clientes.credito_saldo` (sem `comanda_pagamentos`). */
  credito_excesso?: CriarPagamentoComandaInput[];
  /** Passado a `finalizarCobrancaPorIdAtendimento` quando a cobrança ainda não está finalizada. */
  desconto?: unknown;
}

/**
 * Grava N pagamentos da comanda numa transação, finaliza a cobrança se necessário
 * e sincroniza `pagamento_status` (inclui regra «há linha pendente»).
 * Opcionalmente aplica `credito_excesso` na mesma transação (comanda já quitada).
 */
export async function faturarComandaComRascunho(
  db: Db,
  idAtendimento: string,
  input: FaturarComandaComRascunhoInput,
): Promise<{ items: PagamentoComandaDTO[]; resumo: ResumoComanda }> {
  const id = String(idAtendimento || '').trim();
  if (!id) throw new Error('id_atendimento é obrigatório');
  const list = input.pagamentos ?? [];
  const creditos = input.credito_excesso ?? [];
  if (list.length === 0 && creditos.length === 0) {
    throw new Error('Informe pelo menos um pagamento ou crédito de cliente para faturar.');
  }

  const resumoAntes = await getResumoComanda(db, id);
  const sumComanda = somaValoresPagamentos(list);
  const totalPagoAposComanda =
    Math.round((resumoAntes.total_pago + sumComanda) * 100) / 100;

  if (creditos.length > 0) {
    if (totalPagoAposComanda + EPS < resumoAntes.total) {
      throw new Error(
        'Para registar crédito de cliente, a comanda deve estar quitada (total pago ≥ total).',
      );
    }
    somaValoresPagamentos(creditos);
  }

  const [atRow] = await db
    .select({ idCliente: atendimentos.idCliente })
    .from(atendimentos)
    .where(eq(atendimentos.idAtendimento, id))
    .limit(1);
  const idCliente = String(atRow?.idCliente ?? '').trim();
  if (!idCliente) {
    throw new Error('Cliente não encontrado para este atendimento.');
  }

  await db.transaction(async (tx) => {
    for (const p of list) {
      await inserirPagamentoComandaEmTx(tx, id, p);
    }
    for (const c of creditos) {
      await aplicarCreditoClientePorExcessoEmTx(tx, id, idCliente, c);
    }
  });

  const [st] = await db
    .select({ cs: atendimentos.cobrancaStatus })
    .from(atendimentos)
    .where(eq(atendimentos.idAtendimento, id))
    .limit(1);
  const jáFinal =
    String(st?.cs ?? '').trim().toLowerCase() === 'finalizada';

  if (!jáFinal) {
    await finalizarCobrancaPorIdAtendimento(
      db,
      id,
      input.desconto ?? undefined,
    );
  }

  await sincronizarPagamentoStatusAtendimento(db, id);
  await recalcularFolhaAposMudancaAtendimento(db, id).catch(() => {});

  const items = await listarPagamentosPorAtendimento(db, id);
  const resumo = await getResumoComanda(db, id);
  return { items, resumo };
}
