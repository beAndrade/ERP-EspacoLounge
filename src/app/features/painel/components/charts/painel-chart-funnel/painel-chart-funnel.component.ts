import {
  Component,
  computed,
  inject,
  input,
  output,
  signal,
} from '@angular/core';
import type { PainelChartPoint } from '../../../models/painel-dashboard.models';
import {
  PainelChartTooltipService,
  boundsFromEventTarget,
} from '../../../services/painel-chart-tooltip.service';

/** Geometria alinhada ao FunnelChart Belasis/Recharts. */
const VB_W = 501;
const VB_H = 270;
const PAD_X = 30;
const Y0 = 5;
const Y1 = 265;
const MAX_W = VB_W - PAD_X * 2; // 441
const CX = PAD_X + MAX_W / 2; // 250.5

const FILLS = [
  'rgb(80, 90, 251)',
  'rgba(80, 90, 251, 0.7)',
  'rgba(80, 90, 251, 0.4)',
];

function trapezoidPath(
  yTop: number,
  yBot: number,
  wTop: number,
  wBot: number,
): string {
  const l1 = CX - wTop / 2;
  const r1 = CX + wTop / 2;
  const l2 = CX - wBot / 2;
  const r2 = CX + wBot / 2;
  return `M ${l1} ${yTop} L ${r1} ${yTop} L ${r2} ${yBot} L ${l2} ${yBot} Z`;
}

type FunnelStage = {
  p: PainelChartPoint;
  i: number;
  pctTotal: number;
  display: string;
  d: string;
  color: string;
  labelX: number;
  labelY: number;
};

@Component({
  selector: 'app-painel-chart-funnel',
  standalone: true,
  templateUrl: './painel-chart-funnel.component.html',
  styleUrl: './painel-chart-funnel.component.scss',
})
export class PainelChartFunnelComponent {
  private readonly tip = inject(PainelChartTooltipService);

  readonly series = input<PainelChartPoint[]>([]);
  readonly pointHover = output<PainelChartPoint | null>();
  readonly activeIndex = signal<number | null>(null);
  readonly hasData = computed(() => this.series().length > 0);

  readonly vbW = VB_W;
  readonly vbH = VB_H;

  readonly stages = computed((): FunnelStage[] => {
    const pts = this.series();
    if (!pts.length) return [];
    const base = pts[0]!.value || 1;
    const n = pts.length;
    const segH = (Y1 - Y0) / n;

    const pcts = pts.map((p) => {
      if (typeof p.meta?.['pctTotal'] === 'number') {
        return p.meta['pctTotal'] as number;
      }
      return base > 0 ? Math.round((p.value / base) * 100) : 0;
    });

    return pts.map((p, i) => {
      const pctTotal = pcts[i]!;
      const nextPct = i < n - 1 ? pcts[i + 1]! : 0;
      const wTop = Math.max(0, (pctTotal / 100) * MAX_W);
      const wBot = Math.max(0, (nextPct / 100) * MAX_W);
      const yTop = Y0 + i * segH;
      const yBot = Y0 + (i + 1) * segH;
      const display =
        typeof p.meta?.['display'] === 'string'
          ? (p.meta['display'] as string)
          : `${p.label}: ${p.value} (${pctTotal}%)`;

      return {
        p,
        i,
        pctTotal,
        display,
        d: trapezoidPath(yTop, yBot, wTop, wBot),
        color: FILLS[i % FILLS.length]!,
        labelX: CX,
        labelY: (yTop + yBot) / 2,
      };
    });
  });

  onEnter(ev: MouseEvent, i: number): void {
    const st = this.stages()[i];
    if (!st) return;
    this.activeIndex.set(i);
    this.pointHover.emit(st.p);
    this.tip.show({
      dataLabel: st.display,
      valorLabel: `${st.p.value} agendamentos`,
      deltaLabel: `${st.pctTotal}% do total criado no período`,
      nota: st.p.nota ?? null,
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
    this.pointHover.emit(null);
    this.tip.hide();
  }
}
