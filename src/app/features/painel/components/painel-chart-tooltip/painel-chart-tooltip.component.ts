import {
  afterRenderEffect,
  Component,
  ElementRef,
  inject,
  signal,
  viewChild,
} from '@angular/core';
import {
  PainelChartTooltipService,
  type PainelTooltipBounds,
} from '../../services/painel-chart-tooltip.service';

/** Offset Recharts (Tooltip `offset` default = 10). Belasis usa ~5 no Y do wrapper. */
const OFFSET = 10;
const TOP_PAD = 5;

@Component({
  selector: 'app-painel-chart-tooltip',
  standalone: true,
  templateUrl: './painel-chart-tooltip.component.html',
  styleUrl: './painel-chart-tooltip.component.scss',
})
export class PainelChartTooltipComponent {
  private readonly tip = inject(PainelChartTooltipService);
  private readonly tipEl = viewChild<ElementRef<HTMLElement>>('tipEl');

  readonly visible = this.tip.visible;
  readonly payload = this.tip.payload;

  readonly translateX = signal(0);
  readonly translateY = signal(0);
  /** Evita animar do (0,0) na primeira aparição. */
  readonly placed = signal(false);
  readonly animate = signal(false);

  constructor() {
    afterRenderEffect(() => {
      const p = this.payload();
      const vis = this.visible();
      const el = this.tipEl()?.nativeElement;
      if (!vis || !p || !el) {
        this.placed.set(false);
        this.animate.set(false);
        return;
      }

      const tipW = el.offsetWidth;
      const tipH = el.offsetHeight;
      if (tipW <= 0 || tipH <= 0) return;

      const bounds = p.bounds ?? viewportBounds();
      const { x, y } = computeTranslate(p.x, p.y, tipW, tipH, bounds);

      const wasPlaced = this.placed();
      this.translateX.set(x);
      this.translateY.set(y);
      this.placed.set(true);
      // Liga a transição só depois da 1ª posição (como o wrapper Recharts).
      this.animate.set(wasPlaced);
    });
  }

  transformStyle(): string {
    return `translate(${this.translateX()}px, ${this.translateY()}px)`;
  }
}

function viewportBounds(): PainelTooltipBounds {
  const m = 8;
  return {
    left: m,
    top: m,
    right: window.innerWidth - m,
    bottom: window.innerHeight - m,
  };
}

/**
 * Lógica alinhada a `getTooltipTranslateXY` do Recharts:
 * - X: prefere à direita do cursor; se estoura a borda direita, vai à esquerda.
 * - Y: fixa perto do topo do gráfico (Belasis `translate(..., 5px)`),
 *   com fallback acima/abaixo do cursor se não houver bounds de gráfico.
 */
function computeTranslate(
  cx: number,
  cy: number,
  tipW: number,
  tipH: number,
  bounds: PainelTooltipBounds,
): { x: number; y: number } {
  const positiveX = cx + OFFSET;
  const negativeX = cx - tipW - OFFSET;
  let x: number;
  if (positiveX + tipW > bounds.right) {
    x = Math.max(negativeX, bounds.left);
  } else {
    x = Math.max(positiveX, bounds.left);
  }

  // Belasis: Y ≈ 5px a partir do topo do gráfico.
  const chartH = bounds.bottom - bounds.top;
  let y: number;
  if (chartH > 0 && chartH <= 120) {
    y = bounds.top + TOP_PAD;
  } else {
    const above = cy - tipH - OFFSET;
    const below = cy + OFFSET;
    if (above >= bounds.top) {
      y = above;
    } else {
      y = Math.min(below, bounds.bottom - tipH);
    }
  }

  if (y + tipH > bounds.bottom) {
    y = Math.max(bounds.bottom - tipH, bounds.top);
  }
  if (y < bounds.top) {
    y = bounds.top;
  }

  return { x, y };
}
