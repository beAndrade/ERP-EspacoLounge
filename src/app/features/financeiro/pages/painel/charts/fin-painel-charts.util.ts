import type { AtendimentoListaItem } from '../../../../../core/models/api.models';
import {
  totalLinhaPreferencialAtendimento,
  valorMonetarioParaNumero,
} from '../../../../../core/utils/atendimento-display';
import type { FinTransacaoLinhaUi } from '../../transacoes/fin-transacoes.mapper';
import type {
  ChartPoint2D,
  FinChartLayout,
  FluxoBarGeom,
  FluxoDiaPonto,
  VendasBarGeom,
  VendasDiaPonto,
} from './fin-painel-charts.model';

export type MetodoPagamentoGrupo = 'pix' | 'cartao' | 'dinheiro' | 'outro';

/** Classifica método de pagamento em grupos do tooltip de fluxo. */
export function classificarMetodoPagamento(
  metodo: string | null | undefined,
): MetodoPagamentoGrupo {
  const m = String(metodo ?? '')
    .trim()
    .toLowerCase()
    .normalize('NFD')
    .replace(/\p{M}/gu, '')
    .replace(/\s+/g, '_');
  if (!m) return 'outro';
  if (m.includes('pix')) return 'pix';
  if (m.includes('dinheiro') || m === 'especie' || m === 'cash') return 'dinheiro';
  if (
    m.includes('cartao') ||
    m.includes('credito') ||
    m.includes('debito') ||
    m.includes('credit') ||
    m.includes('debit')
  ) {
    return 'cartao';
  }
  return 'outro';
}

export function ymdParaLabelCurto(ymd: string): string {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(ymd.trim().slice(0, 10));
  if (!m) return ymd;
  return `${m[3]}/${m[2]}`;
}

export function ymdParaLabelLongo(ymd: string): string {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(ymd.trim().slice(0, 10));
  if (!m) return ymd;
  return `${m[3]}/${m[2]}/${m[1]}`;
}

function enumerarDiasYmd(inicioYmd: string, fimYmd: string): string[] {
  const ini = inicioYmd.trim().slice(0, 10);
  const fim = fimYmd.trim().slice(0, 10);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(ini) || !/^\d{4}-\d{2}-\d{2}$/.test(fim)) {
    return [];
  }
  if (ini > fim) return [];
  const out: string[] = [];
  const d = new Date(`${ini}T12:00:00`);
  const end = new Date(`${fim}T12:00:00`);
  while (d <= end) {
    const y = d.getFullYear();
    const mo = String(d.getMonth() + 1).padStart(2, '0');
    const da = String(d.getDate()).padStart(2, '0');
    out.push(`${y}-${mo}-${da}`);
    d.setDate(d.getDate() + 1);
  }
  return out;
}

interface FluxoDiaBucket {
  entradas: number;
  saidas: number;
  qtdMovimentacoes: number;
  qtdRecebimentos: number;
  qtdPagamentos: number;
  recebidoPix: number;
  recebidoCartao: number;
  recebidoDinheiro: number;
}

function emptyFluxoBucket(): FluxoDiaBucket {
  return {
    entradas: 0,
    saidas: 0,
    qtdMovimentacoes: 0,
    qtdRecebimentos: 0,
    qtdPagamentos: 0,
    recebidoPix: 0,
    recebidoCartao: 0,
    recebidoDinheiro: 0,
  };
}

/**
 * Agrega lançamentos **pagos** por dia de pagamento.
 * Usa `pagoEmYmd` (fallback `dataYmd`) — base realizada.
 */
