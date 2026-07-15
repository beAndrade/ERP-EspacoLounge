import {
  Component,
  computed,
  inject,
  input,
  output,
  signal,
} from '@angular/core';
import type { PainelChartPoint } from '../../../models/painel-dashboard.models';
import { PainelChartTooltipService } from '../../../services/painel-chart-tooltip.service';

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
  private readonly tip = inject(PainelChartTooltipService);

  readonly series = input<PainelChartPoint[]>([]);
  readonly pointHover = output<PainelChartPoint | null>();
  readonly activeKey = signal<string | null>(null);

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
        const intensity = p.value > 0 ? Math.min(1, p.value / max) : 0;
        return {
          p,
          dia,
          diaIdx,
          hora,
          key: `${diaIdx}-${hora}`,
          intensity,
          active: p.value > 0,
        };
      }),
    }));
  });

  onEnter(ev: MouseEvent, key: string, p: PainelChartPoint): void {
    this.activeKey.set(key);
    this.pointHover.emit(p);
    this.tip.show({
      dataLabel: String(p.meta?.['dia'] ?? p.label),
      valorLabel: `${p.value} atendimento${p.value === 1 ? '' : 's'}`,
      deltaLabel: String(p.meta?.['hora'] ?? ''),
      nota: p.nota ?? null,
      x: ev.clientX,
      y: ev.clientY,
    });
  }

  onMove(ev: MouseEvent): void {
    this.tip.move(ev.clientX, ev.clientY);
  }

  onLeave(): void {
    this.activeKey.set(null);
    this.pointHover.emit(null);
    this.tip.hide();
  }
}
