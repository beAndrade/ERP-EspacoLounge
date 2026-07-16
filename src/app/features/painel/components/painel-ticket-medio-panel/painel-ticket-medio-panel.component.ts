import { Component, computed, input } from '@angular/core';
import type { PainelTicketMedioVm } from '../../models/painel-dashboard.models';

/** Barra com base reta e só os cantos superiores arredondados. */
function barraTopoArredondada(
  x: number,
  y: number,
  w: number,
  h: number,
  r: number,
): string {
  const rr = Math.min(r, w / 2, h);
  if (h <= 0) return '';
  if (rr <= 0) {
    return `M ${x} ${y + h} H ${x + w} V ${y} H ${x} Z`;
  }
  return [
    `M ${x} ${y + h}`,
    `L ${x} ${y + rr}`,
    `Q ${x} ${y} ${x + rr} ${y}`,
    `L ${x + w - rr} ${y}`,
    `Q ${x + w} ${y} ${x + w} ${y + rr}`,
    `L ${x + w} ${y + h}`,
    'Z',
  ].join(' ');
}

@Component({
  selector: 'app-painel-ticket-medio-panel',
  standalone: true,
  templateUrl: './painel-ticket-medio-panel.component.html',
  styleUrl: './painel-ticket-medio-panel.component.scss',
})
export class PainelTicketMedioPanelComponent {
  readonly vm = input<PainelTicketMedioVm>({
    ticketAtual: null,
    vsAnteriorPct: null,
    periodoAnterior: null,
    periodoAtual: null,
  });

  readonly hasData = computed(
    () => this.vm().periodoAtual != null || this.vm().periodoAnterior != null,
  );

  readonly vbW = 320;
  readonly vbH = 168;
  readonly pad = { t: 18, r: 12, b: 36, l: 52 };

  readonly niceMax = computed(() => {
    const { periodoAnterior, periodoAtual } = this.vm();
    const max = Math.max(periodoAnterior ?? 0, periodoAtual ?? 0, 1);
    return Math.ceil(max / 15) * 15 || 15;
  });

  readonly yTicks = computed(() => {
    const max = this.niceMax();
    const steps = 4;
    const step = max / steps;
    return Array.from({ length: steps + 1 }, (_, i) => Math.round(step * i));
  });

  readonly gridLines = computed(() => {
    const max = this.niceMax() || 1;
    const innerH = this.vbH - this.pad.t - this.pad.b;
    return this.yTicks().map((value) => ({
      value,
      y: this.pad.t + innerH * (1 - value / max),
    }));
  });

  readonly bars = computed(() => {
    const { periodoAnterior, periodoAtual } = this.vm();
    const pts = [
      { label: 'Período anterior', value: periodoAnterior ?? 0, atual: false },
      { label: 'Período atual', value: periodoAtual ?? 0, atual: true },
    ];
    const niceMax = this.niceMax();
    const innerW = this.vbW - this.pad.l - this.pad.r;
    const innerH = this.vbH - this.pad.t - this.pad.b;
    const bw = 48;
    const gap = (innerW - bw * 2) / 3;
    return pts.map((p, i) => {
      const h = p.value > 0 ? (p.value / niceMax) * innerH : 0;
      const x = this.pad.l + gap + i * (bw + gap);
      const y = this.pad.t + innerH - h;
      const barH = Math.max(h, p.value > 0 ? 2 : 0);
      return {
        ...p,
        x,
        y,
        w: bw,
        h: barH,
        path: barraTopoArredondada(x, y, bw, barH, 6),
      };
    });
  });

  formatMoeda(valor: number | null): string {
    if (valor == null) return '—';
    return new Intl.NumberFormat('pt-BR', {
      style: 'currency',
      currency: 'BRL',
    }).format(valor);
  }

  formatMoedaCurta(valor: number): string {
    return new Intl.NumberFormat('pt-BR', {
      style: 'currency',
      currency: 'BRL',
      maximumFractionDigits: 0,
    }).format(valor);
  }

  formatPct(pct: number | null): string {
    if (pct == null) return '—';
    return `${Math.abs(pct)}%`;
  }
}
