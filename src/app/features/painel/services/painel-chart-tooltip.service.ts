import { Injectable, signal } from '@angular/core';

export type PainelTooltipRow = {
  label: string;
  value: string;
};

/** Retângulo do gráfico (coordenadas de viewport), para flip na borda. */
export type PainelTooltipBounds = {
  left: number;
  top: number;
  right: number;
  bottom: number;
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
  /** Área do gráfico; se omitido, usa a viewport. */
  bounds?: PainelTooltipBounds;
};

export function boundsFromElement(el: Element): PainelTooltipBounds {
  const r = el.getBoundingClientRect();
  return {
    left: r.left,
    top: r.top,
    right: r.right,
    bottom: r.bottom,
  };
}

/** Bounds do SVG/gráfico a partir do alvo do evento de hover. */
export function boundsFromEventTarget(ev: MouseEvent): PainelTooltipBounds {
  const t = ev.currentTarget as Element;
  const root =
    t.closest('svg') ??
    t.closest('.painel-chart') ??
    t.closest('.painel-vcat') ??
    t.closest('.painel-sparkline') ??
    t;
  return boundsFromElement(root);
}

@Injectable({ providedIn: 'root' })
export class PainelChartTooltipService {
  readonly visible = signal(false);
  readonly payload = signal<PainelTooltipPayload | null>(null);

  show(next: PainelTooltipPayload): void {
    this.payload.set(next);
    this.visible.set(true);
  }

  move(x: number, y: number, bounds?: PainelTooltipBounds): void {
    const cur = this.payload();
    if (!cur) return;
    this.payload.set({
      ...cur,
      x,
      y,
      ...(bounds ? { bounds } : {}),
    });
  }

  hide(): void {
    this.visible.set(false);
    this.payload.set(null);
  }
}
