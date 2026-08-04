/**
 * Ações de ciclo de vida de orçamentos (`atendimentos_pedido.modo = orcamento`).
 */
import { and, asc, eq } from 'drizzle-orm';
import type { Db } from '../db';
import {
  atendimentos,
  atendimentosPedido,
  regrasMega,
  regrasMegaQueratina,
  servicos,
} from '../db/schema';
import {
  addMinutesToParts,
  formatSqlLocalDateTime,
  parseSqlLocalDateTime,
  type SqlLocalParts,
} from '../lib/sql-local-datetime';
import { alocarNumeroComandaEmPedido } from './atendimentos-domain';

export type OrcamentoStatus = 'rascunho' | 'enviado' | 'arquivado';

/** Valores ainda possíveis na BD (legado); novos writes não usam `aceito`. */
type OrcamentoStatusDb = OrcamentoStatus | 'aceito';

const STATUS_VALIDOS = new Set<OrcamentoStatus>([
  'rascunho',
  'enviado',
  'arquivado',
]);

const ORDEM_ETAPAS_MEGA = [
  'retirada',
  'preparo',
  'escova',
  'colocacao',
] as const;

function parseDataSqlLocal(dataStr: string): string {
  const s = String(dataStr || '').trim();
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(s.slice(0, 10));
  if (!m) throw new Error('data inválida; use YYYY-MM-DD');
  return `${m[1]}-${m[2]}-${m[3]}`;
}

function normalizarHhMm(raw: string): string {
  const s = String(raw || '').trim();
  const m = /^(\d{1,2}):(\d{2})$/.exec(s);
  if (!m) return '10:00';
  const hh = Math.min(23, Math.max(0, parseInt(m[1], 10)));
  const mm = Math.min(59, Math.max(0, parseInt(m[2], 10)));
  return `${String(hh).padStart(2, '0')}:${String(mm).padStart(2, '0')}`;
}

function partesDeDataEHora(dataYmd: string, hhMm: string): SqlLocalParts {
  const dm = /^(\d{4})-(\d{2})-(\d{2})$/.exec(dataYmd);
  const hm = /^(\d{1,2}):(\d{2})$/.exec(hhMm);
  if (!dm || !hm) {
    throw new Error('data/hora inválidas para agendar o orçamento');
  }
  return {
    y: parseInt(dm[1], 10),
    mo: parseInt(dm[2], 10),
    d: parseInt(dm[3], 10),
    hh: parseInt(hm[1], 10),
    mm: parseInt(hm[2], 10),
    ss: 0,
  };
}

function duracaoCatalogoMin(d: number | null | undefined): number {
  const n =
    d == null || !Number.isFinite(Number(d)) ? 30 : Math.round(Number(d));
  return Math.max(5, Math.min(24 * 60, n));
}

function chaveEtapaNorm(nome: string): string {
  return String(nome || '')
    .trim()
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/ç/g, 'c');
}

function compararEtapasMega(a: string, b: string): number {
  const ka = chaveEtapaNorm(a);
  const kb = chaveEtapaNorm(b);
  const ia = ORDEM_ETAPAS_MEGA.findIndex((e) => e === ka);
  const ib = ORDEM_ETAPAS_MEGA.findIndex((e) => e === kb);
  const pa = ia >= 0 ? ia : 100;
  const pb = ib >= 0 ? ib : 100;
  if (pa !== pb) return pa - pb;
  return String(a || '').localeCompare(String(b || ''), 'pt-BR');
}

function slotEncadeadoAposFim(
  fimAnterior: string,
  durMin: number,
): { inicio: string; fim: string } {
  const p = parseSqlLocalDateTime(fimAnterior);
  if (!p) {
    throw new Error('Data/hora inválida ao encadear etapas Mega/Pacote');
  }
  const inicio = fimAnterior;
  const fim = formatSqlLocalDateTime(
    addMinutesToParts(p, duracaoCatalogoMin(durMin)),
  );
  return { inicio, fim };
}

function isTipoMegaOuPacote(tipo: string): boolean {
  const t = tipo.trim().toLowerCase();
  return (
    t === 'mega' ||
    t === 'pacote' ||
    t === 'mega queratina' ||
    t === 'pacote adesivo+queratina' ||
    t === 'pacote adesivo + queratina'
  );
}

