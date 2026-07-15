import { Component, computed, input } from '@angular/core';
import { PainelSparklineComponent } from '../painel-sparkline/painel-sparkline.component';
import type { PainelProfissionaisPeriodoVm } from '../../models/painel-dashboard.models';

@Component({
  selector: 'app-painel-profissionais-periodo-panel',
  standalone: true,
  imports: [PainelSparklineComponent],
  templateUrl: './painel-profissionais-periodo-panel.component.html',
  styleUrl: './painel-profissionais-periodo-panel.component.scss',
})
export class PainelProfissionaisPeriodoPanelComponent {
  readonly vm = input<PainelProfissionaisPeriodoVm>({
    totalAtendimentos: 0,
    vsAnteriorPct: null,
    spark: [],
    linhas: [],
  });

  readonly hasData = computed(() => this.vm().totalAtendimentos > 0);

  formatMoeda(valor: number | null): string {
    if (valor == null) return '—';
    return new Intl.NumberFormat('pt-BR', {
      style: 'currency',
      currency: 'BRL',
    }).format(valor);
  }

  formatPct(pct: number | null): string {
    if (pct == null) return '0,00%';
    const abs = Math.abs(pct);
    return `${abs.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}%`;
  }
}
