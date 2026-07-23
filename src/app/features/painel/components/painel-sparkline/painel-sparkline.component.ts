import {
  Component,
  computed,
  inject,
  input,
  signal,
} from '@angular/core';
import type { PainelSparkPoint } from '../../models/painel-dashboard.models';
import { ymdExibicaoBelasis } from '../../../../shared/cliente-drawer-periodo-filtro/cliente-periodo-filtro.util';
import { PainelChartTooltipService } from '../../services/painel-chart-tooltip.service';
import { PainelDashboardContextService } from '../../services/painel-dashboard-context.service';

type SparkPlotPoint = {
  x: number;
  y: number;
  i: number;
  point: PainelSparkPoint;
};

type Pt = { x: number; y: number };

/** Catmull-Rom → cubics (mesmo tipo de suavização do gráfico Belasis). */
function smoothLinePath(pts: Pt[]): string {
  if (pts.length === 0) return '';
  if (pts.length === 1) return `M ${pts[0]!.x} ${pts[0]!.y}`;
  if (pts.length === 2) {
    return `M ${pts[0]!.x} ${pts[0]!.y} L ${pts[1]!.x} ${pts[1]!.y}`;
  }

  let d = `M ${pts[0]!.x} ${pts[0]!.y}`;
  for (let i = 0; i < pts.length - 1; i++) {
    const p0 = pts[i - 1] ?? pts[i]!;
    const p1 = pts[i]!;
    const p2 = pts[i + 1]!;
    const p3 = pts[i + 2] ?? p2;
    const cp1x = p1.x + (p2.x - p0.x) / 6;
    const cp1y = p1.y + (p2.y - p0.y) / 6;
    const cp2x = p2.x - (p3.x - p1.x) / 6;
    const cp2y = p2.y - (p3.y - p1.y) / 6;
    d += ` C ${cp1x} ${cp1y} ${cp2x} ${cp2y} ${p2.x} ${p2.y}`;
  }
  return d;
}

/** Fecha a área: curva no topo + retorno pela baseline (como no Belasis). */
function smoothAreaPath(pts: Pt[], baselineY: number): string {
  if (pts.length === 0) return '';
  const top = smoothLinePath(pts);
  if (pts.length === 1) {
    const p = pts[0]!;
    return `M ${p.x} ${baselineY} L ${p.x} ${p.y} L ${p.x} ${baselineY} Z`;
  }
  const last = pts[pts.length - 1]!;
  const first = pts[0]!;
  /** Volta pela baseline com segmentos C espelhados (y=baseline). */
  const rev: Pt[] = [...pts].reverse().map((p) => ({ x: p.x, y: baselineY }));
  let back = '';
  for (let i = 0; i < rev.length - 1; i++) {
    const p0 = rev[i - 1] ?? rev[i]!;
    const p1 = rev[i]!;
    const p2 = rev[i + 1]!;
    const p3 = rev[i + 2] ?? p2;
    const cp1x = p1.x + (p2.x - p0.x) / 6;
    const cp1y = baselineY;
    const cp2x = p2.x - (p3.x - p1.x) / 6;
    const cp2y = baselineY;
    back += ` C ${cp1x} ${cp1y} ${cp2x} ${cp2y} ${p2.x} ${p2.y}`;
  }
  return `${top} L ${last.x} ${baselineY}${back} L ${first.x} ${baselineY} Z`;
}

@Component({
  selector: 'app-painel-sparkline',
  standalone: true,
  templateUrl: './painel-sparkline.component.html',
  styleUrl: './painel-sparkline.component.scss',
})
export class PainelSparklineComponent {
  private readonly tip = inject(PainelChartTooltipService);
  private readonly ctx = inject(PainelDashboardContextService);

  readonly points = input<PainelSparkPoint[]>([]);
  readonly color = input<string>('#505afb');
  /** Área preenchida + curva suave (estilo Belasis). */
  readonly filled = input(false);
  /** Âncora o eixo Y em zero (contagens diárias). */
  readonly baselineZero = input(false);

  /** ViewBox largo como no Belasis (~560×50) — escala via CSS. */
  readonly vbW = 560;
  readonly vbH = 52;
  readonly padX = 5;
  readonly padY = 4;

  readonly activeIndex = signal<number | null>(null);

  readonly hasSeries = computed(() => this.points().length > 0);

  readonly baselineY = computed(() => this.vbH - this.padY);

  readonly plot = computed((): SparkPlotPoint[] => {
    const pts = this.points();
    if (pts.length === 0) return [];

    const values = pts.map((p) => p.value);
    let min = this.baselineZero() ? 0 : Math.min(...values);
    let max = Math.max(...values);
    if (min === max) {
      if (this.baselineZero()) max = Math.max(max, 1);
      else {
        min -= 1;
        max += 1;
      }
    }

    const n = pts.length;
    const innerW = this.vbW - this.padX * 2;
    const innerH = this.vbH - this.padY * 2;
    const span = max - min || 1;

    return pts.map((point, i) => {
      const x = n === 1 ? this.vbW / 2 : this.padX + (i / (n - 1)) * innerW;
      const t = (point.value - min) / span;
      const y = this.padY + (1 - t) * innerH;
      return { x, y, i, point };
    });
  });

  readonly linePath = computed(() =>
    smoothLinePath(this.plot().map((p) => ({ x: p.x, y: p.y }))),
  );

  readonly areaPath = computed(() =>
    smoothAreaPath(
      this.plot().map((p) => ({ x: p.x, y: p.y })),
      this.baselineY(),
    ),
  );

  readonly activePoint = computed(() => {
    const i = this.activeIndex();
    if (i == null) return null;
    return this.plot()[i] ?? null;
  });

  onChartMove(ev: MouseEvent): void {
    const svg = ev.currentTarget as SVGElement;
    const rect = svg.getBoundingClientRect();
    if (rect.width <= 0) return;
    const xUser = ((ev.clientX - rect.left) / rect.width) * this.vbW;
    const pts = this.plot();
    if (!pts.length) return;

    let best = 0;
    let bestDist = Infinity;
    for (let i = 0; i < pts.length; i++) {
      const d = Math.abs(pts[i]!.x - xUser);
      if (d < bestDist) {
        bestDist = d;
        best = i;
      }
    }
    this.setActive(best, ev.clientX, ev.clientY);
  }

  onChartLeave(): void {
    this.activeIndex.set(null);
    this.ctx.clear();
    this.tip.hide();
  }

  private setActive(i: number, clientX: number, clientY: number): void {
    const p = this.plot()[i];
    if (!p) return;
    this.activeIndex.set(i);
    this.ctx.setDay(p.point.ymd);
    const dataFmt = ymdExibicaoBelasis(p.point.ymd) || p.point.ymd;
    this.tip.show({
      dataLabel: '',
      valorLabel: p.point.label ?? `${p.point.value} em ${dataFmt}`,
      x: clientX,
      y: clientY,
    });
  }
}
