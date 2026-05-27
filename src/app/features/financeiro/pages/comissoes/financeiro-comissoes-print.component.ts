import { CurrencyPipe, DecimalPipe } from '@angular/common';
import { Component, Input } from '@angular/core';
import type { FinComissaoLinhaUi } from './financeiro-comissoes.component';

const MESES_ABREV = [
  'jan',
  'fev',
  'mar',
  'abr',
  'mai',
  'jun',
  'jul',
  'ago',
  'set',
  'out',
  'nov',
  'dez',
];

@Component({
  selector: 'app-financeiro-comissoes-print',
  standalone: true,
  imports: [CurrencyPipe, DecimalPipe],
  templateUrl: './financeiro-comissoes-print.component.html',
  styleUrl: './financeiro-comissoes-print.component.scss',
})
export class FinanceiroComissoesPrintComponent {
  @Input({ required: true }) linhas: FinComissaoLinhaUi[] = [];
  @Input({ required: true }) periodoInicio = '';
  @Input({ required: true }) periodoFim = '';
  @Input({ required: true }) profissionalNome = '—';
  @Input({ required: true }) totalComissoes = 0;
  @Input({ required: true }) totalLiquido = 0;

  get periodoImpressao(): string {
    return `${this.ymdParaLabel(this.periodoInicio)} - ${this.ymdParaLabel(this.periodoFim)}`;
  }

  dataFormatada(ymd: string): string {
    const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(ymd.trim().slice(0, 10));
    if (!m) return ymd;
    return `${m[3]}/${m[2]}/${m[1]}`;
  }

  numeroComanda(row: FinComissaoLinhaUi): number {
    const n = row.numeroComanda ?? row.clienteNumero;
    return Number.isFinite(n) && n > 0 ? n : row.clienteNumero;
  }

  private ymdParaLabel(ymd: string): string {
    const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(ymd.trim().slice(0, 10));
    if (!m) return ymd;
    const mes = MESES_ABREV[parseInt(m[2], 10) - 1] ?? m[2];
    return `${parseInt(m[3], 10)} ${mes}, ${m[1]}`;
  }
}
