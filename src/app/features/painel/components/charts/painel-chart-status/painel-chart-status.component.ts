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
  readonly r = 58;
  readonly stroke = 22;
  readonly gap = 3;

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
    const circ = 2 * Math.PI * this.r;
    let offset = 0;
    return slices.map((l, i) => {
      const frac = l.p.value / total;
      const len = Math.max(0, frac * circ - this.gap);
      const arc = {
        l,
        i,
        color: l.cor,
        dash: `${len} ${circ - len}`,
        offset: -offset,
      };
      offset += len + this.gap;
      return arc;
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
