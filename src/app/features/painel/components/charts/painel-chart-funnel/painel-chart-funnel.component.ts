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

@Component({
  selector: 'app-painel-chart-funnel',
  standalone: true,
  templateUrl: './painel-chart-funnel.component.html',
  styleUrl: './painel-chart-funnel.component.scss',
})
export class PainelChartFunnelComponent {
  private readonly tip = inject(PainelChartTooltipService);

  readonly series = input<PainelChartPoint[]>([]);
  readonly pointHover = output<PainelChartPoint | null>();
  readonly activeIndex = signal<number | null>(null);
  readonly hasData = computed(() => this.series().length > 0);

  readonly stages = computed(() => {
    const pts = this.series();
    if (!pts.length) return [];
    const base = pts[0].value || 1;
    const colors = ['#5d5fef', '#8c8dff', '#c7c8ff'];
    return pts.map((p, i) => {
      const pctTotal =
        typeof p.meta?.['pctTotal'] === 'number'
          ? (p.meta['pctTotal'] as number)
          : base > 0
            ? Math.round((p.value / base) * 100)
            : 0;
      const display =
        typeof p.meta?.['display'] === 'string'
          ? (p.meta['display'] as string)
          : `${p.label}: ${p.value} (${pctTotal}%)`;
      const widthPct = Math.max(32, pctTotal);
      return {
        p,
        i,
        pctTotal,
        display,
        widthPct,
        color: colors[i % colors.length],
      };
    });
  });

  onEnter(ev: MouseEvent, i: number): void {
    const st = this.stages()[i];
    if (!st) return;
    this.activeIndex.set(i);
    this.pointHover.emit(st.p);
    this.tip.show({
      dataLabel: st.display,
      valorLabel: `${st.p.value} agendamentos`,
      deltaLabel: `${st.pctTotal}% do total criado no período`,
      nota: st.p.nota ?? null,
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
    this.tip.hide();
  }
}
