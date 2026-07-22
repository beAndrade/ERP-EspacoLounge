import { Injectable, signal } from '@angular/core';

export type PainelTooltipRow = {
  label: string;
  value: string;
};

export type PainelTooltipPayload = {
  dataLabel: string;
  valorLabel?: string | null;
  deltaLabel?: string | null;
  nota?: string | null;
  /** Linhas “rótulo: valor” (ex.: tooltip do ticket médio). */
  rows?: PainelTooltipRow[];
  x: number;
  y: number;
};

@Injectable({ providedIn: 'root' })
export class PainelChartTooltipService {
  readonly visible = signal(false);
  readonly payload = signal<PainelTooltipPayload | null>(null);

  show(next: PainelTooltipPayload): void {
    this.payload.set(next);
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
