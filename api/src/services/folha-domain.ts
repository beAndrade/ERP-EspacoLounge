import { and, eq, gte, inArray, isNotNull, isNull, lt, sql } from 'drizzle-orm';
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
export function periodoYmParaMesLegivel(ym: string): string {
  const [y, mo] = ym.split('-');
  return `${mo}/${y}`;
}

/** `atendimentos.data` → `YYYY-MM` ou null. */
export function dataAtendimentoParaPeriodoYm(
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

function statusFolhaFromTotais(total: number, pago: number): string {
  if (total <= 0) return 'sem_comissao';
  if (pago <= 0.005) return 'pendente';
  const saldo = Math.round((total - pago) * 100) / 100;
  if (saldo <= 0.005) return 'quitado';
  return 'parcial';
}

type SomaProf = { total: number; n: number };

function acumularComissaoPorProf(
  rows: { profissionalId: number | null; comissao: string | null }[],
): Map<number, SomaProf> {
  const somaPorProf = new Map<number, SomaProf>();
  for (const r of rows) {
    const pid = r.profissionalId;
    if (pid == null || pid <= 0) continue;
    const c = toNumberPt(r.comissao);
    const add = c != null && c > 0 ? c : 0;
    const cur = somaPorProf.get(pid) ?? { total: 0, n: 0 };
    cur.total += add;
    cur.n += 1;
    somaPorProf.set(pid, cur);
  }
  return somaPorProf;
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

/** Recalcula `folha` nos meses de competência das linhas de `atendimentos` indicadas. */
export async function recalcularFolhaAposIdsAtendimento(
  db: Db,
  atendimentoIds: number[],
): Promise<void> {
  const ids = [
    ...new Set(
      atendimentoIds.filter((x) => Number.isFinite(x) && x > 0),
    ),
  ];
  if (ids.length === 0) return;

  const rows = await db
    .select({
      profissionalId: atendimentos.profissionalId,
      data: atendimentos.data,
    })
    .from(atendimentos)
    .where(inArray(atendimentos.id, ids));

  const chaves = new Set<string>();
  for (const r of rows) {
    const pid = r.profissionalId;
    const ym = dataAtendimentoParaPeriodoYm(
      r.data as string | Date | null | undefined,
    );
    if (pid != null && pid > 0 && ym && PERIODO_YM_RE.test(ym)) {
      chaves.add(`${pid}|${ym}`);
    }
  }

  for (const k of chaves) {
    const [pidS, ym] = k.split('|');
    await recalcularTotaisComissaoFolhaPorPeriodo(db, ym, {
      profissionalId: Number(pidS),
    });
  }
}

/**
 * Competência principal de um lote de pagamento (mês com maior soma de comissão).
 * Garante linha em `folha` e devolve `folha.id` para `pagamentos.folha_id`.
 */
export async function folhaIdPrincipalParaLoteAtendimentos(
  db: Db,
  profId: number,
  atendimentoIds: number[],
): Promise<{ folhaId: number | null; periodoYm: string | null }> {
  const ids = [
    ...new Set(
      atendimentoIds.filter((x) => Number.isFinite(x) && x > 0),
    ),
  ];
  if (ids.length === 0) return { folhaId: null, periodoYm: null };

  const rows = await db
    .select({
      data: atendimentos.data,
      comissao: atendimentos.comissao,
    })
    .from(atendimentos)
    .where(
      and(
        inArray(atendimentos.id, ids),
        eq(atendimentos.profissionalId, profId),
      ),
    );

  const porPeriodo = new Map<string, number>();
  for (const r of rows) {
    const ym = dataAtendimentoParaPeriodoYm(
      r.data as string | Date | null | undefined,
    );
    if (!ym || !PERIODO_YM_RE.test(ym)) continue;
    const c = toNumberPt(r.comissao) ?? 0;
    porPeriodo.set(ym, (porPeriodo.get(ym) ?? 0) + (c > 0 ? c : 0));
  }

  if (porPeriodo.size === 0) return { folhaId: null, periodoYm: null };

  let bestYm = '';
  let bestVal = -1;
  for (const [ym, v] of porPeriodo) {
    if (v > bestVal) {
      bestVal = v;
      bestYm = ym;
    }
  }

  await recalcularTotaisComissaoFolhaPorPeriodo(db, bestYm, {
    profissionalId: profId,
  });

  const [f] = await db
    .select({ id: folha.id })
    .from(folha)
    .where(
      and(
        eq(folha.profissionalId, profId),
        eq(folha.periodoReferencia, bestYm),
      ),
    )
    .limit(1);

  return { folhaId: f?.id ?? null, periodoYm: bestYm };
}

export type RecalcularComissoesFolhaResultado = {
  periodo: string;
  linhas_folha_atualizadas: number;
  itens: {
    folha_id: number;
    profissional_id: number | null;
    profissional_nome: string;
    total_comissao_reais: number;
    total_pago_reais: number;
    saldo_reais: number;
    status: string;
    linhas_atendimento: number;
  }[];
};

/**
 * Sincroniza `folha` com `atendimentos` no mês de competência:
 * - `total_comissao` = soma das linhas finalizadas com comissão > 0
 * - `total_pago` = soma das linhas finalizadas já pagas à profissional (`comissao_paga_em`)
 * - `saldo` = total_comissao − total_pago
 * - `status` = pendente | parcial | quitado | sem_comissao
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

  const whereAt = profFilter != null
    ? and(baseAt, eq(atendimentos.profissionalId, profFilter))
    : baseAt;

  const linhas = await db
    .select({
      profissionalId: atendimentos.profissionalId,
      comissao: atendimentos.comissao,
    })
    .from(atendimentos)
    .where(whereAt);

  const linhasPagas = await db
    .select({
      profissionalId: atendimentos.profissionalId,
      comissao: atendimentos.comissao,
    })
    .from(atendimentos)
    .where(and(whereAt, isNotNull(atendimentos.comissaoPagaEm)));

  const somaPorProf = acumularComissaoPorProf(linhas);
  const pagoPorProf = acumularComissaoPorProf(linhasPagas);

  const condFolha = profFilter != null
    ? and(eq(folha.periodoReferencia, periodo), eq(folha.profissionalId, profFilter))
    : eq(folha.periodoReferencia, periodo);

  let folhaRows = await db.select().from(folha).where(condFolha);
  const folhaPorProfId = new Map(
    folhaRows
      .filter((f) => f.profissionalId != null && f.profissionalId > 0)
      .map((f) => [f.profissionalId as number, f]),
  );

  const profIdsAtivos = new Set([
    ...somaPorProf.keys(),
    ...pagoPorProf.keys(),
  ]);

  for (const pid of profIdsAtivos) {
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
      totalPago: formatMoedaReciboPt(0),
      saldo: formatMoedaReciboPt(0),
      status: 'pendente',
    });
  }

  folhaRows = await db.select().from(folha).where(condFolha);

  let atualizadas = 0;
  const itens: RecalcularComissoesFolhaResultado['itens'] = [];

  for (const f of folhaRows) {
    const pid = f.profissionalId;
    if (pid == null || pid <= 0) continue;

    const total = Math.round((somaPorProf.get(pid)?.total ?? 0) * 100) / 100;
    const pago = Math.round((pagoPorProf.get(pid)?.total ?? 0) * 100) / 100;
    const saldo = Math.max(0, Math.round((total - pago) * 100) / 100);
    const nAt = somaPorProf.get(pid)?.n ?? 0;
    const status = statusFolhaFromTotais(total, pago);

    const [pr] = await db
      .select({ nome: profissionais.nome })
      .from(profissionais)
      .where(eq(profissionais.id, pid))
      .limit(1);

    await db
      .update(folha)
      .set({
        profissional: pr?.nome ?? f.profissional,
        mes: periodoYmParaMesLegivel(periodo),
        totalComissao: formatMoedaReciboPt(total),
        totalPago: formatMoedaReciboPt(pago),
        saldo: formatMoedaReciboPt(saldo),
        status,
      })
      .where(eq(folha.id, f.id));

    atualizadas += 1;
    itens.push({
      folha_id: f.id,
      profissional_id: pid,
      profissional_nome: String(pr?.nome ?? f.profissional ?? '').trim() || '—',
      total_comissao_reais: total,
      total_pago_reais: pago,
      saldo_reais: saldo,
      status,
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

  await recalcularTotaisComissaoFolhaPorPeriodo(db, periodo);

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

export type FinComissaoResumidaItemApi = {
  folha_id: number;
  profissional_id: number;
  profissional_nome: string;
  periodo_referencia: string;
  total_comissao: number;
  total_pago: number;
  saldo: number;
  status: string;
};

/** Resumo mensal (`folha`) para intervalo de competências que intersecta o filtro. */
export async function listComissoesResumidasApi(
  db: Db,
  opts: {
    dataInicio: string;
    dataFim: string;
    profissionalId?: number | null;
  },
): Promise<FinComissaoResumidaItemApi[]> {
  const di = String(opts.dataInicio ?? '').trim().slice(0, 10);
  const df = String(opts.dataFim ?? '').trim().slice(0, 10);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(di) || !/^\d{4}-\d{2}-\d{2}$/.test(df)) {
    throw new Error('data_inicio e data_fim são obrigatórias (YYYY-MM-DD)');
  }
  if (di > df) {
    throw new Error('data_inicio não pode ser posterior a data_fim');
  }

  const profFiltro = Number(opts.profissionalId);
  const filtrarProf = Number.isFinite(profFiltro) && profFiltro > 0;

  const periodoIni = di.slice(0, 7);
  const periodoFim = df.slice(0, 7);
  const periodos: string[] = [];
  let [y, m] = periodoIni.split('-').map((x) => parseInt(x, 10));
  const [yFim, mFim] = periodoFim.split('-').map((x) => parseInt(x, 10));
  while (y < yFim || (y === yFim && m <= mFim)) {
    periodos.push(`${y}-${String(m).padStart(2, '0')}`);
    m += 1;
    if (m > 12) {
      m = 1;
      y += 1;
    }
  }

  const out: FinComissaoResumidaItemApi[] = [];
  for (const p of periodos) {
    const r = await recalcularTotaisComissaoFolhaPorPeriodo(
      db,
      p,
      filtrarProf ? { profissionalId: profFiltro } : undefined,
    );
    for (const item of r.itens) {
      if (item.profissional_id == null) continue;
      out.push({
        folha_id: item.folha_id,
        profissional_id: item.profissional_id,
        profissional_nome: item.profissional_nome,
        periodo_referencia: p,
        total_comissao: item.total_comissao_reais,
        total_pago: item.total_pago_reais,
        saldo: item.saldo_reais,
        status: item.status,
      });
    }
  }

  out.sort((a, b) => {
    if (a.periodo_referencia !== b.periodo_referencia) {
      return a.periodo_referencia < b.periodo_referencia ? 1 : -1;
    }
    return a.profissional_nome.localeCompare(b.profissional_nome, 'pt');
  });

  return out;
}
