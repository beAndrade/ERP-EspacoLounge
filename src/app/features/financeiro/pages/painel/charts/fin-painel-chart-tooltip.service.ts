import { Injectable, signal } from '@angular/core';
import type { FinChartTooltipPayload } from './fin-painel-charts.model';

@Injectable()
export class FinPainelChartTooltipService {
  readonly visible = signal(false);
  readonly payload = signal<FinChartTooltipPayload | null>(null);

  show(payload: FinChartTooltipPayload): void {
    this.payload.set(payload);
    this.visible.set(true);
  }

  move(x: number, y: number): void {
    const cur = this.payload();
    if (!cur) return;
    this.payload.set({ ...cur, x, y });
  }

  hide(): void {
    this.visible.set(false);
    this.payload.set(null);
  }
}