export function construirSerieFluxo(
  linhas: FinTransacaoLinhaUi[],
  periodo?: { inicioYmd: string; fimYmd: string },
): FluxoDiaPonto[] {
  const buckets = new Map<string, FluxoDiaBucket>();

  for (const row of linhas) {
    if (row.status !== 'pago') continue;
    const ymd = (row.pagoEmYmd || row.dataYmd || '').trim().slice(0, 10);
    if (!/^\d{4}-\d{2}-\d{2}$/.test(ymd)) continue;
    if (periodo) {
      if (ymd < periodo.inicioYmd || ymd > periodo.fimYmd) continue;
    }

    let b = buckets.get(ymd);
    if (!b) {
      b = emptyFluxoBucket();
      buckets.set(ymd, b);
    }

    const valor = Math.max(0, row.valorBruto || 0);
    b.qtdMovimentacoes += 1;

    if (row.linhaReceita === true) {
      b.entradas += valor;
      b.qtdRecebimentos += 1;
      const grupo = classificarMetodoPagamento(row.formaPagamento);
      if (grupo === 'pix') b.recebidoPix += valor;
      else if (grupo === 'cartao') b.recebidoCartao += valor;
      else if (grupo === 'dinheiro') b.recebidoDinheiro += valor;
    } else {
      b.saidas += valor;
      b.qtdPagamentos += 1;
    }
  }

  const dias =
    periodo != null
      ? enumerarDiasYmd(periodo.inicioYmd, periodo.fimYmd)
      : [...buckets.keys()].sort();

  const base: Omit<FluxoDiaPonto, 'saldoAcumulado'>[] = dias.map((ymd) => {
    const b = buckets.get(ymd) ?? emptyFluxoBucket();
    return {
      ymd,
      label: ymdParaLabelCurto(ymd),
      entradas: b.entradas,
      saidas: b.saidas,
      qtdMovimentacoes: b.qtdMovimentacoes,
      qtdRecebimentos: b.qtdRecebimentos,
      qtdPagamentos: b.qtdPagamentos,
      recebidoPix: b.recebidoPix,
      recebidoCartao: b.recebidoCartao,
      recebidoDinheiro: b.recebidoDinheiro,
    };
  });

  return calcularSaldoAcumulado(base);
}

/** Saldo acumulado real: Σ(entradas − saídas) dia a dia. */
export function calcularSaldoAcumulado(
  serie: Omit<FluxoDiaPonto, 'saldoAcumulado'>[],
): FluxoDiaPonto[] {
  let saldo = 0;
  return serie.map((p) => {
    saldo += p.entradas - p.saidas;
    return { ...p, saldoAcumulado: saldo };
  });
}

function atendimentoPago(row: AtendimentoListaItem): boolean {
  const s = String(row.pagamentoStatus ?? '')
    .trim()
    .toLowerCase();
  return s === 'confirmado' || s === 'pago' || s === 'pago_confirmado';
}

function nomeServicoLinha(row: AtendimentoListaItem): string | null {
  const itens = row.itens_catalogo ?? row.itens ?? [];
  for (const it of itens) {
    if (it.tipo === 'servico') {
      const ref = String(row.servicosRef ?? '').trim();
      if (ref) return ref;
    }
    if (it.tipo === 'pacote' || it.tipo === 'mega') {
      const pac = String(it.pacote ?? row.pacote ?? '').trim();
      if (pac) return pac;
    }
    if (it.tipo === 'produto') {
      const prod = String(row.produtoNome ?? '').trim();
      if (prod) return prod;
    }
    if (it.tipo === 'cabelo') {
      const det = String(it.detalhes ?? '').trim();
      if (det) return det;
    }
  }
  const serv = String(row.servicosRef ?? '').trim();
  if (serv) return serv;
  const prod = String(row.produtoNome ?? '').trim();
  if (prod) return prod;
  const pac = String(row.pacote ?? '').trim();
  if (pac) return pac;
  const desc = String(row.descricao ?? '').trim();
  if (desc && desc !== '—') return desc;
  return null;
}

interface VendasDiaBucket {
  receita: number;
  qtdVendas: number;
  profCount: Map<string, number>;
  servCount: Map<string, number>;
}

/**
 * Agrega atendimentos pagos por dia.
 * Conta pedidos (id) únicos no dia; receita soma totais das linhas.
 */
