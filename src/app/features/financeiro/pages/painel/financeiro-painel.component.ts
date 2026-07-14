import { CurrencyPipe, registerLocaleData } from '@angular/common';
import localePt from '@angular/common/locales/pt';
import {
  Component,
  HostListener,
  LOCALE_ID,
  OnInit,
  computed,
  inject,
  signal,
} from '@angular/core';
import { RouterLink } from '@angular/router';
import { catchError, forkJoin, of } from 'rxjs';
import { SheetsApiService } from '../../../../core/services/sheets-api.service';
import {
  mapFinTransacaoItemToUi,
  type FinTransacaoLinhaUi,
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
import { FinFluxoCaixaChartComponent } from './charts/fin-fluxo-caixa-chart.component';
import type {
  FluxoDiaPonto,
  VendasDiaPonto,
} from './charts/fin-painel-charts.model';
import {
  construirSerieFluxo,
  construirSerieVendas,
  filtrarLinhasDoDia,
  totaisDeLinhas,
} from './charts/fin-painel-charts.util';
import { FinVendasDiaChartComponent } from './charts/fin-vendas-dia-chart.component';

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

@Component({
  selector: 'app-financeiro-painel',
  standalone: true,
  imports: [
    CurrencyPipe,
    RouterLink,
    FinFluxoCaixaChartComponent,
    FinVendasDiaChartComponent,
  ],
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

  readonly totaisBase = signal<FinPainelMetricaCard[]>([
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

  readonly serieFluxo = signal<FluxoDiaPonto[]>([]);
  readonly serieVendas = signal<VendasDiaPonto[]>([]);

  /** Linhas do período (vencimento) para recalcular totais no cross-hover. */
  private readonly linhasPeriodo = signal<FinTransacaoLinhaUi[]>([]);

  /** Dia em foco (cross-hover entre gráficos). */
  readonly activeDayYmd = signal<string | null>(null);

  /**
   * Totais exibidos: período completo ou agregados do dia em foco.
   * `queryParams` / navegação permanecem os do período base.
   */
  readonly totais = computed(() => {
    const base = this.totaisBase();
    const ymd = this.activeDayYmd();
    if (!ymd) return base;

    const t = totaisDeLinhas(filtrarLinhasDoDia(this.linhasPeriodo(), ymd));
    return base.map((card) => {
      let valor = card.valor;
      switch (card.id) {
        case 'recebidos':
          valor = t.recebidos;
          break;
        case 'a-receber':
          valor = t.aReceber;
          break;
        case 'pagos':
          valor = t.pagos;
          break;
        case 'a-pagar':
          valor = t.aPagar;
          break;
      }
      return { ...card, valor };
    });
  });

  readonly focoDiaLabel = computed(() => {
    const ymd = this.activeDayYmd();
    if (!ymd) return null;
    const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(ymd);
    if (!m) return ymd;
    return `${m[3]}/${m[2]}/${m[1]}`;
  });

  ngOnInit(): void {
    this.carregarResumo();
  }

  @HostListener('document:keydown.escape')
  onEscape(): void {
    this.activeDayYmd.set(null);
  }

  periodoLabel(inicio: string, fim: string): string {
    return `${this.ymdParaDdMm(inicio)} — ${this.ymdParaDdMm(fim)}`;
  }

  onChartHoverDay(ymd: string | null): void {
    this.activeDayYmd.set(ymd);
  }

  private carregarResumo(): void {
    const hoje = ymdHojeFiltro();
    const padrao = filtroPadraoTransacoes();
    const diTotais = ddMmYyyyToYmdFiltro(padrao.dataInicio) ?? primeiroDiaMesYmdFiltro();
    const dfTotais = ddMmYyyyToYmdFiltro(padrao.dataFim) ?? ymdHojeFiltro();
    /** Gráficos: do dia 1 do mês até hoje (não o fim do mês futuro). */
    const diCharts = primeiroDiaMesYmdFiltro();
    const dfCharts = hoje;

    this.carregando.set(true);
    this.erro.set(null);
    this.activeDayYmd.set(null);

    forkJoin({
      hoje: this.api.listTransacoesFinanceiras({
        dataInicio: hoje,
        dataFim: hoje,
      }),
      periodo: this.api.listTransacoesFinanceiras({
        dataInicio: diTotais,
        dataFim: dfTotais,
      }),
      fluxo: this.api
        .listTransacoesFinanceiras({
          dataInicio: diCharts,
          dataFim: dfCharts,
          tipoData: 'pagamento',
        })
        .pipe(catchError(() => of([]))),
      vendas: this.api
        .listAgendamentos(diCharts, dfCharts)
        .pipe(catchError(() => of([]))),
    }).subscribe({
      next: ({ hoje: itemsHoje, periodo: itemsPeriodo, fluxo, vendas }) => {
        const linhasHoje = itemsHoje.map(mapFinTransacaoItemToUi);
        const linhasPeriodo = itemsPeriodo.map(mapFinTransacaoItemToUi);
        const linhasFluxo = fluxo.map(mapFinTransacaoItemToUi);
        const periodoQuery = {
          dataInicio: padrao.dataInicio,
          dataFim: padrao.dataFim,
        };

        this.linhasPeriodo.set(linhasPeriodo);

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

        this.totaisBase.set([
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

        this.serieFluxo.set(
          construirSerieFluxo(linhasFluxo, {
            inicioYmd: diCharts,
            fimYmd: dfCharts,
          }),
        );
        this.serieVendas.set(
          construirSerieVendas(vendas, {
            inicioYmd: diCharts,
            fimYmd: dfCharts,
          }),
        );

        const diDdMm = ymdToDdMmYyyyFiltro(diCharts);
        const dfDdMm = ymdToDdMmYyyyFiltro(dfCharts);
        this.periodoTotaisInicio.set(padrao.dataInicio);
        this.periodoTotaisFim.set(padrao.dataFim);
        this.periodoFluxoInicio.set(diDdMm);
        this.periodoFluxoFim.set(dfDdMm);
        this.periodoVendasInicio.set(diDdMm);
        this.periodoVendasFim.set(dfDdMm);
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
