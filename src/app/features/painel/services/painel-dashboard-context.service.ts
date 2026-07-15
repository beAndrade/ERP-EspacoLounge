import { Injectable, signal } from '@angular/core';

/**
 * Contexto do dashboard: dia em foco (brush/hover em gráficos).
 * Cards e gráficos leem `highlightedYmd` para destacar o foco — sem inventar métricas.
 */
@Injectable({ providedIn: 'root' })
export class PainelDashboardContextService {
  readonly highlightedYmd = signal<string | null>(null);

  setDay(ymd: string | null): void {
    const t = ymd?.trim().slice(0, 10) || null;
    if (t && !/^\d{4}-\d{2}-\d{2}$/.test(t)) {
      this.highlightedYmd.set(null);
      return;
    }
    this.highlightedYmd.set(t);
  }

  clear(): void {
    this.highlightedYmd.set(null);
  }
}
