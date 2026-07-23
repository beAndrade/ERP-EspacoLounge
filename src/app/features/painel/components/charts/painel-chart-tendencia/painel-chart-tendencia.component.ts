import {
  AfterViewInit,
  Component,
  ElementRef,
  OnDestroy,
  computed,
  inject,
  input,
  output,
  signal,
  viewChild,
} from '@angular/core';
import type { PainelChartPoint } from '../../../models/painel-dashboard.models';
import { PainelChartTooltipService } from '../../../services/painel-chart-tooltip.service';
import { niceYAxis } from '../../../utils/painel-chart-scale.util';

function labelDataCompleta(ymd: string): string {
  const [y, m, d] = ymd.split('-');
  if (!y || !m || !d) return ymd;
  return `${d}/${m}/${y}`;
}

/** Barra com base reta e só os cantos superiores arredondados. */
function barraTopoArredondada(
  x: number,
  y: number,
  w: number,
  h: number,
  r: number,
): string {
  const rr = Math.min(r, w / 2, h);
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
  selector: 'app-painel-chart-tendencia',
  standalone: true,
  templateUrl: './painel-chart-tendencia.component.html',
  styleUrl: './painel-chart-tendencia.component.scss',
})
export class PainelChartTendenciaComponent implements AfterViewInit, OnDestroy {
  private readonly tip = inject(PainelChartTooltipService);

  readonly series = input<PainelChartPoint[]>([]);
  readonly color = input('#505afb');
  readonly pointHover = output<PainelChartPoint | null>();

  readonly plotRef = viewChild<ElementRef<HTMLElement>>('plot');

  readonly width = signal(360);
  readonly height = signal(200);
  readonly activeIndex = signal<number | null>(null);

  private ro: ResizeObserver | null = null;

  readonly pad = { t: 16, r: 14, b: 30, l: 34 };

  readonly hasData = computed(() => this.series().length > 0);

  readonly innerW = computed(() => this.width() - this.pad.l - this.pad.r);
  readonly innerH = computed(() => this.height() - this.pad.t - this.pad.b);
  readonly plotBottom = computed(() => this.pad.t + this.innerH());

  /** Eixo Y adaptativo: valores altos → menos ticks, passo maior. */
  private readonly yScale = computed(() => {
    const max = Math.max(...this.series().map((p) => p.value), 0);
    return niceYAxis(max, 4);
  });

  readonly niceMax = computed(() => this.yScale().max);

  readonly ticks = computed(() => this.yScale().ticks);

  readonly gridLines = computed(() => {
    const max = this.niceMax() || 1;
    return this.ticks().map((v) => ({
      value: v,
      y: this.pad.t + this.innerH() * (1 - v / max),
    }));
  });

  readonly bars = computed(() => {
    const pts = this.series();
    if (!pts.length) return [];
    const max = this.niceMax() || 1;
    const slot = this.innerW() / pts.length;
    /** Barra; hover cinza um pouco mais largo, mas bem mais estreito que o slot. */
    const bw = Math.min(40, slot * 0.78);
    const bandW = Math.min(slot * 0.92, Math.max(bw + 10, bw * 1.28));
    return pts.map((p, i) => {
      const cx = this.pad.l + slot * (i + 0.5);
      const h = p.value > 0 ? (p.value / max) * this.innerH() : 0;
      const y = this.pad.t + this.innerH() - h;
      const x = cx - bw / 2;
      return {
        p,
        i,
        cx,
        x,
        y,
        w: bw,
        h,
        path: h > 0 ? barraTopoArredondada(x, y, bw, h, 7) : '',
        bandX: cx - bandW / 2,
        bandW,
      };
    });
  });

  /**
   * Rótulos de data adaptativos: quantos couberem sem colidir.
   * Cada `DD/MM/AAAA` ocupa ~62px; o total sobe/desce conforme a largura do
   * gráfico (ResizeObserver → `width`), até um teto de 8 em telas grandes.
   */
  readonly xLabels = computed(() => {
    const bars = this.bars();
    if (!bars.length) return [];

    const minSpacing = 62;
    const maxLabels = Math.min(
      8,
      Math.max(2, Math.floor(this.innerW() / minSpacing)),
    );

    const build = (b: (typeof bars)[number]) => ({
      x: b.cx,
      label: labelDataCompleta(b.p.ymd ?? ''),
    });

    if (bars.length <= maxLabels) return bars.map(build);

    const step = Math.ceil((bars.length - 1) / (maxLabels - 1));
    const idx = new Set<number>();
    for (let i = 0; i < bars.length; i += step) idx.add(i);
    idx.add(bars.length - 1);

    const out: { x: number; label: string }[] = [];
    const ordered = [...idx].sort((a, b) => a - b);
    ordered.forEach((i, k) => {
      const item = build(bars[i]);
      const prev = out[out.length - 1];
      if (prev && item.x - prev.x < minSpacing * 0.75) {
        /** Colidiu com o anterior: se for a borda direita, ela tem prioridade. */
        if (k === ordered.length - 1) out[out.length - 1] = item;
        return;
      }
      out.push(item);
    });
    return out;
  });

  ngAfterViewInit(): void {
    const el = this.plotRef()?.nativeElement;
    if (!el) return;
    this.ro = new ResizeObserver((entries) => {
      const cr = entries[0]?.contentRect;
      if (!cr) return;
      const w = Math.max(280, Math.floor(cr.width));
      /** Usa a altura real do contêiner quando disponível (preenche o card). */
      const h =
        cr.height > 40
          ? Math.max(160, Math.floor(cr.height))
          : Math.max(180, Math.min(240, Math.round(w * 0.46)));
      this.width.set(w);
      this.height.set(h);
    });
    this.ro.observe(el);
  }

  ngOnDestroy(): void {
    this.ro?.disconnect();
  }

  onEnter(ev: MouseEvent, i: number): void {
    const p = this.series()[i];
    if (!p) return;
    this.activeIndex.set(i);
    this.pointHover.emit(p);
    const plural = p.value === 1 ? 'agendamento criado' : 'agendamentos criados';
    this.tip.show({
      dataLabel: labelDataCompleta(p.ymd ?? ''),
      valorLabel: `${p.value} ${plural}`,
      x: ev.clientX,
      y: ev.clientY,
    });
  }

  onMove(ev: MouseEvent): void {
    this.tip.move(ev.clientX, ev.clientY);
  }

  onLeave(): void {
    this.activeIndex.set(null);
    this.pointHover.emit(null);
    this.tip.hide();
  }
}