export function construirSerieVendas(
  atendimentos: AtendimentoListaItem[],
  periodo?: { inicioYmd: string; fimYmd: string },
): VendasDiaPonto[] {
  const buckets = new Map<string, VendasDiaBucket>();
  const pedidosContados = new Set<string>();

  for (const row of atendimentos) {
    if (!atendimentoPago(row)) continue;
    const ymd = String(row.data ?? '')
      .trim()
      .slice(0, 10);
    if (!/^\d{4}-\d{2}-\d{2}$/.test(ymd)) continue;
    if (periodo) {
      if (ymd < periodo.inicioYmd || ymd > periodo.fimYmd) continue;
    }

    let b = buckets.get(ymd);
    if (!b) {
      b = {
        receita: 0,
        qtdVendas: 0,
        profCount: new Map(),
        servCount: new Map(),
      };
      buckets.set(ymd, b);
    }

    const valor = totalLinhaPreferencialAtendimento(row);
    const n = valor != null ? Math.max(0, valor) : 0;
    b.receita += n;

    const pedidoId = String(row.id ?? '').trim() || `linha-${row.linha_id ?? ''}`;
    const chavePedido = `${ymd}|${pedidoId}`;
    if (!pedidosContados.has(chavePedido)) {
      pedidosContados.add(chavePedido);
      b.qtdVendas += 1;
    }

    const prof = String(row.profissional ?? '').trim();
    if (prof) {
      b.profCount.set(prof, (b.profCount.get(prof) ?? 0) + n);
    }

    const serv = nomeServicoLinha(row);
    if (serv) {
      b.servCount.set(serv, (b.servCount.get(serv) ?? 0) + 1);
    }
  }

  const dias =
    periodo != null
      ? enumerarDiasYmd(periodo.inicioYmd, periodo.fimYmd)
      : [...buckets.keys()].sort();

  const serie: Omit<VendasDiaPonto, 'acimaDaMedia'>[] = dias.map((ymd) => {
    const b = buckets.get(ymd);
    const receita = b?.receita ?? 0;
    const qtdVendas = b?.qtdVendas ?? 0;
    return {
      ymd,
      label: ymdParaLabelCurto(ymd),
      receita,
      qtdVendas,
      ticketMedio: qtdVendas > 0 ? receita / qtdVendas : 0,
      melhorProfissional: melhorChavePorValor(b?.profCount),
      servicoMaisVendido: melhorChavePorValor(b?.servCount),
    };
  });

  return marcarAcimaDaMedia(serie);
}

function melhorChavePorValor(map: Map<string, number> | undefined): string | null {
  if (!map || map.size === 0) return null;
  let best: string | null = null;
  let bestVal = -Infinity;
  for (const [k, v] of map) {
    if (v > bestVal) {
      bestVal = v;
      best = k;
    }
  }
  return best;
}

export function mediaPeriodo(serie: { receita: number }[]): number {
  if (!serie.length) return 0;
  const soma = serie.reduce((acc, p) => acc + p.receita, 0);
  return soma / serie.length;
}

export function marcarAcimaDaMedia(
  serie: Omit<VendasDiaPonto, 'acimaDaMedia'>[],
): VendasDiaPonto[] {
  const media = mediaPeriodo(serie);
  return serie.map((p) => ({
    ...p,
    acimaDaMedia: p.receita > media && media > 0,
  }));
}

/** Gera path SVG com interpolação monotone cubic (Fritsch-Carlson). */
export function pathLinhaMonotone(pontos: ChartPoint2D[]): string {
  if (pontos.length === 0) return '';
  if (pontos.length === 1) {
    const p = pontos[0]!;
    return `M${p.x},${p.y}`;
  }

  const xs = pontos.map((p) => p.x);
  const ys = pontos.map((p) => p.y);
  const n = pontos.length;
  const dx: number[] = [];
  const dy: number[] = [];
  const m: number[] = [];

  for (let i = 0; i < n - 1; i++) {
    dx[i] = xs[i + 1]! - xs[i]!;
    dy[i] = ys[i + 1]! - ys[i]!;
    m[i] = dx[i]! === 0 ? 0 : dy[i]! / dx[i]!;
  }

  const slopes: number[] = new Array(n);
  slopes[0] = m[0]!;
  slopes[n - 1] = m[n - 2]!;
  for (let i = 1; i < n - 1; i++) {
    if (m[i - 1]! * m[i]! <= 0) {
      slopes[i] = 0;
    } else {
      slopes[i] = (m[i - 1]! + m[i]!) / 2;
    }
  }

  for (let i = 0; i < n - 1; i++) {
    if (Math.abs(m[i]!) < 1e-12) {
      slopes[i] = 0;
      slopes[i + 1] = 0;
    } else {
      const a = slopes[i]! / m[i]!;
      const b = slopes[i + 1]! / m[i]!;
      const s = a * a + b * b;
      if (s > 9) {
        const t = 3 / Math.sqrt(s);
        slopes[i] = t * a * m[i]!;
        slopes[i + 1] = t * b * m[i]!;
      }
    }
  }

  let d = `M${xs[0]},${ys[0]}`;
  for (let i = 0; i < n - 1; i++) {
    const x0 = xs[i]!;
    const y0 = ys[i]!;
    const x1 = xs[i + 1]!;
    const y1 = ys[i + 1]!;
    const dxSeg = dx[i]!;
    const cp1x = x0 + dxSeg / 3;
    const cp1y = y0 + (slopes[i]! * dxSeg) / 3;
    const cp2x = x1 - dxSeg / 3;
    const cp2y = y1 - (slopes[i + 1]! * dxSeg) / 3;
    d += ` C${cp1x},${cp1y} ${cp2x},${cp2y} ${x1},${y1}`;
  }
  return d;
}

