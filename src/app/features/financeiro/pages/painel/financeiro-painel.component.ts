import { CurrencyPipe, registerLocaleData } from '@angular/common';
import localePt from '@angular/common/locales/pt';
import {
  Component,
  DestroyRef,
  HostListener,
  LOCALE_ID,
  OnInit,
  computed,
  inject,
  signal,
} from '@angular/core';
import { RouterLink } from '@angular/router';
import { Subscription, catchError, forkJoin, of } from 'rxjs';
import { SheetsApiService } from '../../../../core/services/sheets-api.service';
import { ClienteDrawerPeriodoFiltroComponent } from '../../../../shared/cliente-drawer-periodo-filtro/cliente-drawer-periodo-filtro.component';
import {
  mapFinTransacaoItemToUi,
  type FinTransacaoLinhaUi,
} from '../transacoes/fin-transacoes.mapper';
import {
  queryParamsCardPainel,
  valorCardVisao,
  valorCardVisaoPeriodo,
  ymdHojeFiltro,
  ymdToDdMmYyyyFiltro,
  primeiroDiaMesYmdFiltro,
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
    ClienteDrawerPeriodoFiltroComponent,
    FinFluxoCaixaChartComponent,
    FinVendasDiaChartComponent,
  ],
  providers: [{ provide: LOCALE_ID, useValue: 'pt-BR' }],
  templateUrl: './financeiro-painel.component.html',
  styleUrl: './financeiro-painel.component.scss',
})
export class FinanceiroPainelComponent implements OnInit {
  private readonly api = inject(SheetsApiService);
  private readonly destroyRef = inject(DestroyRef);

  readonly carregando = signal(true);
  readonly erro = signal<string | null>(null);

  /** Períodos em YMD — binding do `app-cliente-drawer-periodo-filtro`. */
  periodoTotaisInicioYmd = primeiroDiaMesYmdFiltro();
  periodoTotaisFimYmd = ymdHojeFiltro();
  periodoFluxoInicioYmd = primeiroDiaMesYmdFiltro();
  periodoFluxoFimYmd = ymdHojeFiltro();
  periodoVendasInicioYmd = primeiroDiaMesYmdFiltro();
  periodoVendasFimYmd = ymdHojeFiltro();

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

  /** Linhas do período de totais (para cross-hover). */
  private readonly linhasPeriodo = signal<FinTransacaoLinhaUi[]>([]);

  readonly activeDayYmd = signal<string | null>(null);

  private loadSub: Subscription | null = null;
  private totaisSub: Subscription | null = null;
  private fluxoSub: Subscription | null = null;
  private vendasSub: Subscription | null = null;

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

  ngOnInit(): void {
    this.destroyRef.onDestroy(() => {
      this.loadSub?.unsubscribe();
      this.totaisSub?.unsubscribe();
      this.fluxoSub?.unsubscribe();
      this.vendasSub?.unsubscribe();
    });
    this.carregarTudo();
  }

  @HostListener('document:keydown.escape')
  onEscape(): void {
    this.activeDayYmd.set(null);
  }

  onChartHoverDay(ymd: string | null): void {
    this.activeDayYmd.set(ymd);
  }

  onPeriodoTotaisAlterado(periodo?: { inicioYmd: string; fimYmd: string }): void {
    if (periodo?.inicioYmd && periodo?.fimYmd) {
      this.periodoTotaisInicioYmd = periodo.inicioYmd;
      this.periodoTotaisFimYmd = periodo.fimYmd;
    }
    this.activeDayYmd.set(null);
    this.carregarTotais();
  }

  onPeriodoFluxoAlterado(periodo?: { inicioYmd: string; fimYmd: string }): void {
    if (periodo?.inicioYmd && periodo?.fimYmd) {
      this.periodoFluxoInicioYmd = periodo.inicioYmd;
      this.periodoFluxoFimYmd = periodo.fimYmd;
    }
    this.activeDayYmd.set(null);
    this.carregarFluxo();
  }

  onPeriodoVendasAlterado(periodo?: { inicioYmd: string; fimYmd: string }): void {
    if (periodo?.inicioYmd && periodo?.fimYmd) {
      this.periodoVendasInicioYmd = periodo.inicioYmd;
      this.periodoVendasFimYmd = periodo.fimYmd;
    }
    this.activeDayYmd.set(null);
    this.carregarVendas();
  }

