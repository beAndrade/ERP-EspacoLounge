import { and, desc, eq } from 'drizzle-orm';
import type { Db } from '../db';
import {
  atendimentosPedido,
  clienteCreditoMovimentos,
} from '../db/schema';

export type ClienteCreditoMovimentoTipo = 'entrada' | 'saida';

export type ClienteCreditoMovimentoItem = {
  id: string;
  /** `AAAA-MM-DD` */
  data: string;
  valorReais: number;
  tipo: ClienteCreditoMovimentoTipo;
  motivo: string;
};

type DbLike = Pick<Db, 'select' | 'insert'>;

function valorReaisNum(v: unknown): number {
  const n = parseFloat(String(v ?? '0'));
  return Number.isFinite(n) ? Math.round(n * 100) / 100 : 0;
}

function dataMovIso(v: unknown): string {
  if (v instanceof Date) {
    return v.toISOString().slice(0, 10);
  }
  const s = String(v ?? '').trim();
  if (/^\d{4}-\d{2}-\d{2}/.test(s)) return s.slice(0, 10);
  return s;
}

export async function numeroComandaPorAtendimentoEmTx(
  tx: DbLike,
  idAtendimento: string,
): Promise<number | null> {
  const idAt = String(idAtendimento || '').trim();
  if (!idAt) return null;
  const [row] = await tx
    .select({ n: atendimentosPedido.numeroComanda })
    .from(atendimentosPedido)
    .where(eq(atendimentosPedido.idAtendimento, idAt))
    .limit(1);
  const n = row?.n;
  return typeof n === 'number' && Number.isFinite(n) ? n : null;
}

function rotuloVendaComanda(numero: number | null): string {
  return numero != null ? ` #${numero}` : '';
}

export async function registrarCreditoMovimentoClienteEmTx(
  tx: DbLike,
  clienteId: string,
  input: {
    idAtendimento?: string | null;
    dataMov: string;
    valor: number;
    tipo: ClienteCreditoMovimentoTipo;
    motivo?: string;
  },
): Promise<void> {
  const cid = String(clienteId || '').trim();
  if (!cid) return;
  const v = Math.round(Number(input.valor) * 100) / 100;
  if (!Number.isFinite(v) || v <= 0) return;

  const tipo = input.tipo === 'saida' ? 'saida' : 'entrada';
  const idAt = String(input.idAtendimento ?? '').trim() || null;
  const dataMov = String(input.dataMov || '').trim().slice(0, 10);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(dataMov)) return;

  let motivo = String(input.motivo ?? '').trim();
  if (!motivo && idAt) {
    const numero = await numeroComandaPorAtendimentoEmTx(tx, idAt);
    const rotulo = rotuloVendaComanda(numero);
    motivo =
      tipo === 'entrada'
        ? `Cadastro de crédito pela venda${rotulo}`
        : `Débito de crédito pela venda${rotulo}`;
  }
  if (!motivo) {
    motivo = tipo === 'entrada' ? 'Entrada de crédito' : 'Saída de crédito';
  }

  await tx.insert(clienteCreditoMovimentos).values({
    clienteId: cid,
    idAtendimento: idAt,
    dataMov,
    valor: v.toFixed(2),
    tipo,
    motivo,
  });
}

export async function listClienteCreditoMovimentos(
  db: Db,
  clienteId: string,
): Promise<ClienteCreditoMovimentoItem[]> {
  const cid = String(clienteId || '').trim();
  if (!cid) return [];

  const rows = await db
    .select()
    .from(clienteCreditoMovimentos)
    .where(eq(clienteCreditoMovimentos.clienteId, cid))
    .orderBy(
      desc(clienteCreditoMovimentos.dataMov),
      desc(clienteCreditoMovimentos.id),
    );

  return rows.map((r) => ({
    id: String(r.id),
    data: dataMovIso(r.dataMov),
    valorReais: valorReaisNum(r.valor),
    tipo: r.tipo === 'saida' ? 'saida' : 'entrada',
    motivo: String(r.motivo ?? '').trim(),
  }));
}
