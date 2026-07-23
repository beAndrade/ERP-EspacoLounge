import type { AtendimentoListaItem, CaixaDiaResumo } from '../../../core/models/api.models';
import {
  diaCivilReferenciaHorarioGrupo,
  horaInicialMenorDasLinhasAtendimento,
  pedidoTemPosicaoNaGrelhaAgenda,
  toYmd,
  totalLinhaPreferencialAtendimento,
  valorMonetarioParaNumero,
} from '../../../core/utils/atendimento-display';
import { normalizarHoraHHmm } from '../../../core/utils/brasilia-time';
import {
  parseSqlLocalDateTime,
  ymdOfParts,
} from '../../../core/utils/sql-local-datetime';
import {
  AGENDA_STATUS_META,
  inferirAgendaStatusPorCorHex,
  normalizarAgendaStatusId,
  type AgendaStatusId,
} from '../../../core/utils/agenda-status-card';
import { particionarLinhasPedidoEmCartoesAgenda } from '../../../core/utils/agenda-cartao-particao';
import {
  agruparAtendimentosEmComandas,
  comandaQuitadaNasCifrasGrupo,
} from '../../../core/utils/comanda-status.util';
import type {
  PainelAgendaCardVm,
  PainelAgendaProximoItem,
  PainelChartsVm,
  PainelChartPoint,
  PainelFaturamentoCardVm,
  PainelFaturamentoMetodoLinha,
  PainelProfissionaisPeriodoVm,
  PainelSparkPoint,
  PainelTicketMedioVm,
  PainelVendasCategoriaLinha,
  PainelVendasCategoriaVm,
} from '../models/painel-dashboard.models';

/** Agrupa linhas de atendimento pelo id do pedido. */
export function agruparAtendimentosPorPedido(
  linhas: AtendimentoListaItem[],
): Map<string, AtendimentoListaItem[]> {
  const map = new Map<string, AtendimentoListaItem[]>();
  for (const row of linhas) {
    const id = String(row.id ?? '').trim();
    if (!id) continue;
    const list = map.get(id);
    if (list) list.push(row);
    else map.set(id, [row]);
  }
  return map;
}

/**
 * Monta o VM do card Agenda de hoje a partir dos atendimentos do dia.
 * Mostra até 4 próximos (ordenados por hora).
 */
export function mapAtendimentosParaAgendaCardVm(
  linhas: AtendimentoListaItem[],
  dataYmd: string,
): PainelAgendaCardVm {
  const dia = dataYmd.trim().slice(0, 10);
  const grupos = agruparAtendimentosPorPedido(linhas);
  const proximos: PainelAgendaProximoItem[] = [];

  for (const [, rows] of grupos) {
    if (!pedidoTemPosicaoNaGrelhaAgenda(rows, dia)) continue;
    const hora = horaInicialMenorDasLinhasAtendimento(rows, dia);
    if (!hora) continue;
    const nome =
      rows.map((r) => String(r.nomeCliente ?? '').trim()).find(Boolean) ||
      'Cliente';
    const statusRaw = rows
      .map((r) => r.agenda_status)
      .find((s) => s != null && String(s).trim());
    const status = normalizarAgendaStatusId(statusRaw);
    proximos.push({
      hora,
      nome,
      confirmado: status === 'confirmado',
    });
  }

  proximos.sort((a, b) => a.hora.localeCompare(b.hora));

  return {
    total: proximos.length,
    proximos: proximos.slice(0, 4),
    spark: [],
  };
}

function rotuloMetodoPagamento(metodo: string): string {
  const m = metodo.trim().toLowerCase().replace(/\s+/g, '_');
  if (m === 'pix') return 'PIX';
  if (m === 'dinheiro') return 'Dinheiro';
  if (
    m.includes('cartao') ||
    m.includes('cartão') ||
    m === 'credito' ||
    m === 'debito'
  ) {
    return 'Cartão';
  }
  if (m === 'transferencia' || m === 'transferência') return 'Transferência';
  if (m === 'outros') return 'Outros';
  if (!m) return 'Outros';
  return metodo.trim() || 'Outros';
}

