import {
  Component,
  computed,
  inject,
  input,
  signal,
} from '@angular/core';
import type { PainelVendasCategoriaVm } from '../../../models/painel-dashboard.models';
import { PainelChartTooltipService, boundsFromEventTarget } from '../../../services/painel-chart-tooltip.service';

@Component({
  selector: 'app-painel-chart-vendas-categoria',
  standalone: true,
  templateUrl: './painel-chart-vendas-categoria.component.html',
  styleUrl: './painel-chart-vendas-categoria.component.scss',
})
export class PainelChartVendasCategoriaComponent {
  private readonly tip = inject(PainelChartTooltipService);

  readonly vm = input<PainelVendasCategoriaVm>({ total: 0, linhas: [] });
  readonly activeIndex = signal<number | null>(null);

  readonly cx = 80;
  readonly cy = 80;
  readonly r = 62;
  readonly stroke = 24;

  readonly hasData = computed(() => this.vm().total > 0);

  readonly arcs = computed(() => {
    const linhas = this.vm().linhas;
    const total = this.vm().total || 1;
    const circ = 2 * Math.PI * this.r;
    let offset = 0;
    return linhas.map((l, i) => {
      const frac = Math.max(0, l.valor) / total;
      const len = frac * circ;
      const arc = {
        l,
        i,
        color: l.cor,
        dash: `${len} ${circ - len}`,
        offset: -offset,
      };
      offset += len;
      return arc;
    });
  });

  readonly circumference = computed(() => 2 * Math.PI * this.r);

  formatMoeda(valor: number): string {
    return new Intl.NumberFormat('pt-BR', {
      style: 'currency',
      currency: 'BRL',
    }).format(valor);
  }

  onEnter(ev: MouseEvent, i: number): void {
    const l = this.vm().linhas[i];
    if (!l) return;
    this.activeIndex.set(i);
    this.tip.show({
      dataLabel: l.label,
      valorLabel: `${this.formatMoeda(l.valor)} (${l.pct}%)`,
      x: ev.clientX,
      y: ev.clientY,
      bounds: boundsFromEventTarget(ev),
    });
  }

  onMove(ev: MouseEvent): void {
    this.tip.move(ev.clientX, ev.clientY, boundsFromEventTarget(ev));
  }

  onLeave(): void {
    this.activeIndex.set(null);
    this.tip.hide();
  }
}
