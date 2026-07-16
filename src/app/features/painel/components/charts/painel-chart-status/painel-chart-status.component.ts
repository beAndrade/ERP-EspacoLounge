import {
  Component,
  computed,
  inject,
  input,
  output,
  signal,
} from '@angular/core';
import type { PainelChartPoint } from '../../../models/painel-dashboard.models';
import { PainelChartTooltipService } from '../../../services/painel-chart-tooltip.service';

/** Gap visual entre fatias, em radianos (uniforme em todo o anel). */
const GAP_RAD = 0.025;

@Component({
  selector: 'app-painel-chart-status',
  standalone: true,
  templateUrl: './painel-chart-status.component.html',
  styleUrl: './painel-chart-status.component.scss',
})
export class PainelChartStatusComponent {
  private readonly tip = inject(PainelChartTooltipService);

  readonly series = input<PainelChartPoint[]>([]);
  readonly pointHover = output<PainelChartPoint | null>();
  readonly activeIndex = signal<number | null>(null);

  readonly cx = 80;
  readonly cy = 80;
  readonly rOuter = 70;
  readonly rInner = 48;

  readonly total = computed(() =>
    this.series().reduce((s, p) => s + Math.max(0, p.value), 0),
  );

  readonly hasData = computed(() => this.total() > 0);

  readonly legend = computed(() => {
    const tot = this.total() || 1;
    return this.series().map((p) => {
      const pct =
        typeof p.meta?.['pct'] === 'number'
          ? (p.meta['pct'] as number)
          : Math.round((Math.max(0, p.value) / tot) * 100);
      const cor = String(p.meta?.['cor'] ?? '#9ca3af');
      return { p, pct, cor };
    });
  });

  readonly arcs = computed(() => {
    const slices = this.legend().filter((l) => l.p.value > 0);
    const total = this.total() || 1;
    const n = slices.length;
    const gap = n > 1 ? GAP_RAD : 0;
    const usable = Math.PI * 2 - gap * n;
    /** Começa no topo (12h). */
    let angle = -Math.PI / 2;

    return slices.map((l, i) => {
      const sweep = (Math.max(0, l.p.value) / total) * usable;
      const start = angle + gap / 2;
      const end = start + sweep;
      angle += sweep + gap;
      return {
        l,
        i,
        color: l.cor,
        d: donutSlicePath(this.cx, this.cy, this.rOuter, this.rInner, start, end),
      };
    });
  });

  onEnter(ev: MouseEvent, i: number): void {
    const arc = this.arcs()[i];
    if (!arc) return;
    const { p, pct } = arc.l;
    this.activeIndex.set(i);
    this.pointHover.emit(p);
    this.tip.show({
      dataLabel: '',
      valorLabel: `${p.label}: ${p.value} (${pct}%)`,
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

/** Path de uma fatia do anel (donut) entre `start` e `end` (radianos). */
function donutSlicePath(
  cx: number,
  cy: number,
  rOut: number,
  rIn: number,
  start: number,
  end: number,
): string {
  const sweep = end - start;
  if (sweep <= 0.0001) return '';

  /** Quase círculo completo: um path contínuo evita artefacto no fecho. */
  if (sweep >= Math.PI * 2 - 0.001) {
    return [
      `M ${cx + rOut} ${cy}`,
      `A ${rOut} ${rOut} 0 1 1 ${cx - rOut} ${cy}`,
      `A ${rOut} ${rOut} 0 1 1 ${cx + rOut} ${cy}`,
      `M ${cx + rIn} ${cy}`,
      `A ${rIn} ${rIn} 0 1 0 ${cx - rIn} ${cy}`,
      `A ${rIn} ${rIn} 0 1 0 ${cx + rIn} ${cy}`,
      'Z',
    ].join(' ');
  }

  const large = sweep > Math.PI ? 1 : 0;
  const x0 = cx + rOut * Math.cos(start);
  const y0 = cy + rOut * Math.sin(start);
  const x1 = cx + rOut * Math.cos(end);
  const y1 = cy + rOut * Math.sin(end);
  const x2 = cx + rIn * Math.cos(end);
  const y2 = cy + rIn * Math.sin(end);
  const x3 = cx + rIn * Math.cos(start);
  const y3 = cy + rIn * Math.sin(start);

  return [
    `M ${x0} ${y0}`,
    `A ${rOut} ${rOut} 0 ${large} 1 ${x1} ${y1}`,
    `L ${x2} ${y2}`,
    `A ${rIn} ${rIn} 0 ${large} 0 ${x3} ${y3}`,
    'Z',
  ].join(' ');
}