/** Receitas do dia via resumo de caixa (métodos reais, sem inventar). */
export function mapCaixaDiaParaFaturamentoCardVm(
  caixa: CaixaDiaResumo,
): PainelFaturamentoCardVm {
  const total = valorMonetarioParaNumero(caixa.total_receitas) ?? 0;
  const despesas = valorMonetarioParaNumero(caixa.total_despesas) ?? 0;
  const lucro = valorMonetarioParaNumero(caixa.saldo_dia);
  const porRotulo = new Map<string, number>();

  for (const row of caixa.receitas_por_metodo ?? []) {
    const rotulo = rotuloMetodoPagamento(String(row.metodo ?? ''));
    const valor = valorMonetarioParaNumero(row.total) ?? 0;
    porRotulo.set(rotulo, (porRotulo.get(rotulo) ?? 0) + valor);
  }

  const metodos: PainelFaturamentoMetodoLinha[] = [...porRotulo.entries()]
    .filter(([, v]) => v > 0)
    .map(([rotulo, valor]) => ({ rotulo, valor }))
    .sort((a, b) => b.valor - a.valor);

  return {
    total: Number.isFinite(total) ? total : null,
    despesas: Number.isFinite(despesas) ? despesas : null,
    lucro: lucro != null && Number.isFinite(lucro) ? lucro : total - despesas,
    qtdVendas: null,
    ticketMedio: null,
    vsOntemPct: null,
    metodos,
    spark: [],
  };
}

const HEATMAP_HORAS = [
  8, 9, 10, 11, 12, 13, 14, 15, 16, 17, 18, 19, 20, 21, 22, 23,
] as const;
const HEATMAP_DIAS_SEMANA = [
  'segunda-feira',
  'terça-feira',
  'quarta-feira',
  'quinta-feira',
  'sexta-feira',
  'sábado',
  'domingo',
] as const;

const TOP_PROFISSIONAIS = 8;

const STATUS_DISPLAY_ORDER: AgendaStatusId[] = [
  'aguardando',
  'confirmado',
  'cancelado',
  'nao_confirmado',
];

const COR_META_POR_STATUS = new Map(
  AGENDA_STATUS_META.map((m) => [m.id, m] as const),
);

function ymdNoIntervalo(ymd: string, inicio: string, fim: string): boolean {
  const d = ymd.trim().slice(0, 10);
  return d >= inicio && d <= fim;
}

function parseYmdLocal(ymd: string): Date {
  const [y, m, d] = ymd.split('-').map(Number);
  return new Date(y, m - 1, d);
}

/** Lista cada dia YYYY-MM-DD entre início e fim (inclusive). */
export function enumerarDiasYmd(inicio: string, fim: string): string[] {
  const di = parseYmdLocal(inicio);
  const df = parseYmdLocal(fim);
  const out: string[] = [];
  const cur = new Date(di);
  while (cur <= df) {
    out.push(toYmd(cur));
    cur.setDate(cur.getDate() + 1);
  }
  return out;
}

/** Período anterior com a mesma duração (dia anterior ao início como fim). */
export function periodoAnteriorSimetrico(
  inicio: string,
  fim: string,
): { inicio: string; fim: string } {
  const dias = enumerarDiasYmd(inicio, fim).length;
  const di = parseYmdLocal(inicio);
  const prevFim = new Date(di);
  prevFim.setDate(prevFim.getDate() - 1);
  const prevInicio = new Date(prevFim);
  prevInicio.setDate(prevInicio.getDate() - (dias - 1));
  return { inicio: toYmd(prevInicio), fim: toYmd(prevFim) };
}

function pctVariacao(
  atual: number | null,
  anterior: number | null,
): number | null {
  if (atual == null || anterior == null || anterior === 0) return null;
  return Math.round(((atual - anterior) / anterior) * 100);
}

function statusAgendaDoCartao(rows: AtendimentoListaItem[]): AgendaStatusId {
  const raw = rows
    .map((r) => r.agenda_status)
    .find((s) => s != null && String(s).trim());
  if (raw != null && String(raw).trim()) {
    return normalizarAgendaStatusId(raw);
  }
  const cor = rows
    .map((r) => r.agenda_cor)
    .find((c) => c != null && String(c).trim());
  return inferirAgendaStatusPorCorHex(cor) ?? 'confirmado';
}

/**
 * Cartões como na grelha da agenda: mesmo pedido parte por status/horário;
 * só entram linhas com posição na grelha (têm horário no dia).
 * Dia civil vem do `inicio` (não exige comanda / faturação).
 */
function cartoesAgendaNoIntervalo(
  linhas: AtendimentoListaItem[],
  inicio: string,
  fim: string,
): { data: string; status: AgendaStatusId; linhas: AtendimentoListaItem[] }[] {
  const grupos = agruparAtendimentosPorPedido(linhas);
  const out: {
    data: string;
    status: AgendaStatusId;
    linhas: AtendimentoListaItem[];
  }[] = [];
  for (const [, rows] of grupos) {
    const dataCabeca = (rows[0]?.data ?? '').slice(0, 10);
    const dia = diaCivilReferenciaHorarioGrupo(rows, dataCabeca);
    if (!/^\d{4}-\d{2}-\d{2}$/.test(dia)) continue;
    if (!ymdNoIntervalo(dia, inicio, fim)) continue;
    for (const part of particionarLinhasPedidoEmCartoesAgenda(
      rows,
      dia,
      'cartao',
    )) {
      if (!pedidoTemPosicaoNaGrelhaAgenda(part.linhas, dia)) continue;
      out.push({
        data: dia,
        status: statusAgendaDoCartao(part.linhas),
        linhas: part.linhas,
      });
    }
  }
  return out;
}

