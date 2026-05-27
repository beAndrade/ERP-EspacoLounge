import { and, desc, eq, sql } from 'drizzle-orm';
import type { Db } from '../db';
import {
  atendimentosPedido,
  clienteCreditoMovimentos,
  clientes,
  movimentacoes,
} from '../db/schema';
import { getCategoriaIdPorSlug, ORIGEM_MANUAL } from './finance-domain';

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

function ymdHoje(): string {
  const n = new Date();
  const m = n.getMonth() + 1;
  const d = n.getDate();
  return `${n.getFullYear()}-${m < 10 ? `0${m}` : m}-${d < 10 ? `0${d}` : d}`;
}

export type AjustarClienteCreditoManualInput = {
  valor: number;
  tipo: ClienteCreditoMovimentoTipo;
  motivo?: string;
  gerar_movimentacao_financeira?: boolean;
};

export type AjustarClienteCreditoManualResult = {
  saldo: number;
  movimento: ClienteCreditoMovimentoItem;
};

/**
 * Ajuste manual do saldo de crédito (drawer «Atualizar crédito»).
 * Opcionalmente gera lançamento em `movimentacoes` (receita ou despesa).
 */
export async function ajustarClienteCreditoManual(
  db: Db,
  clienteId: string,
  input: AjustarClienteCreditoManualInput,
): Promise<AjustarClienteCreditoManualResult> {
  const cid = String(clienteId || '').trim();
  if (!cid) throw new Error('Cliente inválido.');

  const v = Math.round(Number(input.valor) * 100) / 100;
  if (!Number.isFinite(v) || v <= 0) {
    throw new Error('Informe um valor maior que zero.');
  }

  const tipo = input.tipo === 'saida' ? 'saida' : 'entrada';
  let motivo = String(input.motivo ?? '').trim();
  if (motivo.length > 400) {
    throw new Error('O motivo pode ter no máximo 400 caracteres.');
  }
  if (!motivo) {
    motivo = tipo === 'entrada' ? 'Entrada de crédito' : 'Saída de crédito';
  }

  const gerarFin = input.gerar_movimentacao_financeira === true;
  const dataMov = ymdHoje();

  return db.transaction(async (tx) => {
    const [cli] = await tx
      .select({
        nome: clientes.nomeExibido,
        saldo: clientes.creditoSaldo,
      })
      .from(clientes)
      .where(eq(clientes.idCliente, cid))
      .limit(1);
    if (!cli) throw new Error('Cliente não encontrado.');

    const saldoAtual = valorReaisNum(cli.saldo);
    if (tipo === 'saida' && saldoAtual < v) {
      throw new Error('Saldo de crédito insuficiente para esta retirada.');
    }

    const nomeCliente = String(cli.nome ?? '').trim();
    const descFinBase = nomeCliente
      ? `Crédito cliente — ${nomeCliente}`
      : 'Crédito cliente';

    if (gerarFin) {
      if (tipo === 'entrada') {
        const categoriaId = await getCategoriaIdPorSlug(
          tx as unknown as Db,
          'receita_servicos',
        );
        await tx.insert(movimentacoes).values({
          dataMov,
          natureza: 'receita',
          valor: v.toFixed(2),
          categoriaId,
          descricao: motivo || descFinBase,
          pagoEm: dataMov,
          origem: ORIGEM_MANUAL,
        });
      } else {
        const categoriaId = await getCategoriaIdPorSlug(
          tx as unknown as Db,
          'despesa_outras',
        );
        await tx.insert(movimentacoes).values({
          dataMov,
          natureza: 'despesa',
          valor: v.toFixed(2),
          categoriaId,
          descricao: motivo || descFinBase,
          pagoEm: dataMov,
          origem: ORIGEM_MANUAL,
        });
      }
    }

    if (tipo === 'entrada') {
      await tx
        .update(clientes)
        .set({
          creditoSaldo: sql`${clientes.creditoSaldo}::numeric + ${v.toFixed(2)}::numeric`,
        })
        .where(eq(clientes.idCliente, cid));
    } else {
      await tx
        .update(clientes)
        .set({
          creditoSaldo: sql`GREATEST(0::numeric, ${clientes.creditoSaldo}::numeric - ${v.toFixed(2)}::numeric)`,
        })
        .where(eq(clientes.idCliente, cid));
    }

    const [ins] = await tx
      .insert(clienteCreditoMovimentos)
      .values({
        clienteId: cid,
        idAtendimento: null,
        dataMov,
        valor: v.toFixed(2),
        tipo,
        motivo,
      })
      .returning({ id: clienteCreditoMovimentos.id });

    const [saldoRow] = await tx
      .select({ saldo: clientes.creditoSaldo })
      .from(clientes)
      .where(eq(clientes.idCliente, cid))
      .limit(1);

    const movimento: ClienteCreditoMovimentoItem = {
      id: String(ins?.id ?? ''),
      data: dataMov,
      valorReais: v,
      tipo,
      motivo,
    };

    return {
      saldo: valorReaisNum(saldoRow?.saldo),
      movimento,
    };
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
