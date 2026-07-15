import {
  Component,
  DestroyRef,
  HostListener,
  OnInit,
  computed,
  inject,
  signal,
} from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { NavigationEnd, Router } from '@angular/router';
import { Subscription, catchError, finalize, forkJoin, of } from 'rxjs';
import { filter } from 'rxjs/operators';
import { SheetsApiService } from '../../../../core/services/sheets-api.service';
import { SessaoUsuarioService } from '../../../../core/services/sessao-usuario.service';
import { toYmd } from '../../../../core/utils/atendimento-display';
import { ClienteDrawerPeriodoFiltroComponent } from '../../../../shared/cliente-drawer-periodo-filtro/cliente-drawer-periodo-filtro.component';
import { ymdExibicaoBelasis } from '../../../../shared/cliente-drawer-periodo-filtro/cliente-periodo-filtro.util';
import { PainelChartBarsComponent } from '../../components/charts/painel-chart-bars/painel-chart-bars.component';
import { PainelChartFunnelComponent } from '../../components/charts/painel-chart-funnel/painel-chart-funnel.component';
import { PainelChartHeatmapComponent } from '../../components/charts/painel-chart-heatmap/painel-chart-heatmap.component';
import { PainelChartLineComponent } from '../../components/charts/painel-chart-line/painel-chart-line.component';
import { PainelChartPieComponent } from '../../components/charts/painel-chart-pie/painel-chart-pie.component';
import { PainelChartTooltipComponent } from '../../components/painel-chart-tooltip/painel-chart-tooltip.component';
import { PainelMetricValueComponent } from '../../components/painel-metric-value/painel-metric-value.component';
import { PainelSmartCardComponent } from '../../components/painel-smart-card/painel-smart-card.component';
import { PainelSparklineComponent } from '../../components/painel-sparkline/painel-sparkline.component';
import {
  emptyAgendaCardVm,
  emptyChartsVm,
  emptyClientesCardVm,
  emptyEstoqueCardVm,
  emptyFaturamentoCardVm,
  emptyProfissionaisCardVm,
  type PainelAgendaCardVm,
  type PainelChartsVm,
  type PainelClientesCardVm,
  type PainelEstoqueCardVm,
  type PainelFaturamentoCardVm,
  type PainelProfissionaisCardVm,
} from '../../models/painel-dashboard.models';
import { PainelDashboardContextService } from '../../services/painel-dashboard-context.service';
import {
  mapAtendimentosParaAgendaCardVm,
  mapCaixaDiaParaFaturamentoCardVm,
} from '../../utils/painel-dashboard.util';

function periodoPadraoUltimos15Dias(): { inicio: string; fim: string } {
  const fim = new Date();
  const inicio = new Date(fim);
  inicio.setDate(inicio.getDate() - 14);
  return { inicio: toYmd(inicio), fim: toYmd(fim) };
}

@Component({
  selector: 'app-painel',
  standalone: true,
  imports: [
    ClienteDrawerPeriodoFiltroComponent,
    PainelSmartCardComponent,
    PainelMetricValueComponent,
    PainelSparklineComponent,
    PainelChartTooltipComponent,
    PainelChartLineComponent,
    PainelChartBarsComponent,
    PainelChartPieComponent,
    PainelChartFunnelComponent,
    PainelChartHeatmapComponent,
  ],
  templateUrl: './painel.component.html',
  styleUrl: './painel.component.scss',
})
export class PainelComponent implements OnInit {
  private readonly api = inject(SheetsApiService);
  private readonly router = inject(Router);
  private readonly destroyRef = inject(DestroyRef);
  readonly sessao = inject(SessaoUsuarioService);
  readonly ctx = inject(PainelDashboardContextService);

  readonly filtroAberto = signal(false);
  readonly carregandoCards = signal(false);

