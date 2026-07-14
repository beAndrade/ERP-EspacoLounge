import {
  AfterViewInit,
  Component,
  DestroyRef,
  ElementRef,
  OnDestroy,
  computed,
  effect,
  inject,
  input,
  output,
  signal,
  viewChild,
} from '@angular/core';
import type { FluxoDiaPonto } from './fin-painel-charts.model';
import { FinPainelChartTooltipComponent } from './fin-painel-chart-tooltip.component';
import { FinPainelChartTooltipService } from './fin-painel-chart-tooltip.service';
import {
  formatEixo,
  layoutFluxoBars,
  pathAreaSobLinha,
  pathLinhaMonotone,
} from './fin-painel-charts.util';

@Component({
  selector: 'app-fin-fluxo-caixa-chart',
  standalone: true,
  imports: [FinPainelChartTooltipComponent],
  providers: [FinPainelChartTooltipService],
  templateUrl: './fin-fluxo-caixa-chart.component.html',
  styleUrl: './fin-fluxo-caixa-chart.component.scss',
})
export class FinFluxoCaixaChartComponent implements AfterViewInit, OnDestroy {
  private readonly host = inject(ElementRef<HTMLElement>);
  private readonly destroyRef = inject(DestroyRef);
  private readonly tip = inject(FinPainelChartTooltipService);

  readonly series = input<FluxoDiaPonto[]>([]);
  /** Dia em foco (cross-hover externo ou hover local). */
  readonly activeDay = input<string | null>(null);

  readonly hoverDay = output<string | null>();

  readonly plotRef = viewChild<ElementRef<HTMLElement>>('plot');

  readonly width = signal(640);
  readonly height = signal(260);
  readonly localHoverYmd = signal<string | null>(null);
  readonly animated = signal(false);

  private ro: ResizeObserver | null = null;
  private animTimer: ReturnType<typeof setTimeout> | null = null;

  readonly pad = { t: 20, r: 20, b: 36, l: 52 };

  readonly effectiveDay = computed(
    () => this.localHoverYmd() ?? this.activeDay(),
  );

  readonly geom = computed(() =>
    layoutFluxoBars(this.series(), {
      width: this.width(),
      height: this.height(),
      pad: this.pad,
    }),
  );

  readonly linePath = computed(() => pathLinhaMonotone(this.geom().linePoints));

  readonly areaPath = computed(() =>
    pathAreaSobLinha(this.geom().linePoints, this.geom().plotBottom),
  );

  readonly gridLines = computed(() => {
    const g = this.geom();
    const span = g.yMax - g.yMin || 1;
    return g.ticks.map((t) => ({
      value: t,
      label: formatEixo(t),
      y: this.pad.t + g.innerH - ((t - g.yMin) / span) * g.innerH,
    }));
  });

  readonly verticalGrid = computed(() => {
    const g = this.geom();
    if (!g.bars.length) {
      /** Sem série: grades verticais uniformes no plot. */
      const n = 6;
      const out: { x: number }[] = [];
      for (let i = 0; i <= n; i++) {
        out.push({ x: this.pad.l + (g.innerW * i) / n });
      }
      return out;
    }
    return g.bars.map((b) => ({ x: b.cx }));
  });

  readonly zeroLineY = computed(() => {
    const g = this.geom();
    const span = g.yMax - g.yMin || 1;
    return this.pad.t + g.innerH - ((0 - g.yMin) / span) * g.innerH;
  });

  readonly xLabels = computed(() => {
    const serie = this.series();
    const g = this.geom();
    if (!serie.length || !g.bars.length) return [];
    const maxLabels = this.width() < 480 ? 5 : this.width() < 720 ? 8 : 12;
    const step = Math.max(1, Math.ceil(serie.length / maxLabels));
    return g.bars
      .filter((_, i) => i % step === 0 || i === serie.length - 1)
      .map((b) => ({
        x: b.cx,
        label: serie[b.i]?.label ?? '',
      }));
  });

  readonly activeIndex = computed(() => {
    const ymd = this.effectiveDay();
    if (!ymd) return null;
    const i = this.series().findIndex((p) => p.ymd === ymd);
    return i >= 0 ? i : null;
  });

  readonly crosshairX = computed(() => {
    const i = this.activeIndex();
    if (i == null) return null;
    return this.geom().bars[i]?.cx ?? null;
  });

  readonly activeMarker = computed(() => {
    const i = this.activeIndex();
    if (i == null) return null;
    const pt = this.geom().linePoints[i];
    return pt ?? null;
  });

  readonly hasData = computed(() =>
    this.series().some(
      (p) => p.entradas > 0 || p.saidas > 0 || p.qtdMovimentacoes > 0,
    ),
  );

  constructor() {
    effect(() => {
      const serie = this.series();
      this.animated.set(false);
      if (this.animTimer) clearTimeout(this.animTimer);
      if (serie.length) {
        this.animTimer = setTimeout(() => this.animated.set(true), 40);
      }
    });

    this.destroyRef.onDestroy(() => {
      if (this.animTimer) clearTimeout(this.animTimer);
    });
  }

  ngAfterViewInit(): void {
    const el = this.plotRef()?.nativeElement ?? this.host.nativeElement;
    this.ro = new ResizeObserver((entries) => {
      const cr = entries[0]?.contentRect;
      if (!cr) return;
      const w = Math.max(280, Math.floor(cr.width));
      const h = Math.max(200, Math.min(320, Math.floor(cr.width * 0.38)));
      this.width.set(w);
      this.height.set(h);
    });
    this.ro.observe(el);
  }

  ngOnDestroy(): void {
    this.ro?.disconnect();
  }

  onMove(ev: MouseEvent): void {
    const serie = this.series();
    if (!serie.length) return;
    const svg = ev.currentTarget as SVGSVGElement;
    const rect = svg.getBoundingClientRect();
    const x = ((ev.clientX - rect.left) / rect.width) * this.width();
    const g = this.geom();
    if (!g.bars.length) return;

    let best = 0;
    let bestDist = Infinity;
    for (const b of g.bars) {
      const d = Math.abs(b.cx - x);
      if (d < bestDist) {
        bestDist = d;
        best = b.i;
      }
    }

    const ponto = serie[best];
    if (!ponto) return;
    this.localHoverYmd.set(ponto.ymd);
    this.hoverDay.emit(ponto.ymd);
    this.tip.show({
      kind: 'fluxo',
      ponto,
      x: ev.clientX,
      y: ev.clientY,
    });
  }

  onLeave(): void {
    this.localHoverYmd.set(null);
    this.hoverDay.emit(null);
    this.tip.hide();
  }

  isDimmed(ymd: string): boolean {
    const active = this.effectiveDay();
    return !!active && active !== ymd;
  }

  trackYmd(_: number, item: { ymd: string }): string {
    return item.ymd;
  }
}
