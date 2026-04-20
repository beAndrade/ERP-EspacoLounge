import { asc, eq, inArray, sql } from 'drizzle-orm';
import type { Db } from '../db';
import {
  atendimentos,
  atendimentosPedido,
  cabelos,
  clientes,
  movimentacoes,
  pacotes,
  produtos,
  regrasMega,
  servicos,
} from '../db/schema';

export async function listClientesNormalized(db: Db) {
  const rows = await db.select().from(clientes).orderBy(asc(clientes.nomeExibido));
  return rows
    .map((r) => ({
      id: String(r.idCliente || ''),
      nome: String(r.nomeExibido || ''),
      telefone:
        r.telefone != null && r.telefone !== '' ? String(r.telefone) : null,
      observacoes:
        r.observacoes != null && r.observacoes !== ''
          ? String(r.observacoes)
          : null,
    }))
    .filter((x) => x.nome.trim() && x.id.trim());
}

export async function getClienteById(db: Db, id: string) {
  const [r] = await db
    .select()
    .from(clientes)
    .where(eq(clientes.idCliente, id.trim()))
    .limit(1);
  if (!r) return null;
  return {
    id: String(r.idCliente || ''),
    nome: String(r.nomeExibido || ''),
    telefone:
      r.telefone != null && r.telefone !== '' ? String(r.telefone) : null,
    observacoes:
      r.observacoes != null && r.observacoes !== ''
        ? String(r.observacoes)
        : null,
  };
}

/**
 * Próximo `id_cliente` no padrão da planilha (`CL0001`, …).
 * Usa agregação SQL (evita depender da forma do resultado do `select` no Drizzle e ignora UUIDs).
 */
export async function allocNextClienteClId(db: Db): Promise<string> {
  const rows = await db.execute(
    sql.raw(`
      SELECT COALESCE(MAX(CAST(SUBSTRING(id_cliente, 3) AS INTEGER)), 0) AS max_n
      FROM clientes
      WHERE id_cliente ~* '^cl[0-9]+$'
    `),
  );
  const first = Array.from(rows as Iterable<Record<string, unknown>>)[0];
  const max = Number(first?.max_n ?? 0);
  const n = Number.isFinite(max) ? max : 0;
  const next = n + 1;
  return `CL${String(next).padStart(4, '0')}`;
}

/**
 * Remove o cliente e linhas ligadas: movimentações do razão (por `id_atendimento`),
 * `atendimentos`, `atendimentos_pedido` (cascade em `atendimento_itens`).
 */
export async function deleteClienteById(db: Db, id: string): Promise<boolean> {
  const cid = id.trim();
  if (!cid) return false;
  return await db.transaction(async (tx) => {
    const idAtRows = await tx
      .select({ idAt: atendimentos.idAtendimento })
      .from(atendimentos)
      .where(eq(atendimentos.idCliente, cid));
    const idAtPedido = await tx
      .select({ idAt: atendimentosPedido.idAtendimento })
      .from(atendimentosPedido)
      .where(eq(atendimentosPedido.idCliente, cid));
    const idAts = [
      ...new Set(
        [...idAtRows, ...idAtPedido]
          .map((r) => String(r.idAt ?? '').trim())
          .filter(Boolean),
      ),
    ];
    if (idAts.length > 0) {
      await tx
        .delete(movimentacoes)
        .where(inArray(movimentacoes.idAtendimento, idAts));
    }
    await tx.delete(atendimentos).where(eq(atendimentos.idCliente, cid));
    await tx
      .delete(atendimentosPedido)
      .where(eq(atendimentosPedido.idCliente, cid));
    const out = await tx
      .delete(clientes)
      .where(eq(clientes.idCliente, cid))
      .returning({ id: clientes.idCliente });
    return out.length > 0;
  });
}

export async function listServicosForApi(db: Db) {
  const rows = await db.select().from(servicos).orderBy(asc(servicos.id));
  return rows
    .map((r) => {
      const empty =
        !r.servico?.trim() &&
        !r.tipo?.trim() &&
        r.valorBase == null &&
        r.precoCurto == null;
      if (empty) return null;
      return {
        id: String(r.id),
        Serviço: r.servico,
        Tipo: r.tipo,
        duracao_minutos: r.duracaoMinutos ?? 30,
        duracao_curto: r.duracaoCurto ?? null,
        duracao_medio: r.duracaoMedio ?? null,
        duracao_m_l: r.duracaoMedioLongo ?? null,
        duracao_longo: r.duracaoLongo ?? null,
        'Valor Base': r.valorBase,
        'Comissão Fixa': r.comissaoFixa,
        'Comissão %': r.comissaoPct,
        'Preço Curto': r.precoCurto,
        'Preço Médio': r.precoMedio,
        'Preço Médio/Longo': r.precoMedioLongo,
        'Preço Longo': r.precoLongo,
        'Custo Fixo': r.custoFixo,
        Curto: r.curto,
        Médio: r.medio,
        'M/L': r.mL,
        Longo: r.longo,
      };
    })
    .filter(Boolean) as Record<string, unknown>[];
}

export async function listRegrasMegaApi(db: Db) {
  const rows = await db.select().from(regrasMega);
  return rows
    .filter((r) => r.pacote?.trim() && r.etapa?.trim())
    .map((r) => ({
      pacote: String(r.pacote).trim(),
      etapa: String(r.etapa).trim(),
      valor: r.valor,
      comissao: r.comissao,
      duracao_minutos: r.duracaoMinutos ?? 30,
    }));
}

export async function listPacotesApi(db: Db) {
  const rows = await db.select().from(pacotes);
  return rows
    .filter((r) => r.pacote?.trim())
    .map((r) => ({
      pacote: String(r.pacote).trim(),
      preco: r.precoPacote,
    }));
}

export async function listProdutosApi(db: Db) {
  const rows = await db.select().from(produtos);
  return rows
    .filter((r) => r.produto?.trim())
    .map((r) => ({
      id: r.id,
      produto: String(r.produto).trim(),
      categoria: r.categoria != null ? String(r.categoria).trim() : '',
      preco: r.preco,
      estoque: r.estoque,
      unidade: r.unidade != null ? String(r.unidade) : '',
    }));
}

export async function listCabelosApi(db: Db) {
  const rows = await db.select().from(cabelos);
  return rows.map((r) => ({
    cor: r.cor != null ? String(r.cor) : '',
    tamanho_cm: r.tamanhoCm,
    metodo: r.metodo != null ? String(r.metodo) : '',
    valor_base: r.valorBase,
  }));
}