function isPacoteCabeca(tipo: string, etapa: string): boolean {
  const t = tipo.trim().toLowerCase();
  const e = String(etapa || '').trim();
  if (e) return false;
  return t === 'pacote' || t.includes('queratina');
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

async function duracaoRegraMega(
  db: Db,
  pacote: string,
  etapa: string,
  queratina: boolean,
): Promise<number> {
  const sp = pacote.trim();
  const se = etapa.trim();
  if (!sp || !se) return 30;
  if (queratina) {
    const rows = await db
      .select({ duracaoMinutos: regrasMegaQueratina.duracaoMinutos })
      .from(regrasMegaQueratina)
      .where(
        and(
          eq(regrasMegaQueratina.pacote, sp),
          eq(regrasMegaQueratina.etapa, se),
        ),
      )
      .limit(1);
    return duracaoCatalogoMin(rows[0]?.duracaoMinutos ?? null);
  }
  const rows = await db
    .select({ duracaoMinutos: regrasMega.duracaoMinutos })
    .from(regrasMega)
    .where(and(eq(regrasMega.pacote, sp), eq(regrasMega.etapa, se)))
    .limit(1);
  return duracaoCatalogoMin(rows[0]?.duracaoMinutos ?? null);
}

async function duracaoLinhaSimples(
  db: Db,
  servicosRef: string | null | undefined,
): Promise<number> {
  const nome = String(servicosRef || '').trim();
  if (!nome) return 30;
  const rows = await db
    .select({ duracaoMinutos: servicos.duracaoMinutos })
    .from(servicos)
    .where(eq(servicos.servico, nome))
    .limit(1);
  return duracaoCatalogoMin(rows[0]?.duracaoMinutos ?? null);
}

/**
 * Converte orçamento em produção e agenda.
 * Preserva `profissional_id` por linha; encadeia etapas Mega/Pacote a partir de `inicio`.
 */
export async function converterOrcamentoParaProducao(
  db: Db,
  payload: {
    id_atendimento: string;
    data: string;
    /** HH:mm — padrão 10:00. */
    inicio?: string;
    agenda_status?: string;
    /** Opcional: atualiza cliente do pedido/linhas antes de agendar. */
    cliente_id?: string;
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
  const hhMm = normalizarHhMm(payload.inicio ?? '10:00');
  const agendaStatus =
    String(payload.agenda_status || 'confirmado').trim() || 'confirmado';
  const clienteIdNovo = String(payload.cliente_id ?? '').trim();

  const linhas = await db
    .select()
    .from(atendimentos)
    .where(eq(atendimentos.idAtendimento, id))
    .orderBy(asc(atendimentos.id));
  if (linhas.length === 0) {
    throw new Error('Orçamento sem itens para converter');
  }

  for (const row of linhas) {
    const tipo = String(row.tipo ?? '');
    const etapa = String(row.etapa ?? '').trim();
    if (!isTipoMegaOuPacote(tipo) || isPacoteCabeca(tipo, etapa)) continue;
    const prof = row.profissionalId;
    if (prof == null || !Number.isFinite(Number(prof)) || Number(prof) <= 0) {
      throw new Error(
        `Etapa "${etapa || tipo}" sem profissional. Ajuste no orçamento antes de converter.`,
      );
    }
  }

  await alocarNumeroComandaEmPedido(db, id);

  const pedidoPatch: {
    modo: 'producao';
    orcamentoStatus: null;
    orcamentoConvertidoEm: string;
    orcamentoConvertidoDe: string;
    idCliente?: string;
  } = {
    modo: 'producao',
    orcamentoStatus: null,
    orcamentoConvertidoEm: new Date().toISOString(),
    orcamentoConvertidoDe: id,
  };
  if (clienteIdNovo) {
    pedidoPatch.idCliente = clienteIdNovo;
  }

  await db
    .update(atendimentosPedido)
    .set(pedidoPatch)
    .where(eq(atendimentosPedido.idAtendimento, id));

  const ancoraParts = partesDeDataEHora(data, hhMm);
  const ancoraInicio = formatSqlLocalDateTime(ancoraParts);

  type SlotPlan = { id: number; inicio: string | null; fim: string | null };
  const plans: SlotPlan[] = [];

  const megaGrupos = new Map<string, typeof linhas>();
  const simples: typeof linhas = [];

  for (const row of linhas) {
    const tipo = String(row.tipo ?? '');
    const etapa = String(row.etapa ?? '').trim();
    if (isPacoteCabeca(tipo, etapa)) {
      plans.push({ id: row.id, inicio: null, fim: null });
      continue;
    }
    if (isTipoMegaOuPacote(tipo) && etapa) {
      const pacote = String(row.pacote ?? '').trim() || '_';
      const key = `${tipo.toLowerCase()}::${pacote}`;
      const arr = megaGrupos.get(key) ?? [];
      arr.push(row);
      megaGrupos.set(key, arr);
      continue;
    }
    simples.push(row);
  }

  let cursorGlobal: string | null = ancoraInicio;
  let primeiroInicio = ancoraInicio;
  let ultimoFim = ancoraInicio;

  for (const [, grupo] of megaGrupos) {
    grupo.sort((a, b) =>
      compararEtapasMega(String(a.etapa ?? ''), String(b.etapa ?? '')),
    );
    let cursorFim: string | null = null;
    for (let idx = 0; idx < grupo.length; idx++) {
      const row = grupo[idx];
      const pacote = String(row.pacote ?? '').trim();
      const etapa = String(row.etapa ?? '').trim();
      const queratina = String(row.tipo ?? '')
        .toLowerCase()
        .includes('queratina');
      const dm = await duracaoRegraMega(db, pacote, etapa, queratina);
      let iniLine: string;
      let fimLine: string;
      if (idx === 0) {
        const base = cursorGlobal ?? ancoraInicio;
        const p = parseSqlLocalDateTime(base);
        if (!p) throw new Error('Horário âncora inválido');
        iniLine = base;
        fimLine = formatSqlLocalDateTime(
          addMinutesToParts(p, duracaoCatalogoMin(dm)),
        );
      } else {
        if (!cursorFim) throw new Error('Falha ao encadear etapas');
        const enc = slotEncadeadoAposFim(cursorFim, dm);
        iniLine = enc.inicio;
        fimLine = enc.fim;
      }
      cursorFim = fimLine;
      cursorGlobal = fimLine;
      plans.push({ id: row.id, inicio: iniLine, fim: fimLine });
      if (plans.length === 1 || iniLine < primeiroInicio) {
        primeiroInicio = iniLine;
      }
      if (fimLine > ultimoFim) ultimoFim = fimLine;
    }
  }

  for (const row of simples) {
    const base = cursorGlobal ?? ancoraInicio;
    const dm = await duracaoLinhaSimples(db, row.servicos);
    const p = parseSqlLocalDateTime(base);
    if (!p) throw new Error('Horário âncora inválido');
    const iniLine = base;
    const fimLine = formatSqlLocalDateTime(
      addMinutesToParts(p, duracaoCatalogoMin(dm)),
    );
    cursorGlobal = fimLine;
    plans.push({ id: row.id, inicio: iniLine, fim: fimLine });
    if (iniLine < primeiroInicio) primeiroInicio = iniLine;
    if (fimLine > ultimoFim) ultimoFim = fimLine;
  }

  for (const plan of plans) {
    const row = linhas.find((l) => l.id === plan.id);
    if (!row) continue;
    const patch: {
      data: string;
      agendaStatus: string;
      inicio: string | null;
      fim: string | null;
      idCliente?: string;
      nomeCliente?: string;
    } = {
      data,
      agendaStatus,
      inicio: plan.inicio,
      fim: plan.fim,
    };
    if (clienteIdNovo) {
      patch.idCliente = clienteIdNovo;
      const nomeExistente = String(row.nomeCliente ?? '').trim();
      if (nomeExistente) patch.nomeCliente = nomeExistente;
    }
    await db
      .update(atendimentos)
      .set(patch)
      .where(eq(atendimentos.id, plan.id));
  }

  return {
    id_atendimento: id,
    modo: 'producao',
    data,
    inicio: primeiroInicio,
    fim: ultimoFim,
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
