import {
  Component,
  computed,
  inject,
  input,
  signal,
} from '@angular/core';
import type { PainelTicketMedioVm } from '../../models/painel-dashboard.models';
import { PainelChartTooltipService } from '../../services/painel-chart-tooltip.service';
import { niceYAxis } from '../../utils/painel-chart-scale.util';

/** Barra com base reta e só os cantos superiores arredondados. */
function barraTopoArredondada(
  x: number,
  y: number,
  w: number,
  h: number,
  r: number,
): string {
  const rr = Math.min(r, w / 2, h);
  if (h <= 0) return '';
  if (rr <= 0) {
    return `M ${x} ${y + h} H ${x + w} V ${y} H ${x} Z`;
  }
  return [
    `M ${x} ${y + h}`,
    `L ${x} ${y + rr}`,
    `Q ${x} ${y} ${x + rr} ${y}`,
    `L ${x + w - rr} ${y}`,
    `Q ${x + w} ${y} ${x + w} ${y + rr}`,
    `L ${x + w} ${y + h}`,
    'Z',
  ].join(' ');
}

@Component({
  selector: 'app-painel-ticket-medio-panel',
  standalone: true,
  templateUrl: './painel-ticket-medio-panel.component.html',
  styleUrl: './painel-ticket-medio-panel.component.scss',
})
export class PainelTicketMedioPanelComponent {
  private readonly tip = inject(PainelChartTooltipService);

  readonly vm = input<PainelTicketMedioVm>({
    ticketAtual: null,
    vsAnteriorPct: null,
    periodoAnterior: null,
    periodoAtual: null,
    qtdAnterior: 0,
    qtdAtual: 0,
    totalAnterior: 0,
    totalAtual: 0,
  });

  readonly activeIndex = signal<number | null>(null);

  readonly hasData = computed(
    () => this.vm().periodoAtual != null || this.vm().periodoAnterior != null,
  );

  readonly vbW = 320;
  readonly vbH = 176;
  readonly pad = { t: 16, r: 14, b: 40, l: 52 };
  readonly axisTick = 5;

  /** Eixo Y adaptativo: valores altos → menos ticks, passo maior. */
  private readonly yScale = computed(() => {
    const { periodoAnterior, periodoAtual } = this.vm();
    const raw = Math.max(periodoAnterior ?? 0, periodoAtual ?? 0);
    return niceYAxis(raw, 4);
  });

  readonly niceMax = computed(() => this.yScale().max);

  readonly yTicks = computed(() => this.yScale().ticks);

  readonly gridLines = computed(() => {
    const max = this.niceMax() || 1;
    const innerH = this.vbH - this.pad.t - this.pad.b;
    return this.yTicks().map((value) => ({
      value,
      y: this.pad.t + innerH * (1 - value / max),
    }));
  });

  readonly plotBottom = computed(() => this.vbH - this.pad.b);
  readonly plotTop = computed(() => this.pad.t);
  readonly plotLeft = computed(() => this.pad.l);
  readonly plotRight = computed(() => this.vbW - this.pad.r);

  readonly bars = computed(() => {
    const v = this.vm();
    const pts = [
      {
        label: 'Período anterior',
        value: v.periodoAnterior ?? 0,
        qtd: v.qtdAnterior,
        total: v.totalAnterior,
        atual: false,
      },
      {
        label: 'Período atual',
        value: v.periodoAtual ?? 0,
        qtd: v.qtdAtual,
        total: v.totalAtual,
        atual: true,
      },
    ];
    const niceMax = this.niceMax();
    const innerW = this.vbW - this.pad.l - this.pad.r;
    const innerH = this.vbH - this.pad.t - this.pad.b;
    const bandW = innerW / 2;
    /**
     * Largura alvo ~79.92px no layout de referência (banda hover ~199px).
     * Usa proporção da banda para manter a torre nessa escala visual.
     */
    const bw = bandW * (79.92 / 199);
    /** Raio do topo ~14px no mesmo layout de referência. */
    const barRadius = bandW * (14 / 199);
    return pts.map((p, i) => {
      const h = p.value > 0 ? (p.value / niceMax) * innerH : 0;
      const bandX = this.pad.l + i * bandW;
      const x = bandX + (bandW - bw) / 2;
      const y = this.pad.t + innerH - h;
      const barH = Math.max(h, p.value > 0 ? 2 : 0);
      return {
        ...p,
        i,
        bandX,
        bandW,
        x,
        y,
        w: bw,
        h: barH,
        cx: x + bw / 2,
        path: barraTopoArredondada(x, y, bw, barH, barRadius),
      };
    });
  });

  onEnter(ev: MouseEvent, i: number): void {
    const b = this.bars()[i];
    if (!b) return;
    this.activeIndex.set(i);
    this.tip.show({
      dataLabel: b.label,
      rows: [
        { label: 'Ticket médio', value: this.formatMoeda(b.value) },
        { label: 'Número de comandas', value: String(b.qtd) },
        { label: 'Total', value: this.formatMoeda(b.total) },
      ],
      x: ev.clientX,
      y: ev.clientY,
    });
  }

  onMove(ev: MouseEvent): void {
    this.tip.move(ev.clientX, ev.clientY);
  }

  onLeave(): void {
    this.activeIndex.set(null);
    this.tip.hide();
  }

  formatMoeda(valor: number | null): string {
    if (valor == null) return '—';
    return new Intl.NumberFormat('pt-BR', {
      style: 'currency',
      currency: 'BRL',
    }).format(valor);
  }

  formatMoedaCurta(valor: number): string {
    return new Intl.NumberFormat('pt-BR', {
      style: 'currency',
      currency: 'BRL',
      maximumFractionDigits: 0,
    }).format(valor);
  }

  formatPct(pct: number | null): string {
    if (pct == null) return '—';
    return `${Math.abs(pct)}%`;
  }
}