  readonly faturamento = signal<PainelFaturamentoCardVm>(emptyFaturamentoCardVm());
  readonly agenda = signal<PainelAgendaCardVm>(emptyAgendaCardVm());
  readonly clientes = signal<PainelClientesCardVm>(emptyClientesCardVm());
  readonly profissionais = signal<PainelProfissionaisCardVm>(
    emptyProfissionaisCardVm(),
  );
  readonly estoque = signal<PainelEstoqueCardVm>(emptyEstoqueCardVm());
  /**
   * Séries dos painéis grandes — vazias até haver API agregada.
   * O filtro de período (`periodoInicio`/`periodoFim`) fica reservado para essas séries.
   * Agenda e Caixa continuam no recorte de **hoje** nesta fase.
   */
  readonly charts = signal<PainelChartsVm>(emptyChartsVm());

  private readonly padrao = periodoPadraoUltimos15Dias();
  periodoInicio = this.padrao.inicio;
  periodoFim = this.padrao.fim;

  private loadSub: Subscription | null = null;
  private skipNextNavReload = true;

  readonly focoLabel = computed(() => {
    const ymd = this.ctx.highlightedYmd();
    if (!ymd) return '';
    return ymdExibicaoBelasis(ymd) || ymd;
  });

  readonly contextoAtivo = computed(() => !!this.ctx.highlightedYmd());

  constructor() {
    this.destroyRef.onDestroy(() => this.loadSub?.unsubscribe());
  }

  @HostListener('document:keydown.escape')
  onEscape(): void {
    this.ctx.clear();
  }

  ngOnInit(): void {
    this.carregarCards();
    this.router.events
      .pipe(
        filter((e): e is NavigationEnd => e instanceof NavigationEnd),
        filter((e) => e.urlAfterRedirects.split('?')[0] === '/painel'),
        takeUntilDestroyed(this.destroyRef),
      )
      .subscribe(() => {
        if (this.skipNextNavReload) {
          this.skipNextNavReload = false;
          return;
        }
        this.carregarCards();
      });
  }

  nomeUsuario(): string {
    return this.sessao.nomeExibicao();
  }

  labelPeriodoFiltro(): string {
    const a = ymdExibicaoBelasis(this.periodoInicio);
    const b = ymdExibicaoBelasis(this.periodoFim);
    if (!a || !b) return 'Selecionar período';
    return `${a} ➔ ${b}`;
  }

  formatMoeda(valor: number): string {
    return new Intl.NumberFormat('pt-BR', {
      style: 'currency',
      currency: 'BRL',
    }).format(valor);
  }

  toggleFiltro(): void {
    this.filtroAberto.update((v) => !v);
  }

  abrirFiltro(): void {
    this.filtroAberto.set(true);
  }

  atualizar(): void {
    this.carregarCards();
  }

  onPeriodoAlterado(): void {
    /** Período guardado para séries futuras; reload dos cards de hoje. */
    this.carregarCards();
  }

  /**
   * Carrega Agenda (hoje) e Receitas/caixa (hoje).
   * Clientes / Profissionais / Estoque / charts grandes ficam vazios até API.
   */
  private carregarCards(): void {
    const hoje = toYmd(new Date());
    this.loadSub?.unsubscribe();
    this.carregandoCards.set(true);

    this.loadSub = forkJoin({
      atendimentos: this.api
        .listAgendamentos(hoje, hoje)
        .pipe(catchError(() => of([]))),
      caixa: this.api.getCaixaDia(hoje).pipe(catchError(() => of(null))),
    })
      .pipe(finalize(() => this.carregandoCards.set(false)))
      .subscribe(({ atendimentos, caixa }) => {
        this.agenda.set(mapAtendimentosParaAgendaCardVm(atendimentos, hoje));
        if (caixa) {
          this.faturamento.set(mapCaixaDiaParaFaturamentoCardVm(caixa));
        } else {
          this.faturamento.set(emptyFaturamentoCardVm());
        }
      });
  }
}