export function pathAreaSobLinha(
  pontos: ChartPoint2D[],
  baselineY: number,
): string {
  if (pontos.length === 0) return '';
  const line = pathLinhaMonotone(pontos);
  const first = pontos[0]!;
  const last = pontos[pontos.length - 1]!;
  return `${line} L${last.x},${baselineY} L${first.x},${baselineY} Z`;
}

export function niceTicks(min: number, max: number, count = 4): number[] {
  if (!Number.isFinite(min) || !Number.isFinite(max)) return [0];
  if (min === max) {
    const pad = Math.abs(min) || 1;
    return niceTicks(min - pad, max + pad, count);
  }
  const span = max - min;
  const step0 = span / Math.max(1, count);
  const mag = Math.pow(10, Math.floor(Math.log10(Math.abs(step0))));
  const norm = step0 / mag;
  let step = mag;
  if (norm >= 5) step = 5 * mag;
  else if (norm >= 2) step = 2 * mag;
  else step = mag;

  const start = Math.floor(min / step) * step;
  const end = Math.ceil(max / step) * step;
  const ticks: number[] = [];
  for (let v = start; v <= end + step * 0.5; v += step) {
    ticks.push(Number(v.toPrecision(12)));
  }
  return ticks.length ? ticks : [min, max];
}

export function formatMoedaCurta(n: number): string {
  return new Intl.NumberFormat('pt-BR', {
    style: 'currency',
    currency: 'BRL',
    maximumFractionDigits: n % 1 === 0 ? 0 : 2,
  }).format(n);
}

/** Eixo Y dos gráficos (números limpos, como no padrão Belasis). */
export function formatEixo(n: number): string {
  return new Intl.NumberFormat('pt-BR', {
    maximumFractionDigits: Math.abs(n) >= 1000 ? 0 : n % 1 === 0 ? 0 : 2,
  }).format(n);
}

/** Domínio placeholder quando não há movimentação no período. */
export function dominioVazioTicks(): number[] {
  return [0, 1, 2, 3, 4];
}

