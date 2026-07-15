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

const COLORS = ['#505afb', '#7c6bf0', '#34d399', '#f59e0b', '#f87171', '#60a5fa'];

@Component({
  selector: 'app-painel-chart-pie',
  standalone: true,
  templateUrl: './painel-chart-pie.component.html',
  styleUrl: './painel-chart-pie.component.scss',
})
export class PainelChartPieComponent {
  private readonly tip = inject(PainelChartTooltipService);
  private readonly ctx = inject(PainelDashboardContextService);

  readonly series = input<PainelChartPoint[]>([]);
  readonly pointHover = output<PainelChartPoint | null>();
  readonly activeIndex = signal<number | null>(null);
  readonly hasData = computed(() => this.series().length > 0);

  readonly slices = computed(() => {
    const pts = this.series();
    const total = pts.reduce((s, p) => s + Math.max(0, p.value), 0) || 1;
    let angle = -Math.PI / 2;
    const cx = 80;
    const cy = 80;
    const r = 62;
    return pts.map((p, i) => {
      const frac = Math.max(0, p.value) / total;
      const sweep = frac * Math.PI * 2;
      const start = angle;
      angle += sweep;
      const large = sweep > Math.PI ? 1 : 0;
      const x1 = cx + r * Math.cos(start);
      const y1 = cy + r * Math.sin(start);
      const x2 = cx + r * Math.cos(angle);
      const y2 = cy + r * Math.sin(angle);
      const d = `M ${cx} ${cy} L ${x1} ${y1} A ${r} ${r} 0 ${large} 1 ${x2} ${y2} Z`;
      const mid = start + sweep / 2;
      return {
        p,
        i,
        d,
        color: COLORS[i % COLORS.length],
        pct: Math.round(frac * 100),
        mid,
      };
    });
  });

  onEnter(ev: MouseEvent, i: number): void {
    const p = this.series()[i];
    const sl = this.slices()[i];
    if (!p || !sl) return;
    this.activeIndex.set(i);
    this.pointHover.emit(p);
    if (p.ymd) this.ctx.setDay(p.ymd);
    this.tip.show({
      dataLabel: p.label,
      valorLabel: `${new Intl.NumberFormat('pt-BR').format(p.value)} (${sl.pct}%)`,
      deltaLabel:
        p.deltaPct != null
          ? `${p.deltaPct > 0 ? '+' : ''}${p.deltaPct}% vs período anterior`
          : null,
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
