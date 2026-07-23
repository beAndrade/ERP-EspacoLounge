import { Component, computed, input } from '@angular/core';
import type { PainelVendasCategoriaVm } from '../../../models/painel-dashboard.models';

@Component({
  selector: 'app-painel-chart-vendas-categoria',
  standalone: true,
  templateUrl: './painel-chart-vendas-categoria.component.html',
  styleUrl: './painel-chart-vendas-categoria.component.scss',
})
export class PainelChartVendasCategoriaComponent {
  readonly vm = input<PainelVendasCategoriaVm>({ total: 0, linhas: [] });

  readonly cx = 95;
  readonly cy = 95;
  readonly r = 74;
  readonly stroke = 28;

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

  formatMoeda(valor: number): string {
    return new Intl.NumberFormat('pt-BR', {
      style: 'currency',
      currency: 'BRL',
    }).format(valor);
  }
}
