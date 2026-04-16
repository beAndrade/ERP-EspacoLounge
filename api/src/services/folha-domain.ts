import { and, eq, gte, isNotNull, lt, sql } from 'drizzle-orm';
import type { Db } from '../db';
import { atendimentos, folha } from '../db/schema';
import {
  formatMoedaReciboPt,
  toNumberPt,
} from './finance-domain';

const PERIODO_YM_RE = /^\d{4}-(0[1-9]|1[0-2])$/;

function primeiroDiaMesSeguinte(periodoYm: string): string {
  const [ys, ms] = periodoYm.split('-');
  const y = parseInt(ys, 10);
  const m = parseInt(ms, 10);
  if (m === 12) return `${y + 1}-01-01`;
  return `${y}-${String(m + 1).padStart(2, '0')}-01`;
}

export type RecalcularComissoesFolhaResultado = {
  periodo: string;
  linhas_folha_atualizadas: number;
  itens: {
    folha_id: number;
    profissional_id: number | null;
    total_comissao_reais: number;
    linhas_atendimento: number;
  }[];
};

/**
 * Soma `atendimentos.comissao` (linhas finalizadas) por profissional no mês
 * e grava em `folha.total_comissao`. Recalcula `saldo` = comissão − total_pago
 * quando `total_pago` for interpretável como valor.
 */
export async function recalcularTotaisComissaoFolhaPorPeriodo(
  db: Db,
  periodoYm: string,
  opts?: { profissionalId?: number },
): Promise<RecalcularComissoesFolhaResultado> {
  const periodo = String(periodoYm || '').trim();
  if (!PERIODO_YM_RE.test(periodo)) {
    throw new Error(
      'periodo inválido: use YYYY-MM (ex.: 2026-04)',
    );
  }
  const profFilter = opts?.profissionalId;
  if (
    profFilter != null &&
    (!Number.isFinite(profFilter) || profFilter <= 0)
  ) {
    throw new Error('profissional_id inválido');
  }

  const dataIni = `${periodo}-01`;
  const dataFimExclusivo = primeiroDiaMesSeguinte(periodo);

  const baseAt = and(
    isNotNull(atendimentos.profissionalId),
    gte(atendimentos.data, dataIni),
    lt(atendimentos.data, dataFimExclusivo),
    sql`lower(coalesce(${atendimentos.cobrancaStatus}, '')) = 'finalizada'`,
  );

  const linhas = await db
    .select({
      profissionalId: atendimentos.profissionalId,
      comissao: atendimentos.comissao,
    })
    .from(atendimentos)
    .where(
      profFilter != null
        ? and(baseAt, eq(atendimentos.profissionalId, profFilter))
        : baseAt,
    );

  const somaPorProf = new Map<number, { total: number; n: number }>();
  for (const r of linhas) {
    const pid = r.profissionalId;
    if (pid == null || pid <= 0) continue;
    const c = toNumberPt(r.comissao);
    const add = c != null && c > 0 ? c : 0;
    const cur = somaPorProf.get(pid) ?? { total: 0, n: 0 };
    cur.total += add;
    cur.n += 1;
    somaPorProf.set(pid, cur);
  }

  const condFolha = profFilter != null
    ? and(eq(folha.periodoReferencia, periodo), eq(folha.profissionalId, profFilter))
    : eq(folha.periodoReferencia, periodo);

  const folhaRows = await db.select().from(folha).where(condFolha);

  let atualizadas = 0;
  const itens: RecalcularComissoesFolhaResultado['itens'] = [];

  for (const f of folhaRows) {
    const pid = f.profissionalId;
    if (pid == null || pid <= 0) continue;

    const agg = somaPorProf.get(pid);
    const total = agg?.total ?? 0;
    const nAt = agg?.n ?? 0;

    const pago = toNumberPt(f.totalPago);
    const patch: {
      totalComissao: string;
      saldo?: string;
    } = {
      totalComissao: formatMoedaReciboPt(total),
    };
    if (pago !== null) {
      patch.saldo = formatMoedaReciboPt(
        Math.round((total - pago) * 100) / 100,
      );
    }

    await db.update(folha).set(patch).where(eq(folha.id, f.id));
    atualizadas += 1;
    itens.push({
      folha_id: f.id,
      profissional_id: pid,
      total_comissao_reais: Math.round(total * 100) / 100,
      linhas_atendimento: nAt,
    });
  }

  return {
    periodo,
    linhas_folha_atualizadas: atualizadas,
    itens,
  };
}
