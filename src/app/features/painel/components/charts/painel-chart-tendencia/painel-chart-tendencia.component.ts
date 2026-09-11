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
import { PainelChartTooltipService, boundsFromElement } from '../../../services/painel-chart-tooltip.service';
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

  /** Eixo Y em inteiros (contagem de agendamentos — sem 0,25 / 0,5). */
  private readonly yScale = computed(() => {
    const max = Math.max(...this.series().map((p) => p.value), 0);
    return niceYAxis(max, 4, { integer: true });
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
   * Rótulos de data sem colisão (~70px para `DD/MM/AAAA`).
   * A primeira começa depois do eixo Y; as demais acompanham o mesmo deslocamento.
   * A última recua para não vazar para o gráfico da direita.
   */
  readonly xLabels = computed(() => {
    const bars = this.bars();
    if (!bars.length) return [];

    const labelW = 70;
    const gap = 12;
    const minSpacing = labelW + gap;
    const half = labelW / 2;
    const lastRightInset = 18;
    /** Início do texto, à direita do eixo e dos números verticais. */
    const firstLeft = this.pad.l + 10;
    const lastMaxCenter = this.width() - half - lastRightInset;

    const usable = Math.max(minSpacing, lastMaxCenter - (firstLeft + half));
    const maxLabels = Math.max(
      2,
      Math.min(bars.length, Math.floor(usable / minSpacing) + 1),
    );

    const picked: (typeof bars)[number][] = [];
    if (bars.length <= maxLabels) {
      picked.push(...bars);
    } else {
      const last = bars.length - 1;
      const step = Math.max(1, Math.ceil(last / (maxLabels - 1)));
      for (let i = 0; i <= last; i += step) picked.push(bars[i]!);
      if (picked[picked.length - 1] !== bars[last]) picked.push(bars[last]!);
    }

    const firstBar = picked[0]!;
    /** Quanto a primeira data precisa ir à direita para começar depois do eixo Y. */
    const shift = Math.max(0, firstLeft - (firstBar.cx - half));

    type XLabel = { x: number; label: string; anchor: 'start' | 'middle' };
    const out: XLabel[] = [];

    const rightEdge = (item: XLabel) =>
      item.anchor === 'start' ? item.x + labelW : item.x + half;

    for (let i = 0; i < picked.length; i++) {
      const b = picked[i]!;
      const isFirst = i === 0;
      const isLast = i === picked.length - 1;
      const label = labelDataCompleta(b.p.ymd ?? '');

      if (isFirst) {
        out.push({ x: firstLeft, label, anchor: 'start' });
        continue;
      }

      let x = b.cx + shift;
      const prev = out[out.length - 1]!;
      x = Math.max(x, rightEdge(prev) + gap + half);

      if (isLast) {
        x = Math.min(x, lastMaxCenter);
        while (out.length > 1 && x < rightEdge(out[out.length - 1]!) + gap + half) {
          out.pop();
        }
        const prev = out[out.length - 1]!;
        if (x >= rightEdge(prev) + gap + half) {
          out.push({ x, label, anchor: 'middle' });
        }
        continue;
      }

      if (x > lastMaxCenter - minSpacing) continue;
      out.push({ x, label, anchor: 'middle' });
    }

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
    const plot = this.plotRef()?.nativeElement;
    this.tip.show({
      dataLabel: labelDataCompleta(p.ymd ?? ''),
      valorLabel: `${p.value} ${plural}`,
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
    this.pointHover.emit(null);
    this.tip.hide();
  }
}