export function formatMoeda(n: number): string {
  return new Intl.NumberFormat('pt-BR', {
    style: 'currency',
    currency: 'BRL',
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(n);
}

export function layoutFluxoBars(
  serie: FluxoDiaPonto[],
  layout: FinChartLayout,
): {
  bars: FluxoBarGeom[];
  linePoints: ChartPoint2D[];
  yMin: number;
  yMax: number;
  ticks: number[];
  innerH: number;
  innerW: number;
  plotBottom: number;
} {
  const { width, height, pad } = layout;
  const innerW = Math.max(1, width - pad.l - pad.r);
  const innerH = Math.max(1, height - pad.t - pad.b);
  const plotBottom = pad.t + innerH;

  if (!serie.length) {
    const ticks = dominioVazioTicks();
    return {
      bars: [],
      linePoints: [],
      yMin: 0,
      yMax: 4,
      ticks,
      innerH,
      innerW,
      plotBottom,
    };
  }

  const maxBar = Math.max(
    ...serie.map((p) => Math.max(p.entradas, p.saidas)),
    0,
  );
  const saldos = serie.map((p) => p.saldoAcumulado);
  const minSaldo = Math.min(...saldos, 0);
  const maxSaldo = Math.max(...saldos, 0);
  const vazio = maxBar === 0 && maxSaldo === 0 && minSaldo === 0;
  const yMin = vazio ? 0 : Math.min(0, minSaldo);
  const yMax = vazio ? 4 : Math.max(maxSaldo, maxBar, 1);
  const ticks = vazio ? dominioVazioTicks() : niceTicks(yMin, yMax, 4);
  const domainMin = ticks[0] ?? yMin;
  const domainMax = ticks[ticks.length - 1] ?? yMax;
  const span = domainMax - domainMin || 1;

  const gap = Math.max(2, innerW / serie.length / 10);
  const slot = innerW / serie.length;
  const pairW = Math.min(28, Math.max(8, slot - gap));
  const barW = Math.max(3, (pairW - 2) / 2);

  const yOf = (v: number) => pad.t + innerH - ((v - domainMin) / span) * innerH;

  const bars: FluxoBarGeom[] = serie.map((p, i) => {
    const cx = pad.l + slot * i + slot / 2;
    const xEntrada = cx - pairW / 2;
    const xSaida = cx + 1;
    const hEntrada = Math.max(0, ((p.entradas - 0) / span) * innerH);
    const hSaida = Math.max(0, ((p.saidas - 0) / span) * innerH);
    /** Barras ancoradas em zero (ou domainMin se zero estiver abaixo). */
    const zeroY = yOf(Math.max(0, domainMin));
    return {
      ymd: p.ymd,
      i,
      xEntrada,
      xSaida,
      yEntrada: zeroY - hEntrada,
      ySaida: zeroY - hSaida,
      w: barW,
      hEntrada: Math.max(hEntrada, p.entradas > 0 ? 1 : 0),
      hSaida: Math.max(hSaida, p.saidas > 0 ? 1 : 0),
      cx,
    };
  });

  const linePoints: ChartPoint2D[] = serie.map((p, i) => ({
    x: pad.l + slot * i + slot / 2,
    y: yOf(p.saldoAcumulado),
  }));

  return {
    bars,
    linePoints,
    yMin: domainMin,
    yMax: domainMax,
    ticks,
    innerH,
    innerW,
    plotBottom,
  };
}

export function layoutVendasBars(
  serie: VendasDiaPonto[],
  layout: FinChartLayout,
  media: number,
): {
  bars: VendasBarGeom[];
  ticks: number[];
  yMax: number;
  mediaY: number | null;
  innerH: number;
  innerW: number;
  plotBottom: number;
} {
  const { width, height, pad } = layout;
  const innerW = Math.max(1, width - pad.l - pad.r);
  const innerH = Math.max(1, height - pad.t - pad.b);
  const plotBottom = pad.t + innerH;

  if (!serie.length) {
    return {
      bars: [],
      ticks: dominioVazioTicks(),
      yMax: 4,
      mediaY: null,
      innerH,
      innerW,
      plotBottom,
    };
  }

  const maxRec = Math.max(...serie.map((p) => p.receita), 0);
  const vazio = maxRec === 0;
  const ticks = vazio
    ? dominioVazioTicks()
    : niceTicks(0, Math.max(maxRec, media, 1), 4);
  const yMax = ticks[ticks.length - 1] ?? (vazio ? 4 : maxRec);
  const span = yMax || 1;
  const gap = Math.max(2, innerW / serie.length / 8);
  const slot = innerW / serie.length;
  const barW = Math.min(36, Math.max(6, slot - gap));

  const bars: VendasBarGeom[] = serie.map((p, i) => {
    const h = (p.receita / span) * innerH;
    const x = pad.l + slot * i + (slot - barW) / 2;
    const y = pad.t + innerH - h;
    return {
      ymd: p.ymd,
      i,
      x,
      y,
      w: barW,
      h: Math.max(h, p.receita > 0 ? 1 : 0),
      acimaDaMedia: p.acimaDaMedia,
    };
  });

  const mediaY = media > 0 ? pad.t + innerH - (media / span) * innerH : null;

  return { bars, ticks, yMax, mediaY, innerH, innerW, plotBottom };
}

/**
 * Totais de cards a partir de linhas do período (ou de um dia).
 * Mantém a mesma lógica de `valorCardVisaoPeriodo`.
 */
export function totaisDeLinhas(linhas: FinTransacaoLinhaUi[]): {
  recebidos: number;
  aReceber: number;
  pagos: number;
  aPagar: number;
} {
  let recebidos = 0;
  let aReceber = 0;
  let pagos = 0;
  let aPagar = 0;
  for (const row of linhas) {
    const v = row.valorBruto;
    const receita = row.linhaReceita === true;
    const pago = row.status === 'pago';
    if (receita) {
      if (pago) recebidos += v;
      else aReceber += v;
    } else if (pago) {
      pagos += v;
    } else {
      aPagar += v;
    }
  }
  return { recebidos, aReceber, pagos, aPagar };
}

export function filtrarLinhasDoDia(
  linhas: FinTransacaoLinhaUi[],
  ymd: string,
): FinTransacaoLinhaUi[] {
  const dia = ymd.trim().slice(0, 10);
  return linhas.filter((row) => {
    if (row.status === 'pago') {
      const ref = (row.pagoEmYmd || row.dataYmd || '').slice(0, 10);
      return ref === dia;
    }
    return row.dataYmd.slice(0, 10) === dia;
  });
}
