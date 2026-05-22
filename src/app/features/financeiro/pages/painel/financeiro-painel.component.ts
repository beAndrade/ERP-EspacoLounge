import { CurrencyPipe, registerLocaleData } from '@angular/common';
import localePt from '@angular/common/locales/pt';
import { Component, LOCALE_ID, signal } from '@angular/core';

registerLocaleData(localePt);

export interface FinPainelMetricaCard {
  id: string;
  titulo: string;
  valor: number;
  tema: 'recebidos' | 'a-receber' | 'pagos' | 'a-pagar';
  /** Rota futura — null = só estrutura visual. */
  rota: string | null;
}

export interface FinPainelResumoCard {
  id: string;
  titulo: string;
  valor: number;
  tema: 'receber' | 'pagar';
  rota: string | null;
}

export interface FinPainelContaCard {
  id: string;
  titulo: string;
  valor: number;
  rota: string | null;
}

/** Placeholder de barras no gráfico (0–100). */
export interface FinPainelChartBar {
  label: string;
  entrada: number;
  saida: number;
  saldoPct: number;
}

@Component({
  selector: 'app-financeiro-painel',
  standalone: true,
  imports: [CurrencyPipe],
  providers: [{ provide: LOCALE_ID, useValue: 'pt-BR' }],
  templateUrl: './financeiro-painel.component.html',
  styleUrl: './financeiro-painel.component.scss',
})
export class FinanceiroPainelComponent {
  /** Período dos blocos Totais / gráficos (dados mock até API). */
  readonly periodoTotaisInicio = signal('2026-05-07');
  readonly periodoTotaisFim = signal('2026-05-21');

  readonly periodoFluxoInicio = signal('2026-05-07');
  readonly periodoFluxoFim = signal('2026-05-21');

  readonly periodoVendasInicio = signal('2026-05-07');
  readonly periodoVendasFim = signal('2026-05-21');

  readonly resumoHoje: FinPainelResumoCard[] = [
    {
      id: 'receber-hoje',
      titulo: 'A receber hoje',
      valor: 0,
      tema: 'receber',
      rota: null,
    },
    {
      id: 'pagar-hoje',
      titulo: 'A pagar hoje',
      valor: 0,
      tema: 'pagar',
      rota: null,
    },
  ];

  readonly totais: FinPainelMetricaCard[] = [
    {
      id: 'recebidos',
      titulo: 'Recebidos',
      valor: 505,
      tema: 'recebidos',
      rota: null,
    },
    {
      id: 'a-receber',
      titulo: 'A Receber',
      valor: 195,
      tema: 'a-receber',
      rota: null,
    },
    {
      id: 'pagos',
      titulo: 'Pagos',
      valor: 0,
      tema: 'pagos',
      rota: null,
    },
    {
      id: 'a-pagar',
      titulo: 'A Pagar',
      valor: 0,
      tema: 'a-pagar',
      rota: null,
    },
  ];

  readonly contas: FinPainelContaCard[] = [
    { id: 'caixa', titulo: 'Caixa', valor: 325, rota: null },
    { id: 'banco', titulo: 'Banco', valor: 180, rota: null },
  ];

  readonly fluxoBarras: FinPainelChartBar[] = [
    { label: '07/05', entrada: 42, saida: 8, saldoPct: 38 },
    { label: '09/05', entrada: 55, saida: 12, saldoPct: 48 },
    { label: '11/05', entrada: 28, saida: 18, saldoPct: 52 },
    { label: '13/05', entrada: 72, saida: 10, saldoPct: 58 },
    { label: '15/05', entrada: 48, saida: 22, saldoPct: 62 },
    { label: '17/05', entrada: 65, saida: 14, saldoPct: 70 },
    { label: '19/05', entrada: 38, saida: 16, saldoPct: 74 },
    { label: '21/05', entrada: 52, saida: 9, saldoPct: 78 },
  ];

  readonly vendasBarras: FinPainelChartBar[] = [
    { label: '07/05', entrada: 120, saida: 0, saldoPct: 0 },
    { label: '09/05', entrada: 85, saida: 0, saldoPct: 0 },
    { label: '11/05', entrada: 200, saida: 0, saldoPct: 0 },
    { label: '13/05', entrada: 160, saida: 0, saldoPct: 0 },
    { label: '15/05', entrada: 95, saida: 0, saldoPct: 0 },
    { label: '17/05', entrada: 180, saida: 0, saldoPct: 0 },
    { label: '19/05', entrada: 140, saida: 0, saldoPct: 0 },
    { label: '21/05', entrada: 210, saida: 0, saldoPct: 0 },
  ];

  periodoLabel(inicio: string, fim: string): string {
    return `${this.ymdParaDdMm(inicio)} — ${this.ymdParaDdMm(fim)}`;
  }

  private ymdParaDdMm(ymd: string): string {
    const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(ymd.trim().slice(0, 10));
    if (!m) return ymd;
    return `${m[3]}/${m[2]}/${m[1]}`;
  }
}
