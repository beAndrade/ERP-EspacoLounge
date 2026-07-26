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

/** Alinhado ao último horário do drawer de agendamento (23h). */
const HORAS = [
  8, 9, 10, 11, 12, 13, 14, 15, 16, 17, 18, 19, 20, 21, 22, 23,
] as const;

/**
 * Intensidade do bloco (sobre branco) — passos bem espaçados para
 * diferenciar 1 / 2 / 3 / 4 / 5+ com primary (#6BADE0).
 */
function heatAlphaPorContagem(n: number): number {
  if (n <= 0) return 0;
  if (n === 1) return 0.22;
  if (n === 2) return 0.42;
  if (n === 3) return 0.62;
  if (n === 4) return 0.82;
  return 1;
}

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
    return HORAS.map((hora) => ({
      hora,
      horaLabel: `${hora}h`,
      cells: DIAS.map((dia, diaIdx) => {
        const p = map.get(`${diaIdx}-${hora}`) ?? {
          label: dia,
          value: 0,
          meta: { dia, hora: `${hora}h`, diaIdx, horaIdx: hora },
        };
        return {
          p,
          dia,
          key: `${diaIdx}-${hora}`,
          heatAlpha: heatAlphaPorContagem(p.value),
          hot: p.value >= 4,
        };
      }),
    }));
  });
}
