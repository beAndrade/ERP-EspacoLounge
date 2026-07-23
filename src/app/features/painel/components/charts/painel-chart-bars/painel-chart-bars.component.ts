import {
  Component,
  computed,
  inject,
  input,
  output,
  signal,
} from '@angular/core';
import type { PainelChartPoint } from '../../../models/painel-dashboard.models';
import { PainelChartTooltipService, boundsFromEventTarget } from '../../../services/painel-chart-tooltip.service';
import { PainelDashboardContextService } from '../../../services/painel-dashboard-context.service';

@Component({
  selector: 'app-painel-chart-bars',
  standalone: true,
  templateUrl: './painel-chart-bars.component.html',
  styleUrl: './painel-chart-bars.component.scss',
})
export class PainelChartBarsComponent {
  private readonly tip = inject(PainelChartTooltipService);
  private readonly ctx = inject(PainelDashboardContextService);

  readonly series = input<PainelChartPoint[]>([]);
  readonly color = input('#505afb');
  readonly horizontal = input(false);

  readonly pointHover = output<PainelChartPoint | null>();

  readonly activeIndex = signal<number | null>(null);
  readonly hasData = computed(() => this.series().length > 0);

  readonly vbW = 320;
  readonly vbH = 160;
  readonly pad = { t: 12, r: 12, b: 28, l: 36 };

  readonly bars = computed(() => {
    const pts = this.series();
    if (!pts.length) return [];
    const max = Math.max(...pts.map((p) => p.value), 1);
    const innerW = this.vbW - this.pad.l - this.pad.r;
    const innerH = this.vbH - this.pad.t - this.pad.b;
    const gap = 4;
    const bw = Math.max(6, (innerW - gap * (pts.length - 1)) / pts.length);
    return pts.map((p, i) => {
      const h = (p.value / max) * innerH;
      const x = this.pad.l + i * (bw + gap);
      const y = this.pad.t + innerH - h;
      return { p, i, x, y, w: bw, h: Math.max(h, 1) };
    });
  });

  onEnter(ev: MouseEvent, i: number): void {
    const pts = this.series();
    const p = pts[i];
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
      valorLabel: formatVal(p.value),
      deltaLabel: delta,
      nota: p.nota ?? null,
      x: ev.clientX,
      y: ev.clientY,
      bounds: boundsFromEventTarget(ev),
    });
  }

  onMove(ev: MouseEvent): void {
    this.tip.move(ev.clientX, ev.clientY, boundsFromEventTarget(ev));
  }

  onLeave(): void {
    this.activeIndex.set(null);
    this.pointHover.emit(null);
    this.ctx.clear();
    this.tip.hide();
  }
}

function formatVal(n: number): string {
  return new Intl.NumberFormat('pt-BR', { maximumFractionDigits: 2 }).format(n);
}
