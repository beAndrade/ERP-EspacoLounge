import {
  AfterViewInit,
  Component,
  ElementRef,
  OnDestroy,
  computed,
  inject,
  input,
  signal,
  viewChild,
} from '@angular/core';
import type { PainelTicketMedioVm } from '../../models/painel-dashboard.models';
import { PainelChartTooltipService, boundsFromElement } from '../../services/painel-chart-tooltip.service';
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
export class PainelTicketMedioPanelComponent implements AfterViewInit, OnDestroy {
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

  readonly plotRef = viewChild<ElementRef<HTMLElement>>('plot');
  readonly width = signal(500);
  readonly height = signal(275);
  readonly activeIndex = signal<number | null>(null);

  private ro: ResizeObserver | null = null;

  readonly hasData = computed(
    () => this.vm().periodoAtual != null || this.vm().periodoAnterior != null,
  );

  readonly pad = { t: 16, r: 14, b: 40, l: 64 };
  readonly axisTick = 5;
  /** Tipografia dos marcadores (1:1 com CSS px via viewBox dinâmico). */
  readonly markerFill = '#000000bf';
  readonly markerFontSize = 12;

  /** Eixo Y adaptativo: valores altos → menos ticks, passo maior. */
  private readonly yScale = computed(() => {
    const { periodoAnterior, periodoAtual } = this.vm();
    const raw = Math.max(periodoAnterior ?? 0, periodoAtual ?? 0);
    return niceYAxis(raw, 4);
  });

  readonly niceMax = computed(() => this.yScale().max);
  readonly yTicks = computed(() => this.yScale().ticks);

  readonly innerW = computed(() => this.width() - this.pad.l - this.pad.r);
  readonly innerH = computed(() => this.height() - this.pad.t - this.pad.b);
  readonly plotBottom = computed(() => this.pad.t + this.innerH());
  readonly plotTop = computed(() => this.pad.t);
  readonly plotLeft = computed(() => this.pad.l);
  readonly plotRight = computed(() => this.width() - this.pad.r);

  readonly gridLines = computed(() => {
    const max = this.niceMax() || 1;
    return this.yTicks().map((value) => ({
      value,
      y: this.pad.t + this.innerH() * (1 - value / max),
    }));
  });

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
    const bandW = this.innerW() / 2;
    const bw = Math.min(79.92, bandW * 0.72);
    const barRadius = 14;
    return pts.map((p, i) => {
      const h = p.value > 0 ? (p.value / niceMax) * this.innerH() : 0;
      const bandX = this.pad.l + i * bandW;
      const x = bandX + (bandW - bw) / 2;
      const y = this.pad.t + this.innerH() - h;
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

  ngAfterViewInit(): void {
    const el = this.plotRef()?.nativeElement;
    if (!el) return;
    this.ro = new ResizeObserver((entries) => {
      const cr = entries[0]?.contentRect;
      if (!cr) return;
      const w = Math.max(280, Math.floor(cr.width));
      const h =
        cr.height > 40
          ? Math.max(180, Math.floor(cr.height))
          : Math.max(200, Math.round(w * 0.55));
      this.width.set(w);
      this.height.set(h);
    });
    this.ro.observe(el);
  }

  ngOnDestroy(): void {
    this.ro?.disconnect();
  }

  onEnter(ev: MouseEvent, i: number): void {
    const b = this.bars()[i];
    if (!b) return;
    this.activeIndex.set(i);
    const plot = this.plotRef()?.nativeElement;
    this.tip.show({
      dataLabel: b.label,
      rows: [
        { label: 'Ticket médio', value: this.formatMoeda(b.value) },
        { label: 'Número de comandas', value: String(b.qtd) },
        { label: 'Total', value: this.formatMoeda(b.total) },
      ],
      x: ev.clientX,
      y: ev.clientY,
      bounds: plot ? boundsFromElement(plot) : undefined,
    });
  }

  onMove(ev: MouseEvent): void {
    const plot = this.plotRef()?.nativeElement;
    this.tip.move(
      ev.clientX,
      ev.clientY,
      plot ? boundsFromElement(plot) : undefined,
    );
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
