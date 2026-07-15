import { Component, computed, input } from '@angular/core';
import type { PainelTicketMedioVm } from '../../models/painel-dashboard.models';

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

  readonly vbW = 280;
  readonly vbH = 140;
  readonly pad = { t: 8, r: 8, b: 32, l: 44 };

  readonly niceMax = computed(() => {
    const { periodoAnterior, periodoAtual } = this.vm();
    const max = Math.max(periodoAnterior ?? 0, periodoAtual ?? 0, 1);
    return Math.ceil(max / 15) * 15 || 15;
  });

  readonly bars = computed(() => {
    const { periodoAnterior, periodoAtual } = this.vm();
    const pts = [
      { label: 'Período anterior', value: periodoAnterior ?? 0 },
      { label: 'Período atual', value: periodoAtual ?? 0 },
    ];
    const niceMax = this.niceMax();
    const innerW = this.vbW - this.pad.l - this.pad.r;
    const innerH = this.vbH - this.pad.t - this.pad.b;
    const bw = 56;
    const gap = (innerW - bw * 2) / 3;
    return pts.map((p, i) => {
      const h = p.value > 0 ? (p.value / niceMax) * innerH : 0;
      const x = this.pad.l + gap + i * (bw + gap);
      const y = this.pad.t + innerH - h;
      return { ...p, x, y, w: bw, h: Math.max(h, p.value > 0 ? 2 : 0) };
    });
  });

  readonly yTicks = computed(() => {
    const max = this.niceMax();
    const steps = 4;
    const step = max / steps;
    return Array.from({ length: steps + 1 }, (_, i) => Math.round(step * i));
  });

  formatMoeda(valor: number | null): string {
    if (valor == null) return '—';
    return new Intl.NumberFormat('pt-BR', {
      style: 'currency',
      currency: 'BRL',
    }).format(valor);
  }

  formatPct(pct: number | null): string {
    if (pct == null) return '—';
    return `${Math.abs(pct)}%`;
  }
}
