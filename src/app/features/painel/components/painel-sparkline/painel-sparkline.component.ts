import { Component, computed, inject, input } from '@angular/core';
import type { PainelSparkPoint } from '../../models/painel-dashboard.models';
import { ymdExibicaoBelasis } from '../../../../shared/cliente-drawer-periodo-filtro/cliente-periodo-filtro.util';
import { PainelChartTooltipService } from '../../services/painel-chart-tooltip.service';
import { PainelDashboardContextService } from '../../services/painel-dashboard-context.service';

type SparkPlotPoint = {
  x: number;
  y: number;
  cx: number;
  cy: number;
  point: PainelSparkPoint;
};

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

  readonly vbW = 120;
  readonly vbH = 36;
  readonly padX = 4;
  readonly padY = 4;

  readonly hasSeries = computed(() => this.points().length > 0);

  readonly plot = computed((): SparkPlotPoint[] => {
    const pts = this.points();
    if (pts.length === 0) return [];

    const values = pts.map((p) => p.value);
    let min = Math.min(...values);
    let max = Math.max(...values);
    if (min === max) {
      min -= 1;
      max += 1;
    }

    const n = pts.length;
    const innerW = this.vbW - this.padX * 2;
    const innerH = this.vbH - this.padY * 2;

    return pts.map((point, i) => {
      const x =
        n === 1 ? this.vbW / 2 : this.padX + (i / (n - 1)) * innerW;
      const t = (point.value - min) / (max - min);
      const y = this.padY + (1 - t) * innerH;
      return { x, y, cx: x, cy: y, point };
    });
  });

  readonly polylinePoints = computed(() =>
    this.plot()
      .map((p) => `${p.x},${p.y}`)
      .join(' '),
  );

  onPointEnter(ev: MouseEvent, p: SparkPlotPoint): void {
    this.ctx.setDay(p.point.ymd);
    this.tip.show({
      dataLabel: ymdExibicaoBelasis(p.point.ymd) || p.point.ymd,
      valorLabel:
        p.point.label ??
        new Intl.NumberFormat('pt-BR', { maximumFractionDigits: 2 }).format(
          p.point.value,
        ),
      x: ev.clientX,
      y: ev.clientY,
    });
  }

  onPointMove(ev: MouseEvent): void {
    this.tip.move(ev.clientX, ev.clientY);
  }

  onPointLeave(): void {
    this.ctx.clear();
    this.tip.hide();
  }
}
