import { and, asc, eq } from 'drizzle-orm';
import type { Db } from '../db';
import {
  profissionalServicoComissao,
  profissionais,
  servicos,
} from '../db/schema';

export type ComissaoListagemModo = 'pagamento_cliente' | 'competencia';
export type ProfissionalComissaoServicoTipo = 'percentual' | 'fixo';

export type ProfissionalComissaoServicoItem = {
  servico_id: number;
  servico_nome: string;
  tipo: ProfissionalComissaoServicoTipo;
  valor: number;
  como_auxiliar: boolean;
  sobre: string;
};

export type ProfissionalComissaoPolitica = {
  recebe_comissao: boolean;
  comissao_listagem_modo: ComissaoListagemModo;
};

function toNumberPt(v: unknown): number | null {
  if (v === '' || v == null) return null;
  if (typeof v === 'number') {
    return Number.isFinite(v) ? v : null;
  }
  let t = String(v)
    .replace(/R\$/gi, '')
    .replace(/\s/g, '')
    .trim();
  if (!t) return null;
  if (t.includes(',')) {
    t = t.replace(/\./g, '').replace(',', '.');
  }
  const n = parseFloat(t.replace(/[^\d.-]/g, ''));
  return Number.isNaN(n) ? null : n;
}

function parsePercentCell(v: unknown): number {
  if (v === '' || v == null) return 0;
  if (typeof v === 'number') {
    if (v > 1 && v <= 100) return v / 100;
    return v <= 1 ? v : v / 100;
  }
  const s = String(v)
    .replace(/\s/g, '')
    .replace('%', '')
    .replace(',', '.');
  const n = parseFloat(s);
  if (Number.isNaN(n)) return 0;
  if (n > 1 && n <= 100) return n / 100;
  return n <= 1 ? n : n / 100;
}

function comissaoFromPercentAndValor(valorCell: unknown, pctCell: unknown): string {
  const vNum = toNumberPt(valorCell);
  if (vNum === null) return '';
  const pct = parsePercentCell(pctCell);
  if (pct <= 0) return '';
  return String(vNum * pct);
}

function normalizarModoListagem(v: unknown): ComissaoListagemModo {
  const s = String(v ?? '').trim().toLowerCase();
  return s === 'competencia' ? 'competencia' : 'pagamento_cliente';
}

function normalizarTipo(v: unknown): ProfissionalComissaoServicoTipo {
  const s = String(v ?? '').trim().toLowerCase();
  return s === 'fixo' ? 'fixo' : 'percentual';
}

function valorTextoParaGravacao(tipo: ProfissionalComissaoServicoTipo, valor: number): string {
  if (!Number.isFinite(valor) || valor < 0) return '';
  if (tipo === 'fixo') {
    return valor.toFixed(2);
  }
  return String(valor);
}

export async function getProfissionalComissaoPolitica(
  db: Db,
  profissionalId: number,
): Promise<ProfissionalComissaoPolitica | null> {
  const [row] = await db
    .select({
      recebeComissao: profissionais.recebeComissao,
      comissaoListagemModo: profissionais.comissaoListagemModo,
    })
    .from(profissionais)
    .where(eq(profissionais.id, profissionalId))
    .limit(1);
  if (!row) return null;
  return {
    recebe_comissao: Boolean(row.recebeComissao),
    comissao_listagem_modo: normalizarModoListagem(row.comissaoListagemModo),
  };
}

export async function listProfissionalComissaoServicos(
  db: Db,
  profissionalId: number,
): Promise<ProfissionalComissaoServicoItem[]> {
  const rows = await db
    .select({
      servicoId: profissionalServicoComissao.servicoId,
      servicoNome: servicos.servico,
      tipo: profissionalServicoComissao.tipo,
      valor: profissionalServicoComissao.valor,
      comoAuxiliar: profissionalServicoComissao.comoAuxiliar,
      sobre: profissionalServicoComissao.sobre,
    })
    .from(profissionalServicoComissao)
    .innerJoin(servicos, eq(servicos.id, profissionalServicoComissao.servicoId))
    .where(eq(profissionalServicoComissao.profissionalId, profissionalId))
    .orderBy(asc(servicos.servico));

  return rows.map((r) => ({
    servico_id: r.servicoId,
    servico_nome: String(r.servicoNome ?? '').trim() || `Serviço #${r.servicoId}`,
    tipo: normalizarTipo(r.tipo),
    valor: toNumberPt(r.valor) ?? 0,
    como_auxiliar: Boolean(r.comoAuxiliar),
    sobre: String(r.sobre ?? 'valor_bruto').trim() || 'valor_bruto',
  }));
}