/**
 * Conta agendamentos com horário no período para o mapa de calor.
 * Bloco = piso da hora do `inicio`: 08:00–08:59 → 8h, 09:00–09:59 → 9h, etc.
 * Não depende de comanda faturada. Deduplica por pedido + dia + bloco.
 */
function contarHeatmapPorDiaHora(
  linhas: AtendimentoListaItem[],
  inicio: string,
  fim: string,
): Map<string, number> {
  const counts = new Map<string, number>();
  const vistos = new Set<string>();
  const horaMin = HEATMAP_HORAS[0];
  const horaMax = HEATMAP_HORAS[HEATMAP_HORAS.length - 1];

  for (const row of linhas) {
    const bucket = bucketHeatmapDeInicio(
      String(row.inicio ?? '').trim(),
      (row.data ?? '').slice(0, 10),
    );
    if (!bucket) continue;
    if (!ymdNoIntervalo(bucket.dia, inicio, fim)) continue;
    if (bucket.hora < horaMin || bucket.hora > horaMax) continue;

    const idPedido = String(row.id ?? '').trim();
    const idLinha =
      row.linha_id != null && Number.isFinite(row.linha_id)
        ? String(row.linha_id)
        : '';
    const dedupeKey = `${idPedido || `L:${idLinha}`}|${bucket.dia}|${bucket.hora}`;
    if (vistos.has(dedupeKey)) continue;
    vistos.add(dedupeKey);

    const diaIdx = indiceDiaSemanaSegunda(bucket.dia);
    const key = `${diaIdx}-${bucket.hora}`;
    counts.set(key, (counts.get(key) ?? 0) + 1);
  }

  return counts;
}

/**
 * Extrai dia civil + bloco horário a partir de `inicio`.
 * Minutos são ignorados (floor): 08:00…08:59 → bloco 8.
 */
function bucketHeatmapDeInicio(
  inicioRaw: string,
  dataFallbackYmd: string,
): { dia: string; hora: number } | null {
  const raw = inicioRaw.trim();
  if (!raw) return null;

  const p = parseSqlLocalDateTime(raw);
  if (p) {
    return { dia: ymdOfParts(p), hora: p.hh };
  }

  /** Fallback: só HH:mm (usa a coluna Data do atendimento). */
  const hhmm = normalizarHoraHHmm(raw);
  if (!hhmm) return null;
  const hora = parseInt(hhmm.slice(0, 2), 10);
  if (!Number.isFinite(hora)) return null;
  const dia = dataFallbackYmd.trim().slice(0, 10);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(dia)) return null;
  return { dia, hora };
}

function comandasNoIntervalo(
  linhas: AtendimentoListaItem[],
  inicio: string,
  fim: string,
) {
  return agruparAtendimentosEmComandas(linhas).filter((g) =>
    ymdNoIntervalo(g.data, inicio, fim),
  );
}

type TicketMedioStats = {
  ticket: number | null;
  qtd: number;
  total: number;
};

function statsComandasFaturadas(
  comandas: ReturnType<typeof agruparAtendimentosEmComandas>,
): TicketMedioStats {
  const faturadas = comandas.filter((g) => comandaQuitadaNasCifrasGrupo(g));
  if (!faturadas.length) return { ticket: null, qtd: 0, total: 0 };
  let sum = 0;
  for (const g of faturadas) {
    sum += g.valorTotal ?? 0;
  }
  return {
    ticket: Math.round((sum / faturadas.length) * 100) / 100,
    qtd: faturadas.length,
    total: Math.round(sum * 100) / 100,
  };
}

function labelDiaCurto(ymd: string): string {
  const d = parseYmdLocal(ymd);
  return new Intl.DateTimeFormat('pt-BR', {
    day: '2-digit',
    month: '2-digit',
  }).format(d);
}

/** Índice 0 = segunda-feira … 6 = domingo. */
function indiceDiaSemanaSegunda(ymd: string): number {
  const d = parseYmdLocal(ymd).getDay();
  return d === 0 ? 6 : d - 1;
}

