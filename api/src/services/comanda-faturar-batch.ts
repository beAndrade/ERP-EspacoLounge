import type { Db } from '../db';
import { finalizarCobrancaPorIdAtendimento } from './atendimentos-domain';
import {
  getResumoComanda,
  inserirPagamentoComandaEmTx,
  listarPagamentosPorAtendimento,
  sincronizarPagamentoStatusAtendimento,
  type CriarPagamentoComandaInput,
  type PagamentoComandaDTO,
  type ResumoComanda,
} from './comanda-pagamentos-domain';
import { recalcularFolhaAposMudancaAtendimento } from './folha-domain';
import { eq } from 'drizzle-orm';
import { atendimentos } from '../db/schema';

export interface FaturarComandaComRascunhoInput {
  pagamentos: CriarPagamentoComandaInput[];
  /** Passado a `finalizarCobrancaPorIdAtendimento` quando a cobrança ainda não está finalizada. */
  desconto?: unknown;
}

/**
 * Grava N pagamentos da comanda numa transação, finaliza a cobrança se necessário
 * e sincroniza `pagamento_status` (inclui regra «há linha pendente»).
 */
export async function faturarComandaComRascunho(
  db: Db,
  idAtendimento: string,
  input: FaturarComandaComRascunhoInput,
): Promise<{ items: PagamentoComandaDTO[]; resumo: ResumoComanda }> {
  const id = String(idAtendimento || '').trim();
  if (!id) throw new Error('id_atendimento é obrigatório');
  const list = input.pagamentos ?? [];
  if (!Array.isArray(list) || list.length === 0) {
    throw new Error('Informe pelo menos um pagamento para faturar.');
  }

  await db.transaction(async (tx) => {
    for (const p of list) {
      await inserirPagamentoComandaEmTx(tx, id, p);
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
