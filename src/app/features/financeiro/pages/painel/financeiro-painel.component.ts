import { CurrencyPipe, registerLocaleData } from '@angular/common';
import localePt from '@angular/common/locales/pt';
import { Component, LOCALE_ID, OnInit, inject, signal } from '@angular/core';
import { RouterLink } from '@angular/router';
import { forkJoin } from 'rxjs';
import { SheetsApiService } from '../../../../core/services/sheets-api.service';
import {
  mapFinTransacaoItemToUi,
} from '../transacoes/fin-transacoes.mapper';
import {
  ddMmYyyyToYmdFiltro,
  filtroPadraoTransacoes,
  primeiroDiaMesYmdFiltro,
  queryParamsCardPainel,
  valorCardVisao,
  valorCardVisaoPeriodo,
  ymdHojeFiltro,
  ymdToDdMmYyyyFiltro,
  type FinTransacoesVisaoPreset,
} from '../transacoes/fin-transacoes-filtro.util';

registerLocaleData(localePt);

export interface FinPainelMetricaCard {
  id: FinTransacoesVisaoPreset;
  titulo: string;
  valor: number;
  tema: 'recebidos' | 'a-receber' | 'pagos' | 'a-pagar';
  queryParams: Record<string, string>;
}

export interface FinPainelResumoCard {
  id: 'receber-hoje' | 'pagar-hoje';
  titulo: string;
  valor: number;
  tema: 'receber' | 'pagar';
  queryParams: Record<string, string>;
}

export interface FinPainelContaCard {
  id: string;
  titulo: string;
  valor: number;
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
  imports: [CurrencyPipe, RouterLink],
  providers: [{ provide: LOCALE_ID, useValue: 'pt-BR' }],
  templateUrl: './financeiro-painel.component.html',
  styleUrl: './financeiro-painel.component.scss',
})
export class FinanceiroPainelComponent implements OnInit {
  private readonly api = inject(SheetsApiService);

  readonly carregando = signal(true);
  readonly erro = signal<string | null>(null);

  readonly periodoTotaisInicio = signal(
    ymdToDdMmYyyyFiltro(primeiroDiaMesYmdFiltro()),
  );
  readonly periodoTotaisFim = signal(ymdToDdMmYyyyFiltro(ymdHojeFiltro()));

  readonly periodoFluxoInicio = signal(
    ymdToDdMmYyyyFiltro(primeiroDiaMesYmdFiltro()),
  );
  readonly periodoFluxoFim = signal(ymdToDdMmYyyyFiltro(ymdHojeFiltro()));

  readonly periodoVendasInicio = signal(
    ymdToDdMmYyyyFiltro(primeiroDiaMesYmdFiltro()),
  );
  readonly periodoVendasFim = signal(ymdToDdMmYyyyFiltro(ymdHojeFiltro()));

  readonly resumoHoje = signal<FinPainelResumoCard[]>([
    {
      id: 'receber-hoje',
      titulo: 'A receber hoje',
      valor: 0,
      tema: 'receber',
      queryParams: queryParamsCardPainel('receber-hoje'),
    },
    {
      id: 'pagar-hoje',
      titulo: 'A pagar hoje',
      valor: 0,
      tema: 'pagar',
      queryParams: queryParamsCardPainel('pagar-hoje'),
    },
  ]);

  readonly totais = signal<FinPainelMetricaCard[]>([
    {
      id: 'recebidos',
      titulo: 'Recebidos',
      valor: 0,
      tema: 'recebidos',
      queryParams: {},
    },
    {
      id: 'a-receber',
      titulo: 'A Receber',
      valor: 0,
      tema: 'a-receber',
      queryParams: {},
    },
    {
      id: 'pagos',
      titulo: 'Pagos',
      valor: 0,
      tema: 'pagos',
      queryParams: {},
    },
    {
      id: 'a-pagar',
      titulo: 'A Pagar',
      valor: 0,
      tema: 'a-pagar',
      queryParams: {},
    },
  ]);

