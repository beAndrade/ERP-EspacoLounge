/**
 * Ações de ciclo de vida de orçamentos (`atendimentos_pedido.modo = orcamento`).
 */
import { eq } from 'drizzle-orm';
import type { Db } from '../db';
import { atendimentos, atendimentosPedido } from '../db/schema';
import { alocarNumeroComandaEmPedido } from './atendimentos-domain';

export type OrcamentoStatus = 'rascunho' | 'enviado' | 'arquivado';

/** Valores ainda possíveis na BD (legado); novos writes não usam `aceito`. */
type OrcamentoStatusDb = OrcamentoStatus | 'aceito';

const STATUS_VALIDOS = new Set<OrcamentoStatus>([
  'rascunho',
  'enviado',
  'arquivado',
]);

function parseDataSqlLocal(dataStr: string): string {
  const s = String(dataStr || '').trim();
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(s.slice(0, 10));
  if (!m) throw new Error('data inválida; use YYYY-MM-DD');
  return `${m[1]}-${m[2]}-${m[3]}`;
}

async function carregarPedidoOrcamento(db: Db, idAtendimento: string) {
  const id = String(idAtendimento || '').trim();
  if (!id) throw new Error('id_atendimento é obrigatório');
  const [ped] = await db
    .select()
    .from(atendimentosPedido)
    .where(eq(atendimentosPedido.idAtendimento, id))
    .limit(1);
  if (!ped) throw new Error('Pedido não encontrado');
  if (String(ped.modo) !== 'orcamento') {
    throw new Error('Este pedido não é um orçamento');
  }
  return ped;
}

export async function atualizarStatusOrcamento(
  db: Db,
  idAtendimento: string,
  status: OrcamentoStatus,
): Promise<{
  id_atendimento: string;
  orcamento_status: OrcamentoStatus;
}> {
  if (!STATUS_VALIDOS.has(status)) {
    throw new Error('orcamento_status inválido');
  }
  const ped = await carregarPedidoOrcamento(db, idAtendimento);
  const id = String(ped.idAtendimento);

  const patch: {
    orcamentoStatus: OrcamentoStatusDb;
    orcamentoEnviadoEm?: string;
  } = { orcamentoStatus: status };

  if (status === 'enviado') {
    patch.orcamentoEnviadoEm = new Date().toISOString();
  }

  await db
    .update(atendimentosPedido)
    .set(patch)
    .where(eq(atendimentosPedido.idAtendimento, id));

  return { id_atendimento: id, orcamento_status: status };
}

/**
 * Converte orçamento em produção e agenda o horário.
 * Exige data + início + profissional (1B).
 */
export async function converterOrcamentoParaProducao(
  db: Db,
  payload: {
    id_atendimento: string;
    data: string;
    inicio: string;
    fim: string;
    profissional_id: number;
    agenda_status?: string;
  },
): Promise<{
  id_atendimento: string;
  modo: 'producao';
  data: string;
  inicio: string;
  fim: string;
}> {
  const ped = await carregarPedidoOrcamento(db, payload.id_atendimento);
  const id = String(ped.idAtendimento);

  const data = parseDataSqlLocal(payload.data);
  const inicio = String(payload.inicio || '').trim();
  const fim = String(payload.fim || '').trim();
  if (!inicio || !fim) {
    throw new Error('inicio e fim são obrigatórios para converter o orçamento');
  }
  const profId = Number(payload.profissional_id);
  if (!Number.isFinite(profId) || profId <= 0) {
    throw new Error('profissional_id é obrigatório');
  }
  const agendaStatus = String(payload.agenda_status || 'confirmado').trim() ||
    'confirmado';

  await alocarNumeroComandaEmPedido(db, id);

  await db
    .update(atendimentosPedido)
    .set({
      modo: 'producao',
      orcamentoStatus: null,
      orcamentoConvertidoEm: new Date().toISOString(),
      orcamentoConvertidoDe: id,
    })
    .where(eq(atendimentosPedido.idAtendimento, id));

  await db
    .update(atendimentos)
    .set({
      data,
      inicio,
      fim,
      profissionalId: profId,
      agendaStatus,
    })
    .where(eq(atendimentos.idAtendimento, id));

  return {
    id_atendimento: id,
    modo: 'producao',
    data,
    inicio,
    fim,
  };
}

export async function pedidoEhOrcamento(
  db: Db,
  idAtendimento: string,
): Promise<boolean> {
  const id = String(idAtendimento || '').trim();
  if (!id) return false;
  const [row] = await db
    .select({ modo: atendimentosPedido.modo })
    .from(atendimentosPedido)
    .where(eq(atendimentosPedido.idAtendimento, id))
    .limit(1);
  return String(row?.modo ?? '') === 'orcamento';
}

export async function assertPedidoNaoOrcamento(
  db: Db,
  idAtendimento: string,
): Promise<void> {
  if (await pedidoEhOrcamento(db, idAtendimento)) {
    throw new Error(
      'Orçamentos não podem ser faturados. Converta para produção na aba Orçamentos.',
    );
  }
}
