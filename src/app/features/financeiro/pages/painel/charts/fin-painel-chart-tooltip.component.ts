import { CurrencyPipe, DOCUMENT } from '@angular/common';
import {
  Component,
  DestroyRef,
  ElementRef,
  afterNextRender,
  afterRenderEffect,
  inject,
  signal,
  viewChild,
} from '@angular/core';
import { FinPainelChartTooltipService } from './fin-painel-chart-tooltip.service';
import { ymdParaLabelLongo } from './fin-painel-charts.util';

const VIEWPORT_PAD_PX = 12;
const ANCHOR_GAP_PX = 12;

@Component({
  selector: 'app-fin-painel-chart-tooltip',
  standalone: true,
  imports: [CurrencyPipe],
  templateUrl: './fin-painel-chart-tooltip.component.html',
  styleUrl: './fin-painel-chart-tooltip.component.scss',
})
export class FinPainelChartTooltipComponent {
  private readonly tip = inject(FinPainelChartTooltipService);
  private readonly host = inject(ElementRef<HTMLElement>);
  private readonly doc = inject(DOCUMENT);
  private readonly destroyRef = inject(DestroyRef);
  private readonly tipEl = viewChild<ElementRef<HTMLElement>>('tipEl');

  readonly visible = this.tip.visible;
  readonly payload = this.tip.payload;

  /** Canto superior-esquerdo do balão (já clampado à viewport). */
  readonly box = signal<{ left: number; top: number } | null>(null);

  constructor() {
    // Fora de `.shell` / `.app-main-column` (overflow:hidden) para não cortar na borda.
    afterNextRender(() => {
      const el = this.host.nativeElement;
      this.doc.body.appendChild(el);
      this.destroyRef.onDestroy(() => {
        el.remove();
      });
    });

    afterRenderEffect(() => {
      const p = this.payload();
      const visible = this.visible();
      const el = this.tipEl()?.nativeElement;
      if (!visible || !p || !el) {
        this.box.set(null);
        return;
      }

      const w = el.offsetWidth || 220;
      const h = el.offsetHeight || 200;
      const vw = this.doc.defaultView?.innerWidth ?? 1200;
      const vh = this.doc.defaultView?.innerHeight ?? 800;

      let left = p.x - w / 2;
      let top = p.y - h - ANCHOR_GAP_PX;

      left = Math.min(Math.max(left, VIEWPORT_PAD_PX), vw - w - VIEWPORT_PAD_PX);
      top = Math.min(Math.max(top, VIEWPORT_PAD_PX), vh - h - VIEWPORT_PAD_PX);

      const cur = this.box();
      if (cur && cur.left === left && cur.top === top) return;
      this.box.set({ left, top });
    });
  }

  labelData(ymd: string): string {
    return ymdParaLabelLongo(ymd);
  }
}