  readonly contas = signal<FinPainelContaCard[]>([
    { id: 'caixa', titulo: 'Caixa', valor: 0 },
    { id: 'banco', titulo: 'Banco', valor: 0 },
  ]);

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

  ngOnInit(): void {
    this.carregarResumo();
  }

  periodoLabel(inicio: string, fim: string): string {
    return `${this.ymdParaDdMm(inicio)} — ${this.ymdParaDdMm(fim)}`;
  }

  private carregarResumo(): void {
    const hoje = ymdHojeFiltro();
    const padrao = filtroPadraoTransacoes();
    const diTotais = ddMmYyyyToYmdFiltro(padrao.dataInicio) ?? ymdHojeFiltro();
    const dfTotais = ddMmYyyyToYmdFiltro(padrao.dataFim) ?? ymdHojeFiltro();

    this.carregando.set(true);
    this.erro.set(null);

    forkJoin({
      hoje: this.api.listTransacoesFinanceiras({
        dataInicio: hoje,
        dataFim: hoje,
      }),
      periodo: this.api.listTransacoesFinanceiras({
        dataInicio: diTotais,
        dataFim: dfTotais,
      }),
    }).subscribe({
      next: ({ hoje: itemsHoje, periodo: itemsPeriodo }) => {
        const linhasHoje = itemsHoje.map(mapFinTransacaoItemToUi);
        const linhasPeriodo = itemsPeriodo.map(mapFinTransacaoItemToUi);
        const periodoQuery = {
          dataInicio: padrao.dataInicio,
          dataFim: padrao.dataFim,
        };

        this.resumoHoje.set([
          {
            id: 'receber-hoje',
            titulo: 'A receber hoje',
            valor: valorCardVisao(linhasHoje, 'receber-hoje'),
            tema: 'receber',
            queryParams: queryParamsCardPainel('receber-hoje'),
          },
          {
            id: 'pagar-hoje',
            titulo: 'A pagar hoje',
            valor: valorCardVisao(linhasHoje, 'pagar-hoje'),
            tema: 'pagar',
            queryParams: queryParamsCardPainel('pagar-hoje'),
          },
        ]);

        this.totais.set([
          {
            id: 'recebidos',
            titulo: 'Recebidos',
            valor: valorCardVisaoPeriodo(linhasPeriodo, 'recebidos'),
            tema: 'recebidos',
            queryParams: queryParamsCardPainel('recebidos', periodoQuery),
          },
          {
            id: 'a-receber',
            titulo: 'A Receber',
            valor: valorCardVisaoPeriodo(linhasPeriodo, 'a-receber'),
            tema: 'a-receber',
            queryParams: queryParamsCardPainel('a-receber', periodoQuery),
          },
          {
            id: 'pagos',
            titulo: 'Pagos',
            valor: valorCardVisaoPeriodo(linhasPeriodo, 'pagos'),
            tema: 'pagos',
            queryParams: queryParamsCardPainel('pagos', periodoQuery),
          },
          {
            id: 'a-pagar',
            titulo: 'A Pagar',
            valor: valorCardVisaoPeriodo(linhasPeriodo, 'a-pagar'),
            tema: 'a-pagar',
            queryParams: queryParamsCardPainel('a-pagar', periodoQuery),
          },
        ]);

        this.periodoTotaisInicio.set(padrao.dataInicio);
        this.periodoTotaisFim.set(padrao.dataFim);
        this.carregando.set(false);
      },
      error: (e: Error) => {
        this.erro.set(
          e.message || 'Não foi possível carregar o resumo financeiro.',
        );
        this.carregando.set(false);
      },
    });
  }

  private ymdParaDdMm(ymdOrDdMm: string): string {
    const ddMm = /^(\d{2})-(\d{2})-(\d{4})$/.exec(ymdOrDdMm.trim());
    if (ddMm) return `${ddMm[1]}/${ddMm[2]}/${ddMm[3]}`;
    const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(ymdOrDdMm.trim().slice(0, 10));
    if (!m) return ymdOrDdMm;
    return `${m[3]}/${m[2]}/${m[1]}`;
  }
}
