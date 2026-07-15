import { Component, computed, inject } from '@angular/core';
import { PainelChartTooltipService } from '../../services/painel-chart-tooltip.service';

@Component({
  selector: 'app-painel-chart-tooltip',
  standalone: true,
  templateUrl: './painel-chart-tooltip.component.html',
  styleUrl: './painel-chart-tooltip.component.scss',
})
export class PainelChartTooltipComponent {
  private readonly tip = inject(PainelChartTooltipService);

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
}