export async function replaceProfissionalComissaoServicos(
  db: Db,
  profissionalId: number,
  items: {
    servico_id: number;
    tipo?: unknown;
    valor?: unknown;
    como_auxiliar?: unknown;
    sobre?: unknown;
  }[],
): Promise<ProfissionalComissaoServicoItem[]> {
  const [prof] = await db
    .select({ id: profissionais.id })
    .from(profissionais)
    .where(eq(profissionais.id, profissionalId))
    .limit(1);
  if (!prof) throw new Error('Profissional não encontrado');

  const seen = new Set<number>();
  const normalized: {
    servicoId: number;
    tipo: ProfissionalComissaoServicoTipo;
    valor: string;
    comoAuxiliar: boolean;
    sobre: string;
  }[] = [];

  for (const it of items) {
    const sid = Number(it.servico_id);
    if (!Number.isFinite(sid) || sid <= 0) continue;
    if (seen.has(sid)) continue;
    seen.add(sid);

    const [srv] = await db
      .select({ id: servicos.id })
      .from(servicos)
      .where(eq(servicos.id, sid))
      .limit(1);
    if (!srv) throw new Error(`Serviço #${sid} não encontrado`);

    const tipo = normalizarTipo(it.tipo);
    const valNum = toNumberPt(it.valor) ?? 0;
    normalized.push({
      servicoId: sid,
      tipo,
      valor: valorTextoParaGravacao(tipo, valNum),
      comoAuxiliar: Boolean(it.como_auxiliar),
      sobre: String(it.sobre ?? 'valor_bruto').trim() || 'valor_bruto',
    });
  }

  await db
    .delete(profissionalServicoComissao)
    .where(eq(profissionalServicoComissao.profissionalId, profissionalId));

  if (normalized.length > 0) {
    await db.insert(profissionalServicoComissao).values(
      normalized.map((n) => ({
        profissionalId,
        servicoId: n.servicoId,
        tipo: n.tipo,
        valor: n.valor,
        comoAuxiliar: n.comoAuxiliar,
        sobre: n.sobre,
      })),
    );
  }

  return listProfissionalComissaoServicos(db, profissionalId);
}

/** Preenche overrides a partir do catálogo `servicos` (não sobrescreve linhas já existentes). */
export async function importarComissaoServicosDoCatalogo(
  db: Db,
  profissionalId: number,
): Promise<{ importados: number; items: ProfissionalComissaoServicoItem[] }> {
  const existentes = await listProfissionalComissaoServicos(db, profissionalId);
  const existSet = new Set(existentes.map((e) => e.servico_id));

  const catalogo = await db.select().from(servicos).orderBy(asc(servicos.id));
  const novos: {
    servico_id: number;
    tipo: ProfissionalComissaoServicoTipo;
    valor: number;
  }[] = [];

  for (const srv of catalogo) {
    const sid = srv.id;
    if (existSet.has(sid)) continue;

    const cf = String(srv.comissaoFixa ?? '').trim();
    const pct = String(srv.comissaoPct ?? '').trim();
    if (cf) {
      const n = toNumberPt(cf);
      if (n != null && n > 0) {
        novos.push({ servico_id: sid, tipo: 'fixo', valor: n });
        continue;
      }
    }
    if (pct) {
      const pctDec = parsePercentCell(pct);
      if (pctDec > 0) {
        novos.push({
          servico_id: sid,
          tipo: 'percentual',
          valor: Math.round(pctDec * 10000) / 100,
        });
      }
    }
  }

  if (novos.length === 0) {
    return { importados: 0, items: existentes };
  }

  const merged = [
    ...existentes.map((e) => ({
      servico_id: e.servico_id,
      tipo: e.tipo,
      valor: e.valor,
      como_auxiliar: e.como_auxiliar,
      sobre: e.sobre,
    })),
    ...novos.map((n) => ({
      servico_id: n.servico_id,
      tipo: n.tipo,
      valor: n.valor,
      como_auxiliar: false,
      sobre: 'valor_bruto',
    })),
  ];

  const items = await replaceProfissionalComissaoServicos(db, profissionalId, merged);
  return { importados: novos.length, items };
}

type ServicoRow = typeof servicos.$inferSelect;

/**
 * Aplica override do profissional (se existir) sobre o valor do catálogo.
 * Retorna o mesmo shape que `valorEComissaoServico` em atendimentos-domain.
 */
export async function aplicarComissaoProfissionalNoValorServico(
  db: Db,
  profissionalId: number | null,
  servicoId: number,
  catalogo: { valor: string; comissao: string },
): Promise<{ valor: string; comissao: string }> {
  if (profissionalId == null || profissionalId <= 0) {
    return catalogo;
  }

  const [ov] = await db
    .select({
      tipo: profissionalServicoComissao.tipo,
      valor: profissionalServicoComissao.valor,
    })
    .from(profissionalServicoComissao)
    .where(
      and(
        eq(profissionalServicoComissao.profissionalId, profissionalId),
        eq(profissionalServicoComissao.servicoId, servicoId),
      ),
    )
    .limit(1);

  if (!ov) return catalogo;

  const tipo = normalizarTipo(ov.tipo);
  const valCfg = toNumberPt(ov.valor);
  if (valCfg == null || valCfg <= 0) {
    return { ...catalogo, comissao: '' };
  }

  if (tipo === 'fixo') {
    return { valor: catalogo.valor, comissao: valCfg.toFixed(2) };
  }

  const comT = comissaoFromPercentAndValor(catalogo.valor, valCfg);
  return { valor: catalogo.valor, comissao: comT };
}

export function parseComissaoListagemModoInput(v: unknown): ComissaoListagemModo {
  return normalizarModoListagem(v);
}
