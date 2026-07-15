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
  selector: 'app-painel-chart-heatmap',
  standalone: true,
  templateUrl: './painel-chart-heatmap.component.html',
  styleUrl: './painel-chart-heatmap.component.scss',
})
export class PainelChartHeatmapComponent {
  private readonly tip = inject(PainelChartTooltipService);
  private readonly ctx = inject(PainelDashboardContextService);

  readonly series = input<PainelChartPoint[]>([]);
  readonly pointHover = output<PainelChartPoint | null>();
  readonly activeKey = signal<string | null>(null);
  readonly hasData = computed(() => this.series().length > 0);

  readonly cells = computed(() => {
    const pts = this.series();
    const max = Math.max(...pts.map((p) => p.value), 1);
    return pts.map((p, i) => {
      const intensity = Math.min(1, p.value / max);
      const dia = String(p.meta?.['dia'] ?? p.label);
      const hora = String(p.meta?.['hora'] ?? '');
      return { p, i, intensity, dia, hora, key: `${p.ymd ?? i}-${hora}` };
    });
  });

  onEnter(ev: MouseEvent, key: string, i: number): void {
    const c = this.cells()[i];
    if (!c) return;
    this.activeKey.set(key);
    this.pointHover.emit(c.p);
    if (c.p.ymd) this.ctx.setDay(c.p.ymd);
    this.tip.show({
      dataLabel: c.dia,
      valorLabel: `${c.p.value} atendimentos`,
      deltaLabel: c.hora || null,
      nota: c.p.nota ?? null,
      x: ev.clientX,
      y: ev.clientY,
    });
  }

  onMove(ev: MouseEvent): void {
    this.tip.move(ev.clientX, ev.clientY);
  }

  onLeave(): void {
    this.activeKey.set(null);
    this.pointHover.emit(null);
    this.ctx.clear();
    this.tip.hide();
  }
}
