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
import { PainelDashboardContextService } from '../../../services/painel-dashboard-context.service';

@Component({
  selector: 'app-painel-chart-line',
  standalone: true,
  templateUrl: './painel-chart-line.component.html',
  styleUrl: './painel-chart-line.component.scss',
})
export class PainelChartLineComponent {
  private readonly tip = inject(PainelChartTooltipService);
  private readonly ctx = inject(PainelDashboardContextService);

  readonly series = input<PainelChartPoint[]>([]);
  readonly color = input('#505afb');
  readonly pointHover = output<PainelChartPoint | null>();

  readonly activeIndex = signal<number | null>(null);
  readonly hasData = computed(() => this.series().length > 0);

  readonly vbW = 320;
  readonly vbH = 160;
  readonly pad = { t: 16, r: 12, b: 24, l: 12 };

  readonly plot = computed(() => {
    const pts = this.series();
    if (!pts.length) return [];
    let min = Math.min(...pts.map((p) => p.value));
    let max = Math.max(...pts.map((p) => p.value));
    if (min === max) {
      min -= 1;
      max += 1;
    }
    const innerW = this.vbW - this.pad.l - this.pad.r;
    const innerH = this.vbH - this.pad.t - this.pad.b;
    const n = pts.length;
    return pts.map((p, i) => {
      const x = n === 1 ? this.vbW / 2 : this.pad.l + (i / (n - 1)) * innerW;
      const t = (p.value - min) / (max - min);
      const y = this.pad.t + (1 - t) * innerH;
      return { p, i, x, y };
    });
  });

  readonly polyline = computed(() =>
    this.plot()
      .map((pt) => `${pt.x},${pt.y}`)
      .join(' '),
  );

  onEnter(ev: MouseEvent, i: number): void {
    const p = this.series()[i];
    if (!p) return;
    this.activeIndex.set(i);
    this.pointHover.emit(p);
    if (p.ymd) this.ctx.setDay(p.ymd);
    const delta =
      p.deltaPct != null
        ? `${p.deltaPct > 0 ? '+' : ''}${p.deltaPct}% vs período anterior`
        : null;
    this.tip.show({
      dataLabel: p.label,
      valorLabel: new Intl.NumberFormat('pt-BR', {
        maximumFractionDigits: 2,
      }).format(p.value),
      deltaLabel: delta,
      nota: p.nota ?? null,
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
    this.ctx.clear();
    this.tip.hide();
  }
}
