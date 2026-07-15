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
    const max = Math.max(...pts.map((p) => p.value), 1);
    return pts.map((p, i) => {
      const prev = i === 0 ? p.value : pts[i - 1].value;
      const conversao = prev > 0 ? Math.round((p.value / prev) * 100) : 0;
      const perdaAcum =
        pts[0].value > 0
          ? Math.round(((pts[0].value - p.value) / pts[0].value) * 100)
          : 0;
      const widthPct = Math.max(28, (p.value / max) * 100);
      return { p, i, conversao, perdaAcum, widthPct, taxa: conversao };
    });
  });

  onEnter(ev: MouseEvent, i: number): void {
    const st = this.stages()[i];
    if (!st) return;
    this.activeIndex.set(i);
    this.pointHover.emit(st.p);
    this.tip.show({
      dataLabel: st.p.label,
      valorLabel: `${st.p.value} · conversão ${st.conversao}%`,
      deltaLabel: `Perda acumulada ${st.perdaAcum}%`,
      nota: `Taxa da etapa ${st.taxa}%`,
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
