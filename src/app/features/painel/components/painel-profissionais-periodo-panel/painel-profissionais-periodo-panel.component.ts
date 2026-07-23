import { Component, computed, inject, input } from '@angular/core';
import { PainelSparklineComponent } from '../painel-sparkline/painel-sparkline.component';
import type {
  PainelProfissionaisPeriodoVm,
  PainelProfissionalRankingLinha,
} from '../../models/painel-dashboard.models';
import { PainelChartTooltipService } from '../../services/painel-chart-tooltip.service';

type PodiumSlot = {
  rank: 1 | 2 | 3;
  linha: PainelProfissionalRankingLinha | null;
};

@Component({
  selector: 'app-painel-profissionais-periodo-panel',
  standalone: true,
  imports: [PainelSparklineComponent],
  templateUrl: './painel-profissionais-periodo-panel.component.html',
  styleUrl: './painel-profissionais-periodo-panel.component.scss',
})
export class PainelProfissionaisPeriodoPanelComponent {
  private readonly tip = inject(PainelChartTooltipService);

  readonly vm = input<PainelProfissionaisPeriodoVm>({
    totalAtendimentos: 0,
    totalPeriodoAnterior: 0,
    vsAnteriorPct: null,
    spark: [],
    linhas: [],
  });

  readonly hasData = computed(() => this.vm().totalAtendimentos > 0);

  /** Ordem visual do pódio: 2º | 1º | 3º */
  readonly podium = computed((): PodiumSlot[] => {
    const byRank = new Map(
      this.vm().linhas.map((l) => [l.rank, l] as const),
    );
    return [
      { rank: 2, linha: byRank.get(2) ?? null },
      { rank: 1, linha: byRank.get(1) ?? null },
      { rank: 3, linha: byRank.get(3) ?? null },
    ];
  });

  onMetricEnter(ev: MouseEvent): void {
    const totalAnt = this.vm().totalPeriodoAnterior;
    this.tip.show({
      dataLabel: '',
      valorLabel: `Total no período anterior: ${totalAnt}`,
      x: ev.clientX,
      y: ev.clientY,
    });
  }

  onMetricMove(ev: MouseEvent): void {
    this.tip.move(ev.clientX, ev.clientY);
  }

  onMetricLeave(): void {
    this.tip.hide();
  }

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

  servicosLabel(n: number): string {
    return n === 1 ? '1 serviço' : `${n} serviços`;
  }
}
