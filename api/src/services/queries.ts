import { asc, eq } from 'drizzle-orm';
import type { Db } from '../db';
import {
  cabelos,
  clientes,
  pacotes,
  produtos,
  profissionais,
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

export type ProfissionalFolhaItem = { id: number; nome: string };

/** Lista cadastro `profissionais` (`atendimentos.profissional_id` → `profissionais.id`). */
export async function listProfissionaisApi(
  db: Db,
): Promise<ProfissionalFolhaItem[]> {
  const rows = await db
    .select({ id: profissionais.id, nome: profissionais.nome })
    .from(profissionais)
    .orderBy(asc(profissionais.nome));
  return rows
    .map((r) => ({
      id: r.id,
      nome: String(r.nome || '').trim(),
    }))
    .filter((x) => x.nome);
}