const CATEGORIA_META: readonly { label: string; cor: string }[] = [
  { label: 'Serviços', cor: '#3b82f6' },
  { label: 'Produtos', cor: '#34d399' },
  { label: 'Pacotes', cor: '#f59e0b' },
  { label: 'Outros', cor: '#a78bfa' },
];

/** Mapeia o `tipo` da linha para uma categoria comercial amigável. */
function categoriaDaLinha(l: AtendimentoListaItem): string {
  const t = String(l.tipo ?? '').trim().toLowerCase();
  if (t === 'produto') return 'Produtos';
  if (t === 'pacote' || t === 'mega') return 'Pacotes';
  if (t === 'servico' || t === 'serviço' || t === 'cabelo') return 'Serviços';
  return 'Outros';
}

export type PainelPeriodoAgregadoVm = {
  charts: PainelChartsVm;
  ticketMedio: PainelTicketMedioVm;
  profissionais: PainelProfissionaisPeriodoVm;
  vendasCategoria: PainelVendasCategoriaVm;
};

/**
 * Agrega atendimentos do período (e opcionalmente do período anterior) para os painéis grandes.
 */
export function mapAtendimentosParaPainelPeriodo(
  linhas: AtendimentoListaItem[],
  inicio: string,
  fim: string,
): PainelPeriodoAgregadoVm {
  const prev = periodoAnteriorSimetrico(inicio, fim);
  const cartoes = cartoesAgendaNoIntervalo(linhas, inicio, fim);
  const cartoesAnterior = cartoesAgendaNoIntervalo(linhas, prev.inicio, prev.fim);
  const comandas = comandasNoIntervalo(linhas, inicio, fim);
  const comandasAnterior = comandasNoIntervalo(linhas, prev.inicio, prev.fim);

  const tendencia: PainelChartPoint[] = enumerarDiasYmd(inicio, fim).map((ymd) => {
    const count = cartoes.filter((c) => c.data === ymd).length;
    return { label: labelDiaCurto(ymd), value: count, ymd };
  });

  const statusCounts = new Map<AgendaStatusId, number>();
  for (const c of cartoes) {
    statusCounts.set(c.status, (statusCounts.get(c.status) ?? 0) + 1);
  }
  const statusTotal = cartoes.length;
  const status: PainelChartPoint[] = STATUS_DISPLAY_ORDER.map((id) => {
    const meta = COR_META_POR_STATUS.get(id)!;
    const count = statusCounts.get(id) ?? 0;
    const pct = statusTotal > 0 ? Math.round((count / statusTotal) * 100) : 0;
    return {
      label: meta.label,
      value: count,
      meta: { pct, cor: meta.cor },
    };
  });

  const todos = cartoes.length;
  const confirmados = cartoes.filter((c) => c.status === 'confirmado').length;
  const faturados = cartoes.filter((c) => {
    const id = String(c.linhas[0]?.id ?? '');
    const g = comandas.find(
      (cmd) => String(cmd.linhas[0]?.id ?? '') === id,
    );
    return g ? comandaQuitadaNasCifrasGrupo(g) : false;
  }).length;

  const pctOf = (n: number) => (todos > 0 ? Math.round((n / todos) * 100) : 0);
  const funil: PainelChartPoint[] =
    todos > 0
      ? [
          {
            label: 'Todos',
            value: todos,
            meta: { pctTotal: 100, display: `Todos: ${todos} (100%)` },
          },
          {
            label: 'Confirmados',
            value: confirmados,
            meta: {
              pctTotal: pctOf(confirmados),
              display: `Confirmados: ${confirmados} (${pctOf(confirmados)}%)`,
            },
          },
          {
            label: 'Faturados',
            value: faturados,
            meta: {
              pctTotal: pctOf(faturados),
              display: `Faturados: ${faturados} (${pctOf(faturados)}%)`,
            },
          },
        ]
      : [];

  const heatmapCounts = contarHeatmapPorDiaHora(linhas, inicio, fim);
  const heatmap: PainelChartPoint[] = [];
  for (let d = 0; d < HEATMAP_DIAS_SEMANA.length; d++) {
    for (const h of HEATMAP_HORAS) {
      const key = `${d}-${h}`;
      const value = heatmapCounts.get(key) ?? 0;
      heatmap.push({
        label: HEATMAP_DIAS_SEMANA[d],
        value,
        meta: { dia: HEATMAP_DIAS_SEMANA[d], hora: `${h}h`, diaIdx: d, horaIdx: h },
      });
    }
  }

  const statsAtual = statsComandasFaturadas(comandas);
  const statsAnterior = statsComandasFaturadas(comandasAnterior);
  const ticketMedio: PainelTicketMedioVm = {
    ticketAtual: statsAtual.ticket,
    vsAnteriorPct: pctVariacao(statsAtual.ticket, statsAnterior.ticket),
    periodoAnterior: statsAnterior.ticket,
    periodoAtual: statsAtual.ticket,
    qtdAnterior: statsAnterior.qtd,
    qtdAtual: statsAtual.qtd,
    totalAnterior: statsAnterior.total,
    totalAtual: statsAtual.total,
  };

  const isLinhaServico = (linha: AtendimentoListaItem) =>
    categoriaDaLinha(linha) === 'Serviços';

  const contarServicos = (
    grupos: ReturnType<typeof comandasNoIntervalo>,
  ): number => {
    let n = 0;
    for (const g of grupos) {
      for (const linha of g.linhas) {
        if (isLinhaServico(linha)) n += 1;
      }
    }
    return n;
  };

  const profMap = new Map<
    string,
    { nome: string; servicos: number; faturamento: number }
  >();
  for (const g of comandas) {
    for (const linha of g.linhas) {
      if (!isLinhaServico(linha)) continue;
      const nome = String(linha.profissional ?? '').trim() || 'Sem profissional';
      const key = nome.toLowerCase();
      const acc = profMap.get(key) ?? { nome, servicos: 0, faturamento: 0 };
      acc.servicos += 1;
      // Mesma base da contagem: todos os serviços do período (não só comandas quitadas).
      acc.faturamento += totalLinhaPreferencialAtendimento(linha) ?? 0;
      profMap.set(key, acc);
    }
  }
  const profLinhas = [...profMap.values()]
    .sort((a, b) => b.servicos - a.servicos || b.faturamento - a.faturamento)
    .slice(0, TOP_PROFISSIONAIS)
    .map((p, i) => ({
      rank: i + 1,
      nome: p.nome,
      servicos: p.servicos,
      valorMedio:
        p.servicos > 0
          ? Math.round((p.faturamento / p.servicos) * 100) / 100
          : null,
    }));

  /** Spark: 1 ponto por dia do período — só linhas de serviço. */
  const servicosPorDia = new Map<string, number>();
  for (const g of comandas) {
    const ymd = (g.data ?? '').slice(0, 10);
    if (!ymd) continue;
    for (const linha of g.linhas) {
      if (!isLinhaServico(linha)) continue;
      servicosPorDia.set(ymd, (servicosPorDia.get(ymd) ?? 0) + 1);
    }
  }
  const spark: PainelSparkPoint[] = enumerarDiasYmd(inicio, fim).map((ymd) => {
    const value = servicosPorDia.get(ymd) ?? 0;
    const [y, m, d] = ymd.split('-');
    const dataLabel =
      y && m && d ? `${d}/${m}/${y}` : labelDiaCurto(ymd);
    return {
      ymd,
      value,
      label: `${value} em ${dataLabel}`,
    };
  });

  const totalAtual = contarServicos(comandas);
  const totalAnterior = contarServicos(comandasAnterior);
  const profissionais: PainelProfissionaisPeriodoVm = {
    totalAtendimentos: totalAtual,
    totalPeriodoAnterior: totalAnterior,
    vsAnteriorPct: pctVariacao(totalAtual, totalAnterior),
    spark,
    linhas: profLinhas,
  };

  const catMap = new Map<string, number>();
  for (const g of comandas) {
    if (!comandaQuitadaNasCifrasGrupo(g)) continue;
    for (const linha of g.linhas) {
      const cat = categoriaDaLinha(linha);
      const valor = valorMonetarioParaNumero(linha.valor) ?? 0;
      if (valor <= 0) continue;
      catMap.set(cat, (catMap.get(cat) ?? 0) + valor);
    }
  }
  const catTotal = [...catMap.values()].reduce((s, v) => s + v, 0);
  const vendasLinhas: PainelVendasCategoriaLinha[] = CATEGORIA_META.filter(
    (m) => (catMap.get(m.label) ?? 0) > 0,
  ).map((m) => {
    const valor = Math.round((catMap.get(m.label) ?? 0) * 100) / 100;
    return {
      label: m.label,
      valor,
      pct: catTotal > 0 ? Math.round((valor / catTotal) * 100) : 0,
      cor: m.cor,
    };
  });
  vendasLinhas.sort((a, b) => b.valor - a.valor);
  const vendasCategoria: PainelVendasCategoriaVm = {
    total: Math.round(catTotal * 100) / 100,
    linhas: vendasLinhas,
  };

  return {
    charts: { tendencia, status, funil, heatmap },
    ticketMedio,
    profissionais,
    vendasCategoria,
  };
}
