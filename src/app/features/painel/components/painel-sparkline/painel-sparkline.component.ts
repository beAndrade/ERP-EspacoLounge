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
  /** Preenche área sob a linha (ex.: ranking de profissionais). */
  readonly filled = input(false);
  /** Âncora o eixo Y em zero (contagens diárias). */
  readonly baselineZero = input(false);

  readonly vbW = 120;
  readonly vbH = 36;
  readonly padX = 4;
  readonly padY = 4;

  readonly hasSeries = computed(() => this.points().length > 0);

  readonly plot = computed((): SparkPlotPoint[] => {
    const pts = this.points();
    if (pts.length === 0) return [];

    const values = pts.map((p) => p.value);
    let min = this.baselineZero() ? 0 : Math.min(...values);
    let max = Math.max(...values);
    if (min === max) {
      if (this.baselineZero()) {
        max = Math.max(max, 1);
      } else {
        min -= 1;
        max += 1;
      }
    }

    const n = pts.length;
    const innerW = this.vbW - this.padX * 2;
    const innerH = this.vbH - this.padY * 2;
    const span = max - min || 1;

    return pts.map((point, i) => {
      const x =
        n === 1 ? this.vbW / 2 : this.padX + (i / (n - 1)) * innerW;
      const t = (point.value - min) / span;
      const y = this.padY + (1 - t) * innerH;
      return { x, y, cx: x, cy: y, point };
    });
  });

  readonly polylinePoints = computed(() =>
    this.plot()
      .map((p) => `${p.x},${p.y}`)
      .join(' '),
  );

  readonly areaPath = computed(() => {
    const pts = this.plot();
    if (pts.length === 0) return '';
    const bottom = this.vbH - this.padY;
    if (pts.length === 1) {
      const p = pts[0]!;
      return `M ${p.x - 2} ${bottom} L ${p.x - 2} ${p.y} L ${p.x + 2} ${p.y} L ${p.x + 2} ${bottom} Z`;
    }
    const line = pts.map((p) => `${p.x},${p.y}`).join(' L ');
    const first = pts[0]!;
    const last = pts[pts.length - 1]!;
    return `M ${first.x},${bottom} L ${line} L ${last.x},${bottom} Z`;
  });

  onPointEnter(ev: MouseEvent, p: SparkPlotPoint): void {
    this.ctx.setDay(p.point.ymd);
    const dataFmt = ymdExibicaoBelasis(p.point.ymd) || p.point.ymd;
    this.tip.show({
      dataLabel: '',
      valorLabel: p.point.label ?? `${p.point.value} em ${dataFmt}`,
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
