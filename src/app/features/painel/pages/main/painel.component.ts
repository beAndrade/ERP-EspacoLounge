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

/**
 * Local do salão para o clima (Open-Meteo, sem chave de API).
 * Ajuste `cidade`/`latitude`/`longitude` se o salão mudar de endereço.
 */
const SALAO_LOCAL = {
  cidade: 'Rio das Ostras',
  latitude: -22.5269,
  longitude: -41.945,
} as const;

interface PainelClimaVm {
  tempC: number;
  emoji: string;
  descricao: string;
}

interface PainelSaudacaoVm {
  emoji: string;
  texto: string;
}

/** Saudação por faixa horária (05–11:59 manhã, 12–17:59 tarde, resto noite). */
function saudacaoPorHora(hora: number): PainelSaudacaoVm {
  if (hora >= 5 && hora < 12) return { emoji: '🌅', texto: 'Bom dia' };
  if (hora >= 12 && hora < 18) return { emoji: '☀️', texto: 'Boa tarde' };
  return { emoji: '🌙', texto: 'Boa noite' };
}

/** Traduz o `weather_code` (WMO) do Open-Meteo em emoji + descrição PT-BR. */
function descreverClimaWmo(code: number): { emoji: string; descricao: string } {
  if (code === 0) return { emoji: '☀️', descricao: 'Céu limpo' };
  if (code === 1 || code === 2) return { emoji: '🌤️', descricao: 'Parcialmente nublado' };
  if (code === 3) return { emoji: '☁️', descricao: 'Nublado' };
  if (code === 45 || code === 48) return { emoji: '🌫️', descricao: 'Neblina' };
  if (code >= 51 && code <= 57) return { emoji: '🌦️', descricao: 'Garoa' };
  if (code >= 61 && code <= 67) return { emoji: '🌧️', descricao: 'Chuva' };
  if (code >= 71 && code <= 77) return { emoji: '🌨️', descricao: 'Neve' };
  if (code >= 80 && code <= 82) return { emoji: '🌧️', descricao: 'Pancadas de chuva' };
  if (code >= 85 && code <= 86) return { emoji: '🌨️', descricao: 'Pancadas de neve' };
  if (code >= 95) return { emoji: '⛈️', descricao: 'Tempestade' };
  return { emoji: '🌡️', descricao: 'Tempo estável' };
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

  /** Relógio "ao vivo": atualizado só quando o minuto muda (evita CD por segundo). */
  readonly relogio = signal(new Date());
  readonly clima = signal<PainelClimaVm | null>(null);
  readonly cidadeLocal = SALAO_LOCAL.cidade;

  private relogioTimer: ReturnType<typeof setInterval> | null = null;
  private climaTimer: ReturnType<typeof setInterval> | null = null;

  readonly saudacao = computed(() => saudacaoPorHora(this.relogio().getHours()));

  readonly horaLabel = computed(() =>
    new Intl.DateTimeFormat('pt-BR', {
      hour: '2-digit',
      minute: '2-digit',
    }).format(this.relogio()),
  );

  readonly dataCompletaLabel = computed(() => {
    const texto = new Intl.DateTimeFormat('pt-BR', {
      weekday: 'long',
      day: '2-digit',
      month: 'long',
      year: 'numeric',
    }).format(this.relogio());
    return texto.charAt(0).toUpperCase() + texto.slice(1);
  });

  readonly primeiroNome = computed(() => {
    const nome = this.sessao.nomeExibicao().trim();
    return nome.split(/\s+/)[0] || nome;
  });

  readonly focoLabel = computed(() => {
    const ymd = this.ctx.highlightedYmd();
    if (!ymd) return '';
    return ymdExibicaoBelasis(ymd) || ymd;
  });

  readonly contextoAtivo = computed(() => !!this.ctx.highlightedYmd());

  constructor() {
    this.destroyRef.onDestroy(() => {
      this.loadSub?.unsubscribe();
      if (this.relogioTimer) clearInterval(this.relogioTimer);
      if (this.climaTimer) clearInterval(this.climaTimer);
    });
  }

  @HostListener('document:keydown.escape')
  onEscape(): void {
    this.ctx.clear();
  }

  ngOnInit(): void {
    this.carregarCards();
    this.iniciarRelogio();
    this.carregarClima();
    /** Atualiza o clima a cada 15 min. */
    this.climaTimer = setInterval(() => this.carregarClima(), 15 * 60 * 1000);
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

  /** Verifica o relógio a cada segundo, mas só emite quando o minuto muda. */
  private iniciarRelogio(): void {
    let ultimoMinuto = this.horaLabel();
    this.relogioTimer = setInterval(() => {
      const agora = new Date();
      const label = new Intl.DateTimeFormat('pt-BR', {
        hour: '2-digit',
        minute: '2-digit',
      }).format(agora);
      if (label !== ultimoMinuto) {
        ultimoMinuto = label;
        this.relogio.set(agora);
      }
    }, 1000);
  }

  /** Busca a temperatura atual no Open-Meteo (API pública, sem chave). */
  private async carregarClima(): Promise<void> {
    const { latitude, longitude } = SALAO_LOCAL;
    const url =
      `https://api.open-meteo.com/v1/forecast?latitude=${latitude}` +
      `&longitude=${longitude}&current=temperature_2m,weather_code&timezone=auto`;
    try {
      const res = await fetch(url);
      if (!res.ok) return;
      const data = await res.json();
      const temp = data?.current?.temperature_2m;
      const code = data?.current?.weather_code;
      if (typeof temp !== 'number') return;
      const meta = descreverClimaWmo(Number(code));
      this.clima.set({
        tempC: Math.round(temp),
        emoji: meta.emoji,
        descricao: meta.descricao,
      });
    } catch {
      /** Silencioso: clima é informativo e não deve quebrar o painel. */
    }
  }

  formatMoeda(valor: number): string {
    return new Intl.NumberFormat('pt-BR', {
      style: 'currency',
      currency: 'BRL',
    }).format(valor);
  }

  atualizar(): void {
    this.carregarCards();
  }

  onPeriodoAlterado(): void {
    /**
     * Período controla apenas a seção "Análise do período" (séries dos gráficos).
     * Os cards de cima continuam sempre no dia de hoje, então não recarregam aqui.
     */
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