  private carregarTudo(): void {
    this.carregando.set(true);
    this.erro.set(null);
    this.activeDayYmd.set(null);
    this.loadSub?.unsubscribe();

    const hoje = ymdHojeFiltro();
    const diTotais = this.periodoTotaisInicioYmd;
    const dfTotais = this.periodoTotaisFimYmd;
    const diFluxo = this.periodoFluxoInicioYmd;
    const dfFluxo = this.periodoFluxoFimYmd;
    const diVendas = this.periodoVendasInicioYmd;
    const dfVendas = this.periodoVendasFimYmd;

    this.loadSub = forkJoin({
      hoje: this.api
        .listTransacoesFinanceiras({ dataInicio: hoje, dataFim: hoje })
        .pipe(catchError(() => of([]))),
      periodo: this.api
        .listTransacoesFinanceiras({
          dataInicio: diTotais,
          dataFim: dfTotais,
        })
        .pipe(catchError(() => of([]))),
      fluxo: this.api
        .listTransacoesFinanceiras({
          dataInicio: diFluxo,
          dataFim: dfFluxo,
          tipoData: 'pagamento',
        })
        .pipe(catchError(() => of([]))),
      vendas: this.api
        .listAgendamentos(diVendas, dfVendas)
        .pipe(catchError(() => of([]))),
    }).subscribe({
      next: ({ hoje: itemsHoje, periodo, fluxo, vendas }) => {
        this.aplicarResumoHoje(itemsHoje.map(mapFinTransacaoItemToUi));
        this.aplicarTotais(
          periodo.map(mapFinTransacaoItemToUi),
          diTotais,
          dfTotais,
        );
        this.aplicarFluxo(
          fluxo.map(mapFinTransacaoItemToUi),
          diFluxo,
          dfFluxo,
        );
        this.aplicarVendas(vendas, diVendas, dfVendas);
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

  private carregarTotais(): void {
    const di = this.periodoTotaisInicioYmd;
    const df = this.periodoTotaisFimYmd;
    this.totaisSub?.unsubscribe();
    this.totaisSub = this.api
      .listTransacoesFinanceiras({ dataInicio: di, dataFim: df })
      .pipe(catchError(() => of([])))
      .subscribe({
        next: (items) => {
          this.aplicarTotais(items.map(mapFinTransacaoItemToUi), di, df);
        },
        error: (e: Error) => {
          this.erro.set(e.message || 'Erro ao carregar totais.');
        },
      });
  }

  private carregarFluxo(): void {
    const di = this.periodoFluxoInicioYmd;
    const df = this.periodoFluxoFimYmd;
    this.fluxoSub?.unsubscribe();
    this.fluxoSub = this.api
      .listTransacoesFinanceiras({
        dataInicio: di,
        dataFim: df,
        tipoData: 'pagamento',
      })
      .pipe(catchError(() => of([])))
      .subscribe({
        next: (items) => {
          this.aplicarFluxo(items.map(mapFinTransacaoItemToUi), di, df);
        },
        error: (e: Error) => {
          this.erro.set(e.message || 'Erro ao carregar fluxo de caixa.');
        },
      });
  }

  private carregarVendas(): void {
    const di = this.periodoVendasInicioYmd;
    const df = this.periodoVendasFimYmd;
    this.vendasSub?.unsubscribe();
    this.vendasSub = this.api
      .listAgendamentos(di, df)
      .pipe(catchError(() => of([])))
      .subscribe({
        next: (items) => {
          this.aplicarVendas(items, di, df);
        },
        error: (e: Error) => {
          this.erro.set(e.message || 'Erro ao carregar vendas.');
        },
      });
  }

  private aplicarResumoHoje(linhasHoje: FinTransacaoLinhaUi[]): void {
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
  }

  private aplicarTotais(
    linhas: FinTransacaoLinhaUi[],
    diYmd: string,
    dfYmd: string,
  ): void {
    const periodoQuery = {
      dataInicio: ymdToDdMmYyyyFiltro(diYmd),
      dataFim: ymdToDdMmYyyyFiltro(dfYmd),
    };
    this.linhasPeriodo.set(linhas);
    this.totaisBase.set([
      {
        id: 'recebidos',
        titulo: 'Recebidos',
        valor: valorCardVisaoPeriodo(linhas, 'recebidos'),
        tema: 'recebidos',
        queryParams: queryParamsCardPainel('recebidos', periodoQuery),
      },
      {
        id: 'a-receber',
        titulo: 'A Receber',
        valor: valorCardVisaoPeriodo(linhas, 'a-receber'),
        tema: 'a-receber',
        queryParams: queryParamsCardPainel('a-receber', periodoQuery),
      },
      {
        id: 'pagos',
        titulo: 'Pagos',
        valor: valorCardVisaoPeriodo(linhas, 'pagos'),
        tema: 'pagos',
        queryParams: queryParamsCardPainel('pagos', periodoQuery),
      },
      {
        id: 'a-pagar',
        titulo: 'A Pagar',
        valor: valorCardVisaoPeriodo(linhas, 'a-pagar'),
        tema: 'a-pagar',
        queryParams: queryParamsCardPainel('a-pagar', periodoQuery),
      },
    ]);
  }

  private aplicarFluxo(
    linhas: FinTransacaoLinhaUi[],
    diYmd: string,
    dfYmd: string,
  ): void {
    this.serieFluxo.set(
      construirSerieFluxo(linhas, { inicioYmd: diYmd, fimYmd: dfYmd }),
    );
  }

  private aplicarVendas(
    atendimentos: Parameters<typeof construirSerieVendas>[0],
    diYmd: string,
    dfYmd: string,
  ): void {
    this.serieVendas.set(
      construirSerieVendas(atendimentos, {
        inicioYmd: diYmd,
        fimYmd: dfYmd,
      }),
    );
  }
}
