import { CurrencyPipe } from '@angular/common';
import { Component, computed, inject } from '@angular/core';
import { FinPainelChartTooltipService } from './fin-painel-chart-tooltip.service';
import { ymdParaLabelLongo } from './fin-painel-charts.util';

@Component({
  selector: 'app-fin-painel-chart-tooltip',
  standalone: true,
  imports: [CurrencyPipe],
  templateUrl: './fin-painel-chart-tooltip.component.html',
  styleUrl: './fin-painel-chart-tooltip.component.scss',
})
export class FinPainelChartTooltipComponent {
  private readonly tip = inject(FinPainelChartTooltipService);

  readonly visible = this.tip.visible;
  readonly payload = this.tip.payload;

  readonly style = computed(() => {
    const p = this.payload();
    if (!p) return {};
    return {
      left: `${p.x}px`,
      top: `${p.y}px`,
    };
  });

  labelData(ymd: string): string {
    return ymdParaLabelLongo(ymd);
  }
}
