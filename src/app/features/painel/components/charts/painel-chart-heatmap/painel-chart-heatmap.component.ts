import { Component, computed, input } from '@angular/core';
import type { PainelChartPoint } from '../../../models/painel-dashboard.models';

const DIAS = [
  'segunda-feira',
  'terça-feira',
  'quarta-feira',
  'quinta-feira',
  'sexta-feira',
  'sábado',
  'domingo',
] as const;

const HORAS = [8, 9, 10, 11, 12, 13, 14, 15, 16, 17, 18, 19] as const;

@Component({
  selector: 'app-painel-chart-heatmap',
  standalone: true,
  templateUrl: './painel-chart-heatmap.component.html',
  styleUrl: './painel-chart-heatmap.component.scss',
})
export class PainelChartHeatmapComponent {
  readonly series = input<PainelChartPoint[]>([]);

  readonly dias = DIAS;
  readonly horas = HORAS;

  readonly hasData = computed(() => this.series().some((p) => p.value > 0));

  readonly grid = computed(() => {
    const map = new Map<string, PainelChartPoint>();
    for (const p of this.series()) {
      const d = p.meta?.['diaIdx'];
      const h = p.meta?.['horaIdx'];
      if (typeof d === 'number' && typeof h === 'number') {
        map.set(`${d}-${h}`, p);
      }
    }
    const max = Math.max(...this.series().map((p) => p.value), 1);
    return HORAS.map((hora) => ({
      hora,
      horaLabel: `${hora}h`,
      cells: DIAS.map((dia, diaIdx) => {
        const p = map.get(`${diaIdx}-${hora}`) ?? {
          label: dia,
          value: 0,
          meta: { dia, hora: `${hora}h`, diaIdx, horaIdx: hora },
        };
        /** 0 = sem fill; 1 = pico do período (azul mais opaco). */
        const intensity = p.value > 0 ? Math.min(1, p.value / max) : 0;
        return {
          p,
          dia,
          key: `${diaIdx}-${hora}`,
          intensity,
        };
      }),
    }));
  });
}
