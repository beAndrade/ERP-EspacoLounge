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
import type { VendasDiaPonto } from './fin-painel-charts.model';
import { FinPainelChartTooltipComponent } from './fin-painel-chart-tooltip.component';
import { FinPainelChartTooltipService } from './fin-painel-chart-tooltip.service';
import {
  formatEixo,
  formatMoedaCurta,
  layoutVendasBars,
  mediaPeriodo,
} from './fin-painel-charts.util';

@Component({
  selector: 'app-fin-vendas-dia-chart',
  standalone: true,
  imports: [FinPainelChartTooltipComponent],
  providers: [FinPainelChartTooltipService],
  templateUrl: './fin-vendas-dia-chart.component.html',
  styleUrl: './fin-vendas-dia-chart.component.scss',
})
export class FinVendasDiaChartComponent implements AfterViewInit, OnDestroy {
  private readonly host = inject(ElementRef<HTMLElement>);
  private readonly destroyRef = inject(DestroyRef);
  private readonly tip = inject(FinPainelChartTooltipService);

  readonly series = input<VendasDiaPonto[]>([]);
  readonly activeDay = input<string | null>(null);

  readonly hoverDay = output<string | null>();

  readonly plotRef = viewChild<ElementRef<HTMLElement>>('plot');

  readonly width = signal(640);
  readonly height = signal(240);
  readonly localHoverYmd = signal<string | null>(null);
  readonly animated = signal(false);

  private ro: ResizeObserver | null = null;
  private animTimer: ReturnType<typeof setTimeout> | null = null;

  readonly pad = { t: 20, r: 16, b: 36, l: 52 };

  readonly media = computed(() => mediaPeriodo(this.series()));

  readonly effectiveDay = computed(
    () => this.localHoverYmd() ?? this.activeDay(),
  );

  readonly geom = computed(() =>
    layoutVendasBars(
      this.series(),
      {
        width: this.width(),
        height: this.height(),
        pad: this.pad,
      },
      this.media(),
    ),
  );

  readonly gridLines = computed(() => {
    const g = this.geom();
    const span = g.yMax || 1;
    return g.ticks.map((t) => ({
      value: t,
      label: formatEixo(t),
      y: this.pad.t + g.innerH - (t / span) * g.innerH,
    }));
  });

  readonly verticalGrid = computed(() => {
    const g = this.geom();
    const right = this.width() - this.pad.r;
    if (!g.bars.length) {
      const n = 6;
      const out: { x: number }[] = [];
      for (let i = 0; i <= n; i++) {
        out.push({ x: this.pad.l + (g.innerW * i) / n });
      }
      return out;
    }
    /** Fecha o gráfico com as bordas esquerda e direita pontilhadas. */
    return [
      { x: this.pad.l },
      ...g.bars.map((b) => ({ x: b.x + b.w / 2 })),
      { x: right },
    ];
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
        x: b.x + b.w / 2,
        label: serie[b.i]?.label ?? '',
      }));
  });

  readonly mediaLabel = computed(() => {
    const m = this.media();
    if (m <= 0) return null;
    return `Média ${formatMoedaCurta(m)}`;
  });

  readonly hasData = computed(() =>
    this.series().some((p) => p.receita > 0 || p.qtdVendas > 0),
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
      const h = Math.max(180, Math.min(280, Math.floor(cr.width * 0.34)));
      this.width.set(w);
      this.height.set(h);
    });
    this.ro.observe(el);
  }

  ngOnDestroy(): void {
    this.ro?.disconnect();
  }

  onEnter(ev: MouseEvent, i: number): void {
    const ponto = this.series()[i];
    if (!ponto) return;
    this.localHoverYmd.set(ponto.ymd);
    this.hoverDay.emit(ponto.ymd);
    this.tip.show({
      kind: 'vendas',
      ponto,
      x: ev.clientX,
      y: ev.clientY,
    });
  }

  onMove(ev: MouseEvent): void {
    this.tip.move(ev.clientX, ev.clientY);
  }

  onLeave(): void {
    this.localHoverYmd.set(null);
    this.hoverDay.emit(null);
    this.tip.hide();
  }

  isActive(ymd: string): boolean {
    return this.effectiveDay() === ymd;
  }

  isDimmed(ymd: string): boolean {
    const active = this.effectiveDay();
    return !!active && active !== ymd;
  }

  trackYmd(_: number, item: { ymd: string }): string {
    return item.ymd;
  }
}
