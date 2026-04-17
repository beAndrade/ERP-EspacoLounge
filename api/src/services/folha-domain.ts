import { and, eq, gte, isNotNull, lt, sql } from 'drizzle-orm';
import type { Db } from '../db';
import { atendimentos, folha, profissionais } from '../db/schema';
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

/** Ex.: `2026-04` → `04/2026` (legado planilha). */
function periodoYmParaMesLegivel(ym: string): string {
  const [y, mo] = ym.split('-');
  return `${mo}/${y}`;
}

/** `atendimentos.data` → `YYYY-MM` ou null. */
function dataAtendimentoParaPeriodoYm(
  data: string | Date | null | undefined,
): string | null {
  if (data == null) return null;
  const s =
    typeof data === 'string'
      ? data.slice(0, 10)
      : `${data.getFullYear()}-${String(data.getMonth() + 1).padStart(2, '0')}-${String(data.getDate()).padStart(2, '0')}`;
  if (!/^\d{4}-\d{2}-\d{2}$/.test(s)) return null;
  return s.slice(0, 7);
}

/**
 * Recalcula a folha para cada mês (`YYYY-MM`) presente nas linhas do atendimento.
 * Chamado após finalizar cobrança ou confirmar pagamento.
 */
export async function recalcularFolhaAposMudancaAtendimento(
  db: Db,
  idAtendimento: string,
): Promise<void> {
  const id = String(idAtendimento || '').trim();
  if (!id) return;

  const rows = await db
    .select({ data: atendimentos.data })
    .from(atendimentos)
    .where(eq(atendimentos.idAtendimento, id));

  const periodos = new Set<string>();
  for (const r of rows) {
    const ym = dataAtendimentoParaPeriodoYm(
      r.data as string | Date | null | undefined,
    );
    if (ym && PERIODO_YM_RE.test(ym)) periodos.add(ym);
  }

  for (const p of periodos) {
    await recalcularTotaisComissaoFolhaPorPeriodo(db, p);
  }
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

  let folhaRows = await db.select().from(folha).where(condFolha);
  const folhaPorProfId = new Map(
    folhaRows
      .filter((f) => f.profissionalId != null && f.profissionalId > 0)
      .map((f) => [f.profissionalId as number, f]),
  );

  for (const pid of somaPorProf.keys()) {
    if (profFilter != null && pid !== profFilter) continue;
    if (folhaPorProfId.has(pid)) continue;

    const [pr] = await db
      .select({ nome: profissionais.nome })
      .from(profissionais)
      .where(eq(profissionais.id, pid))
      .limit(1);

    await db.insert(folha).values({
      profissionalId: pid,
      profissional: pr?.nome ?? null,
      mes: periodoYmParaMesLegivel(periodo),
      periodoReferencia: periodo,
      totalComissao: formatMoedaReciboPt(0),
      totalPago: null,
      saldo: null,
      status: null,
    });
  }

  folhaRows = await db.select().from(folha).where(condFolha);

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

export type FolhaListaItemApi = {
  id: number;
  profissional_id: number | null;
  profissional: string | null;
  periodo_referencia: string | null;
  mes: string | null;
  total_comissao: string | null;
  total_pago: string | null;
  saldo: string | null;
  status: string | null;
};

/** Lista linhas de `folha` para um mês de competência (`YYYY-MM`). */
export async function listFolhaPorPeriodoApi(
  db: Db,
  periodoYm: string,
): Promise<FolhaListaItemApi[]> {
  const periodo = String(periodoYm || '').trim();
  if (!PERIODO_YM_RE.test(periodo)) {
    throw new Error('periodo inválido: use YYYY-MM (ex.: 2026-04)');
  }

  const rows = await db
    .select({
      id: folha.id,
      profissionalId: folha.profissionalId,
      profissional: folha.profissional,
      periodoReferencia: folha.periodoReferencia,
      mes: folha.mes,
      totalComissao: folha.totalComissao,
      totalPago: folha.totalPago,
      saldo: folha.saldo,
      status: folha.status,
    })
    .from(folha)
    .where(eq(folha.periodoReferencia, periodo));

  rows.sort((a, b) =>
    String(a.profissional ?? '').localeCompare(String(b.profissional ?? ''), 'pt'),
  );

  return rows.map((r) => ({
    id: r.id,
    profissional_id: r.profissionalId,
    profissional: r.profissional,
    periodo_referencia: r.periodoReferencia,
    mes: r.mes,
    total_comissao: r.totalComissao,
    total_pago: r.totalPago,
    saldo: r.saldo,
    status: r.status,
  }));
}
