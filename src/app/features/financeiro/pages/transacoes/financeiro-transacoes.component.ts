import { CurrencyPipe, registerLocaleData } from '@angular/common';
import localePt from '@angular/common/locales/pt';
import {
  Component,
  HostListener,
  LOCALE_ID,
  OnDestroy,
  OnInit,
  ViewChild,
  ChangeDetectorRef,
  ElementRef,
  inject,
  signal,
} from '@angular/core';
import { FormsModule } from '@angular/forms';
import { ActivatedRoute, Router } from '@angular/router';
import { catchError, forkJoin, map, of, switchMap, throwError, type Observable } from 'rxjs';
import type {
  CategoriaFinanceiraItem,
  Cliente,
  ComandaResumoPagamentos,
} from '../../../../core/models/api.models';
import { parseFiltroDataDdMm } from '../../../../core/utils/atendimento-display';
import { mapFormasParaNomes } from '../../../../core/utils/fin-formas-pagamento.util';
import { SheetsApiService } from '../../../../core/services/sheets-api.service';
import { ClienteDrawerPeriodoFiltroComponent } from '../../../../shared/cliente-drawer-periodo-filtro/cliente-drawer-periodo-filtro.component';
import { NovaComandaDrawerComponent } from '../../../agenda/pages/hub/nova-comanda-drawer.component';
import { FaturarDrawerComponent } from '../../../agenda/pages/hub/faturar-drawer.component';
import type { ComandaDrawerContextoAgenda } from '../../../agenda/pages/hub/comanda-drawer.types';
import type { SaasSelectOption } from '../../../agenda/pages/novo/saas-select.component';
import {
  ClienteCadastroDrawerService,
  type AbrirCadastroClientePayload,
} from '../../../../shared/cliente-cadastro-drawer/cliente-cadastro-drawer.service';
import { abrirCadastroClienteDesdeSidebarComanda } from '../../../../shared/cliente-cadastro-drawer/comanda-drawer-sidebar-cadastro.util';
import {
  FinTransacaoEditarDrawerComponent,
  type FinTransacaoEditarSubmit,
} from './fin-transacao-editar-drawer.component';
import { FinFiltrosFloatingTipComponent } from './fin-filtros-floating-tip.component';
import {
  FinTransacaoNovoDrawerComponent,
  type FinTransacaoNovoSubmit,
  type FinTransacaoNovoTipo,
} from './fin-transacao-novo-drawer.component';
import {
  FinTransacoesTotaisModalComponent,
  type FinTransacoesTotaisResumo,
} from './fin-transacoes-totais-modal.component';
import { AppToastService } from '../../../../shared/app-toast/app-toast.service';
import { UI_TIP_SHOW_DELAY_MS } from '../../../../shared/ui-tip-trigger/ui-tip-delay';
import { UiTipTriggerComponent } from '../../../../shared/ui-tip-trigger/ui-tip-trigger.component';
import { AgendaModalCalendarComponent } from '../../../agenda/pages/novo/agenda-modal-calendar.component';
import {
  mapFinTransacaoItemToUi,
  type FinTransacaoLinhaUi,
} from './fin-transacoes.mapper';
import {
  calcularTotaisTransacoes,
  filtroPadraoTransacoes,
  filtroParaQueryParams,
  linhaNoPeriodoPorTipoData,
  linhaPassaFiltroNaturezaCheckboxes,
  linhaPassaFiltroStatusCheckboxes,
  primeiroDiaMesYmdFiltro,
  queryParamsParaFiltro,
  ultimoDiaMesYmdFiltro,
  type FinTransacoesFiltroNatureza,
  type FinTransacoesFiltroStatus,
  type FinTransacoesFiltroTipoData,
  type FinTransacoesVisaoPreset,
} from './fin-transacoes-filtro.util';

export type { FinTransacaoLinhaUi };

registerLocaleData(localePt);

type OrdenacaoData = 'asc' | 'desc';
type FiltroNatureza = FinTransacoesFiltroNatureza;
type FiltroStatus = FinTransacoesFiltroStatus;

function ymdToDdMmYyyy(ymd: string): string {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(ymd.trim().slice(0, 10));
  if (!m) return '';
  return `${m[3]}-${m[2]}-${m[1]}`;
}

function ymdHoje(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

const DRAWER_ANIM_MS = 430;

type FaturarDrawerCtx = {
  idAtendimento: string;
  resumo: ComandaResumoPagamentos;
  creditoAUsar?: number;
  modoVerPagamentos?: boolean;
};

@Component({
  selector: 'app-financeiro-transacoes',
  standalone: true,
  imports: [
    CurrencyPipe,
    FormsModule,
    ClienteDrawerPeriodoFiltroComponent,
    FinFiltrosFloatingTipComponent,
    FinTransacaoNovoDrawerComponent,
    FinTransacoesTotaisModalComponent,
    FinTransacaoEditarDrawerComponent,
    NovaComandaDrawerComponent,
    FaturarDrawerComponent,
    UiTipTriggerComponent,
    AgendaModalCalendarComponent,
  ],
  providers: [{ provide: LOCALE_ID, useValue: 'pt-BR' }],
  templateUrl: './financeiro-transacoes.component.html',
  styleUrl: './financeiro-transacoes.component.scss',
})
export class FinanceiroTransacoesComponent implements OnInit, OnDestroy {
  private readonly api = inject(SheetsApiService);
  private readonly cdr = inject(ChangeDetectorRef);
  private readonly cadastroDrawer = inject(ClienteCadastroDrawerService);
  private readonly toast = inject(AppToastService);
  private readonly route = inject(ActivatedRoute);
  private readonly router = inject(Router);

  @ViewChild(NovaComandaDrawerComponent)
  comandaDrawerRef?: NovaComandaDrawerComponent;

  comandaPainelAberto = false;
  comandaDrawerPanelOpen = false;
  comandaDrawerContexto: ComandaDrawerContextoAgenda | null = null;
  comandaDataYmdParaFaturar: string | null = null;
  private comandaDrawerCloseTimer: ReturnType<typeof setTimeout> | null = null;

  private readonly comandaContextoHolder = {
    get: () => this.comandaDrawerContexto,
    set: (ctx: ComandaDrawerContextoAgenda) => {
      this.comandaDrawerContexto = ctx;
    },
  };

  faturarDrawerAberto = false;
  faturarDrawerPanelOpen = false;
  faturarCtx: FaturarDrawerCtx | null = null;
  private faturarDrawerCloseTimer: ReturnType<typeof setTimeout> | null = null;

  editarDrawerAberto = false;
  editarDrawerPanelOpen = false;
  editarLinha: FinTransacaoLinhaUi | null = null;
  readonly editarSalvando = signal(false);
  private editarDrawerCloseTimer: ReturnType<typeof setTimeout> | null = null;

  novoDrawerAberto = false;
  novoDrawerPanelOpen = false;
  readonly novoDrawerTipo = signal<FinTransacaoNovoTipo>('despesa');
  readonly novoDrawerSalvando = signal(false);
  private novoDrawerCloseTimer: ReturnType<typeof setTimeout> | null = null;

  private pageScrollLockAtivo = false;
  private bodyScrollPreDrawer = 0;
  private abrindoComanda = false;

  readonly opcoesItensPorPagina = [10, 20, 50];

  linhasFonte: FinTransacaoLinhaUi[] = [];
  carregando = false;
  erro = '';

  dataInicio = ymdToDdMmYyyy(primeiroDiaMesYmdFiltro());
  dataFim = ymdToDdMmYyyy(ultimoDiaMesYmdFiltro());
  periodoInicioYmd = primeiroDiaMesYmdFiltro();
  periodoFimYmd = ultimoDiaMesYmdFiltro();
  filtroNatureza: FiltroNatureza = 'todos';
  filtroStatus: FiltroStatus = 'todos';
  filtroVisao: FinTransacoesVisaoPreset | null = null;

  filtroReceber = true;
  filtroPagar = true;
  filtroTipoData: FinTransacoesFiltroTipoData = 'vencimento';
  statusPago = true;
  statusEmAberto = true;
  statusAtrasado = true;

  private readonly formasOpcoes = signal<string[]>([]);
  private readonly categoriasOpcoes = signal<CategoriaFinanceiraItem[]>([]);
  private formasMarcadas = new Set<string>();
  private categoriasMarcadas = new Set<number>();
  private opcoesFiltroCarregadas = false;

  private queryParamsInicializado = false;
  private ultimoCarregamentoChave = '';

  ordenacaoData: OrdenacaoData = 'desc';
  dataSortTipVisivel = false;
  private dataSortTipSuprimida = false;
  private dataSortTipShowTimer: ReturnType<typeof setTimeout> | null = null;

  buscaAberta = false;
  busca = '';
  pagina = 1;
  itensPorPagina = 20;
  perPageMenuAberto = false;
  novoMenuAberto = false;
  novoMenuFechando = false;
  filtrosAbertos = false;
  pulsoToolbarBusca = false;
  pulsoToolbarFiltro = false;
  pulsoToolbarNovo = false;
  mensagemAcao: string | null = null;

  readonly modalTotaisAberto = signal(false);
  readonly resumoTotais = signal<FinTransacoesTotaisResumo>({
    recebidos: 0,
    aReceber: 0,
    pagos: 0,
    aPagar: 0,
    quantidadeLinhas: 0,
  });

  private readonly duracaoPulsoToolbarMs = 600;
  private readonly duracaoNovoMenuAnimMs = 420;
  private tPulsoBusca: ReturnType<typeof setTimeout> | null = null;
  private tPulsoFiltro: ReturnType<typeof setTimeout> | null = null;
  private tPulsoNovo: ReturnType<typeof setTimeout> | null = null;
  private tNovoMenuFechar: ReturnType<typeof setTimeout> | null = null;

  @ViewChild('novoMenuPanel', { static: true })
  private novoMenuPanel?: ElementRef<HTMLUListElement>;
  private tMensagemAcao: ReturnType<typeof setTimeout> | null = null;

  private readonly selecionados = signal<ReadonlySet<number>>(new Set());
  excluindoId: number | null = null;
  liquidandoPagoId: number | null = null;
  estornoModalLinha: FinTransacaoLinhaUi | null = null;
  estornoModalSalvando = false;
  exclusaoModalLinha: FinTransacaoLinhaUi | null = null;
  exclusaoModalSalvando = false;
  pagoPopoverLinhaId: number | null = null;
  pagoPopoverData = ymdHoje();
  pagamentoModalLinha: FinTransacaoLinhaUi | null = null;
  pagamentoModalData = ymdHoje();
  pagamentoModalSalvando = false;

  ngOnInit(): void {
    this.carregarOpcoesFiltrosSidebar();

    this.route.queryParamMap.subscribe((params) => {
      const raw: Record<string, string | undefined> = {};
      for (const key of params.keys) {
        raw[key] = params.get(key) ?? undefined;
      }
      const tinhaVisao = !!String(raw['visao'] ?? '').trim();
      const filtro = queryParamsParaFiltro(raw);
      const carregamentoChave = `${filtro.dataInicio}|${filtro.dataFim}|${filtro.tipoData ?? 'vencimento'}`;
      const carregamentoMudou = carregamentoChave !== this.ultimoCarregamentoChave;

      this.dataInicio = filtro.dataInicio;
      this.dataFim = filtro.dataFim;
      this.syncPeriodoYmdFromDdMm();
      this.filtroNatureza = filtro.natureza;
      this.filtroStatus = filtro.status;
      this.filtroVisao = filtro.visao ?? null;
      this.filtroTipoData = filtro.tipoData ?? 'vencimento';
      // Só aplica checkboxes a partir da URL na entrada ou preset do Painel;
      // evita reverter receber/pagar ao sincronizar URL após toggle no sidebar.
      if (!this.queryParamsInicializado || tinhaVisao) {
        this.aplicarFiltroEstadoParaUi(filtro.natureza, filtro.status);
      }
      if (tinhaVisao) this.filtrosAbertos = true;

      if (!tinhaVisao && !this.queryParamsInicializado) {
        this.syncUrlFromFiltro();
      }

      if (!this.queryParamsInicializado || carregamentoMudou) {
        this.carregar();
      }
      this.queryParamsInicializado = true;
      this.pagina = 1;

      const novo = String(params.get('novo') ?? '').trim().toLowerCase();
      if (novo === 'receita' || novo === 'despesa' || novo === 'vale') {
        queueMicrotask(() => {
          if (novo === 'receita') this.abrirNovoRecebimento();
          else if (novo === 'despesa') this.abrirNovoDespesa();
          else this.abrirNovoVale();
          void this.router.navigate([], {
            relativeTo: this.route,
            queryParams: { novo: null },
            queryParamsHandling: 'merge',
            replaceUrl: true,
          });
        });
      }
    });
  }

  ngOnDestroy(): void {
    this.clearDataSortTipShowTimer();
    if (this.comandaDrawerCloseTimer != null) {
      clearTimeout(this.comandaDrawerCloseTimer);
    }
    if (this.faturarDrawerCloseTimer != null) {
      clearTimeout(this.faturarDrawerCloseTimer);
    }
    if (this.editarDrawerCloseTimer != null) {
      clearTimeout(this.editarDrawerCloseTimer);
    }
    if (this.novoDrawerCloseTimer != null) {
      clearTimeout(this.novoDrawerCloseTimer);
    }
    if (this.pageScrollLockAtivo) {
      this.desbloquearScrollPagina();
    }
    this.cancelarFechamentoNovoMenu();
    if (this.tPulsoNovo != null) window.clearTimeout(this.tPulsoNovo);
  }

  carregar(): void {
    const diTxt = this.dataInicio.trim();
    const dfTxt = this.dataFim.trim();
    const di = parseFiltroDataDdMm(diTxt);
    const df = parseFiltroDataDdMm(dfTxt);
    if (!diTxt || !dfTxt || !di || !df) {
      this.erro =
        'Preencha data inicial e final (ex.: 01-05-2026). Também aceita barras.';
      return;
    }
    if (di > df) {
      this.erro = 'A data inicial não pode ser posterior à data final.';
      return;
    }

    this.carregando = true;
    this.erro = '';
    this.api
      .listTransacoesFinanceiras({
        dataInicio: di,
        dataFim: df,
        tipoData: this.filtroTipoData,
      })
      .subscribe({
      next: (items) => {
        this.linhasFonte = items.map(mapFinTransacaoItemToUi);
        this.selecionados.set(new Set());
        this.pagina = 1;
        this.ultimoCarregamentoChave = `${diTxt}|${dfTxt}|${this.filtroTipoData}`;
        this.carregando = false;
      },
      error: (e: Error) => {
        this.erro =
          e.message ||
          'Não foi possível carregar transações. Confirme a API e as migrações.';
        this.linhasFonte = [];
        this.carregando = false;
      },
    });
  }

  /** Sincroniza URL e recarrega da API só se o período mudou; checkboxes filtram na hora. */
  private aplicarFiltrosAutomatico(): void {
    this.syncDdMmFromPeriodoYmd();
    this.filtroNatureza = this.derivarNaturezaParaUrl();
    this.filtroStatus = this.derivarStatusParaUrl();
    this.syncUrlFromFiltro();
    const chave = `${this.dataInicio.trim()}|${this.dataFim.trim()}|${this.filtroTipoData}`;
    if (chave !== this.ultimoCarregamentoChave) {
      this.carregar();
    }
  }

  /** Tipo receber/pagar: filtra na hora e grava natureza na URL (sem recarregar API). */
  private aplicarFiltrosNaturezaNaHora(): void {
    this.filtroNatureza = this.derivarNaturezaParaUrl();
    this.syncUrlFromFiltro();
  }

  /** Só «Contas a receber» marcado — lista e valores em verde. */
  get filtroSomenteReceber(): boolean {
    return this.filtroReceber && !this.filtroPagar;
  }

  /** Só «Contas a pagar» marcado — lista e valores em vermelho. */
  get filtroSomentePagar(): boolean {
    return this.filtroPagar && !this.filtroReceber;
  }

  get linhasFiltradas(): FinTransacaoLinhaUi[] {
    const inicio = this.periodoInicioYmd;
    const fim = this.periodoFimYmd;
    let list = [...this.linhasFonte];
    list = list.filter(
      (r) =>
        linhaPassaFiltroNaturezaCheckboxes(r, this.filtroReceber, this.filtroPagar) &&
        linhaPassaFiltroStatusCheckboxes(r, {
          pago: this.statusPago,
          emAberto: this.statusEmAberto,
          atrasado: this.statusAtrasado,
        }) &&
        linhaNoPeriodoPorTipoData(r, this.filtroTipoData, inicio, fim) &&
        this.linhaPassaForma(r) &&
        this.linhaPassaCategoria(r),
    );
    const q = this.busca.trim().toLowerCase();
    if (q) {
      list = list.filter((row) => this.linhaMatchesBusca(row, q));
    }
    const dir = this.ordenacaoData === 'asc' ? 1 : -1;
    return list.sort((a, b) => a.dataYmd.localeCompare(b.dataYmd) * dir);
  }

  get linhasPagina(): FinTransacaoLinhaUi[] {
    const start = (this.pagina - 1) * this.itensPorPagina;
    return this.linhasFiltradas.slice(start, start + this.itensPorPagina);
  }

  get totalPaginas(): number {
    const n = this.linhasFiltradas.length;
    return Math.max(1, Math.ceil(n / this.itensPorPagina) || 1);
  }

  get podePaginaAnterior(): boolean {
    return this.pagina > 1;
  }

  get podePaginaSeguinte(): boolean {
    return this.pagina < this.totalPaginas;
  }

  totalExibido(): number {
    return this.linhasFiltradas.length;
  }

  private linhaMatchesBusca(row: FinTransacaoLinhaUi, q: string): boolean {
    const qDigits = q.replace(/\D/g, '');
    const brutoBr = row.valorBruto.toLocaleString('pt-BR', {
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    });
    const liquidoBr = row.valorLiquido.toLocaleString('pt-BR', {
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    });
    const brutoDigits = brutoBr.replace(/\D/g, '');
    const liquidoDigits = liquidoBr.replace(/\D/g, '');
    const blob = [
      row.titular,
      row.subtitulo,
      row.origem,
      row.formaPagamento,
      row.categoria,
      row.status,
      this.formatarData(row.dataYmd),
      row.dataYmd,
      brutoBr,
      liquidoBr,
      String(row.valorBruto),
      String(row.valorLiquido),
    ]
      .join(' ')
      .toLowerCase();
    return (
      blob.includes(q) ||
      (qDigits.length > 0 &&
        (brutoDigits.includes(qDigits) || liquidoDigits.includes(qDigits)))
    );
  }

  get buscaPlaceholder(): string {
    return this.buscaAberta
      ? 'Procure por cliente, profissional ou valor...'
      : '';
  }

  fecharPainelBusca(): void {
    this.buscaAberta = false;
  }

  private abrirPainelBusca(): void {
    this.dispararPulsoToolbar('busca');
    this.buscaAberta = true;
    queueMicrotask(() => {
      document.getElementById('fin-trans-busca')?.focus();
    });
  }

  private dispararPulsoToolbar(which: 'busca' | 'filtro' | 'novo'): void {
    if (which === 'busca') {
      if (this.tPulsoBusca != null) window.clearTimeout(this.tPulsoBusca);
      this.pulsoToolbarBusca = false;
      queueMicrotask(() => {
        this.pulsoToolbarBusca = true;
        this.tPulsoBusca = window.setTimeout(() => {
          this.pulsoToolbarBusca = false;
        }, this.duracaoPulsoToolbarMs);
      });
      return;
    }
    if (which === 'filtro') {
      if (this.tPulsoFiltro != null) window.clearTimeout(this.tPulsoFiltro);
      this.pulsoToolbarFiltro = false;
      queueMicrotask(() => {
        this.pulsoToolbarFiltro = true;
        this.tPulsoFiltro = window.setTimeout(() => {
          this.pulsoToolbarFiltro = false;
        }, this.duracaoPulsoToolbarMs);
      });
      return;
    }
    if (this.tPulsoNovo != null) window.clearTimeout(this.tPulsoNovo);
    this.pulsoToolbarNovo = false;
    queueMicrotask(() => {
      this.pulsoToolbarNovo = true;
      this.tPulsoNovo = window.setTimeout(() => {
        this.pulsoToolbarNovo = false;
      }, this.duracaoPulsoToolbarMs);
    });
  }

  private cancelarFechamentoNovoMenu(): void {
    if (this.tNovoMenuFechar != null) {
      window.clearTimeout(this.tNovoMenuFechar);
      this.tNovoMenuFechar = null;
    }
    const el = this.novoMenuPanel?.nativeElement;
    if (el) {
      el.removeEventListener('transitionend', this.onTransitionEndFecharNovoMenu);
    }
    this.novoMenuFechando = false;
  }

  private readonly onTransitionEndFecharNovoMenu = (ev: Event): void => {
    const el = this.novoMenuPanel?.nativeElement;
    if (!el || ev.target !== el) return;
    const te = ev as TransitionEvent;
    if (te.propertyName !== 'opacity') return;
    this.finalizarFechamentoNovoMenu();
  };

  private finalizarFechamentoNovoMenu(): void {
    this.cancelarFechamentoNovoMenu();
    this.novoMenuAberto = false;
    this.cdr.detectChanges();
  }

  private abrirNovoMenu(): void {
    this.cancelarFechamentoNovoMenu();
    this.novoMenuAberto = true;
    this.cdr.detectChanges();
  }

  private fecharNovoMenuAnimado(): void {
    if (!this.novoMenuAberto || this.novoMenuFechando) return;
    const el = this.novoMenuPanel?.nativeElement;

    this.cancelarFechamentoNovoMenu();

    if (!el) {
      this.finalizarFechamentoNovoMenu();
      return;
    }

    el.addEventListener('transitionend', this.onTransitionEndFecharNovoMenu);

    requestAnimationFrame(() => {
      requestAnimationFrame(() => {
        if (!this.novoMenuAberto) return;
        this.novoMenuFechando = true;
        this.cdr.detectChanges();

        this.tNovoMenuFechar = window.setTimeout(() => {
          if (this.novoMenuFechando) this.finalizarFechamentoNovoMenu();
        }, this.duracaoNovoMenuAnimMs + 80);
      });
    });
  }

  private mostrarMensagemAcao(texto: string): void {
    if (this.tMensagemAcao != null) window.clearTimeout(this.tMensagemAcao);
    this.mensagemAcao = texto;
    this.tMensagemAcao = window.setTimeout(() => {
      this.mensagemAcao = null;
    }, 4000);
  }

  private statusAposEstorno(dataYmd: string): 'em_aberto' | 'atrasado' {
    return dataYmd < ymdHoje() ? 'atrasado' : 'em_aberto';
  }

  private patchLinhaPagamento(rowId: number, dataPagamento: string): void {
    this.linhasFonte = this.linhasFonte.map((r) =>
      r.id === rowId
        ? {
            ...r,
            dataYmd: dataPagamento,
            status: 'pago',
            pagoToggle: true,
          }
        : r,
    );
  }

  private patchLinhaEstorno(rowId: number): void {
    this.linhasFonte = this.linhasFonte.map((r) =>
      r.id === rowId
        ? {
            ...r,
            status: this.statusAposEstorno(r.dataYmd),
            pagoToggle: false,
          }
        : r,
    );
  }

  private removerLinhaLocal(rowId: number): void {
    this.linhasFonte = this.linhasFonte.filter((r) => r.id !== rowId);
    this.selecionados.update((atual) => {
      const next = new Set(atual);
      next.delete(rowId);
      return next;
    });
  }

  private formatarMoeda(n: number): string {
    return new Intl.NumberFormat('pt-BR', {
      style: 'currency',
      currency: 'BRL',
    }).format(n);
  }

  onSortDataMouseEnter(): void {
    if (this.dataSortTipSuprimida) return;
    this.clearDataSortTipShowTimer();
    this.dataSortTipShowTimer = setTimeout(() => {
      this.dataSortTipShowTimer = null;
      if (!this.dataSortTipSuprimida) {
        this.dataSortTipVisivel = true;
      }
    }, UI_TIP_SHOW_DELAY_MS);
  }

  onSortDataMouseLeave(): void {
    this.clearDataSortTipShowTimer();
    this.dataSortTipVisivel = false;
    this.dataSortTipSuprimida = false;
  }

  private clearDataSortTipShowTimer(): void {
    if (this.dataSortTipShowTimer != null) {
      clearTimeout(this.dataSortTipShowTimer);
      this.dataSortTipShowTimer = null;
    }
  }

  onOrdenarDataClick(event: MouseEvent): void {
    this.clearDataSortTipShowTimer();
    this.ordenacaoData = this.ordenacaoData === 'asc' ? 'desc' : 'asc';
    this.pagina = 1;
    this.dataSortTipVisivel = false;
    this.dataSortTipSuprimida = true;
    (event.currentTarget as HTMLButtonElement | null)?.blur();
  }

  tooltipOrdenacaoData(): string {
    return this.ordenacaoData === 'asc'
      ? 'Clique organiza por descendente'
      : 'Clique organiza por ascendente';
  }

  formatarData(ymd: string): string {
    const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(ymd.trim().slice(0, 10));
    if (!m) return ymd;
    return `${m[3]}/${m[2]}/${m[1]}`;
  }

  rotuloStatusTransacao(row: FinTransacaoLinhaUi): string {
    if (row.status === 'pago') return 'Pago';
    if (row.status === 'em_aberto') return 'Em aberto';
    return 'Atrasado';
  }

  classeBadgeStatusTransacao(row: FinTransacaoLinhaUi): string {
    if (row.status === 'pago') return 'badge--ok';
    if (row.status === 'em_aberto') return 'badge--warn';
    return 'badge--atraso';
  }

  podeAbrirPerfilTitular(row: FinTransacaoLinhaUi): boolean {
    return !!row.clienteId?.trim();
  }

  /** Texto principal da coluna (descrição / subtítulo da API). */
  linhaPrincipal(row: FinTransacaoLinhaUi): string {
    const sub = String(row.subtitulo ?? '').trim();
    if (sub && sub !== '—') return sub;
    const desc = String(row.descricao ?? '').trim();
    if (desc) return desc;
    return String(row.titular ?? '').trim() || '—';
  }

  /** Serviços/comanda: nome do cliente + linha de referência (Belasis). */
  exibirTitularDuasLinhas(row: FinTransacaoLinhaUi): boolean {
    if (this.ehLinhaComissao(row)) return false;
    const sub = String(row.subtitulo ?? '').trim();
    if (!sub || sub === '—') return false;
    const nome = String(row.titular ?? '').trim();
    if (!nome || nome === '—') return false;
    if (/^Referente à comanda #\d+ para /i.test(sub)) return true;
    const cat = String(row.categoria ?? '')
      .trim()
      .toLowerCase()
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '');
    return cat === 'servicos';
  }

  ehLinhaComissao(row: FinTransacaoLinhaUi): boolean {
    if (row.origemApi === 'comissao_pagamento') return true;
    const cat = String(row.categoria ?? '')
      .trim()
      .toLowerCase()
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '');
    return cat.includes('comiss');
  }

  abrirPerfilTitular(row: FinTransacaoLinhaUi, ev: Event): void {
    ev.preventDefault();
    ev.stopPropagation();
    const cid = row.clienteId?.trim();
    if (!cid) return;
    this.cadastroDrawer.abrirEdicaoPorLinkSidebar(cid, {}, {
      nomeLista: row.titular.trim(),
    });
  }

  podeEstornarComanda(row: FinTransacaoLinhaUi): boolean {
    if (row.status !== 'pago') return false;
    if (row.tipoLinha !== 'movimentacao') return false;
    const idAt = row.idAtendimento?.trim();
    if (!idAt) return false;
    if (row.comandaPagamentoId != null && row.comandaPagamentoId > 0) return true;
    return row.movimentacaoId != null && row.movimentacaoId > 0 && row.origemApi === 'comanda_pagamento';
  }

  podeEstornarComissao(row: FinTransacaoLinhaUi): boolean {
    return (
      row.status === 'pago' &&
      row.tipoLinha === 'movimentacao' &&
      row.origemApi === 'comissao_pagamento' &&
      row.movimentacaoId != null &&
      row.movimentacaoId > 0
    );
  }

  podeEstornarMovimentacao(row: FinTransacaoLinhaUi): boolean {
    return (
      row.status === 'pago' &&
      row.tipoLinha === 'movimentacao' &&
      row.movimentacaoId != null &&
      row.movimentacaoId > 0 &&
      row.origemApi !== 'comanda_pagamento' &&
      row.origemApi !== 'comissao_pagamento'
    );
  }

  podeEstornarLinha(row: FinTransacaoLinhaUi): boolean {
    return (
      this.podeEstornarComanda(row) ||
      this.podeEstornarComissao(row) ||
      this.podeEstornarMovimentacao(row)
    );
  }

  podePagarPendencia(row: FinTransacaoLinhaUi): boolean {
    return (
      row.status !== 'pago' &&
      row.tipoLinha === 'pendencia' &&
      row.comandaPagamentoId != null &&
      row.comandaPagamentoId > 0
    );
  }

  podePagarMovimentacao(row: FinTransacaoLinhaUi): boolean {
    return (
      row.status !== 'pago' &&
      row.tipoLinha === 'movimentacao' &&
      row.movimentacaoId != null &&
      row.movimentacaoId > 0 &&
      row.origemApi !== 'comanda_pagamento' &&
      row.origemApi !== 'comissao_pagamento'
    );
  }

  podePagarLinha(row: FinTransacaoLinhaUi): boolean {
    return this.podePagarPendencia(row) || this.podePagarMovimentacao(row);
  }

  colunaPagoVisivel(row: FinTransacaoLinhaUi): boolean {
    return this.podeEstornarLinha(row) || this.podePagarLinha(row);
  }

  switchPagoDesabilitado(row: FinTransacaoLinhaUi): boolean {
    return this.liquidandoPagoId === row.id || !this.colunaPagoVisivel(row);
  }

  tooltipColunaPago(row: FinTransacaoLinhaUi): string {
    if (row.status === 'pago') return 'Clique para estornar';
    return 'Clique para pagar';
  }

  onTogglePago(row: FinTransacaoLinhaUi, ev: Event): void {
    ev.stopPropagation();
    if (this.switchPagoDesabilitado(row)) return;
    if (row.status === 'pago') {
      this.estornoModalLinha = row;
      return;
    }
    this.pagoPopoverLinhaId = row.id;
    this.pagoPopoverData = ymdHoje();
  }

  onPagoDataPicked(ymd: string, row: FinTransacaoLinhaUi): void {
    if (!this.podePagarLinha(row)) return;
    this.pagamentoModalLinha = row;
    this.pagamentoModalData = ymd;
    this.pagoPopoverLinhaId = null;
  }

  fecharModalEstorno(): void {
    if (this.estornoModalSalvando) return;
    this.estornoModalLinha = null;
  }

  confirmarModalEstorno(): void {
    const row = this.estornoModalLinha;
    if (!row || this.estornoModalSalvando) return;
    this.estornoModalSalvando = true;
    this.liquidandoPagoId = row.id;
    this.executarEstornoLinha(row).subscribe({
      next: () => {
        this.estornoModalSalvando = false;
        this.liquidandoPagoId = null;
        this.estornoModalLinha = null;
        this.patchLinhaEstorno(row.id);
        this.toast.show('Pagamento excluído com sucesso!');
      },
      error: (e: Error) => {
        this.estornoModalSalvando = false;
        this.liquidandoPagoId = null;
        this.toast.show(
          e.message || 'Não foi possível estornar o pagamento.',
        );
      },
    });
  }

  fecharModalPagamento(): void {
    if (this.pagamentoModalSalvando) return;
    this.pagamentoModalLinha = null;
  }

  confirmarModalPagamento(): void {
    const row = this.pagamentoModalLinha;
    if (!row || this.pagamentoModalSalvando) return;
    this.pagamentoModalSalvando = true;
    this.liquidandoPagoId = row.id;
    const data = this.pagamentoModalData;
    const req = this.podePagarPendencia(row)
      ? this.api.pagarPendenciaTransacao(row.comandaPagamentoId!, data)
      : this.api.pagarMovimentacaoTransacao(row.movimentacaoId!, data);
    req.subscribe({
      next: () => {
        this.pagamentoModalSalvando = false;
        this.liquidandoPagoId = null;
        this.pagamentoModalLinha = null;
        this.patchLinhaPagamento(row.id, data);
        this.toast.show('Pagamento realizado com sucesso!');
      },
      error: (e: Error) => {
        this.pagamentoModalSalvando = false;
        this.liquidandoPagoId = null;
        this.toast.show(
          e.message || 'Não foi possível confirmar o pagamento.',
        );
      },
    });
  }

  private executarEstornoLinha(row: FinTransacaoLinhaUi): Observable<void> {
    if (this.podeEstornarComissao(row)) {
      const movId = row.movimentacaoId!;
      return this.api
        .estornarComissaoMovimentacao(movId)
        .pipe(map(() => undefined));
    }
    const movId = row.movimentacaoId;
    if (movId != null && movId > 0) {
      return this.api
        .estornarMovimentacaoTransacao(movId)
        .pipe(map(() => undefined));
    }
    if (this.podeEstornarComanda(row)) {
      return this.executarEstornoComanda(row).pipe(map(() => undefined));
    }
    return throwError(() => new Error('Não foi possível estornar este pagamento.'));
  }

  private executarEstornoComanda(row: FinTransacaoLinhaUi) {
    const idAt = row.idAtendimento!.trim();
    const pagId = row.comandaPagamentoId;
    return this.api.listComandaPagamentos(idAt).pipe(
      switchMap(({ items }) => {
        const alvo =
          pagId != null && pagId > 0
            ? items.find((p) => p.id === pagId)
            : items.find((p) => p.movimentacao_id === row.movimentacaoId);
        const mid = alvo?.movimentacao_id;
        if (!mid) {
          throw new Error(
            'Pagamento da comanda não encontrado para estornar.',
          );
        }
        return this.api.estornarMovimentacaoTransacao(mid);
      }),
    );
  }

  private executarExcluirComandaPagamento(row: FinTransacaoLinhaUi) {
    const idAt = row.idAtendimento!.trim();
    const pagId = row.comandaPagamentoId;
    if (pagId != null && pagId > 0) {
      return this.api.excluirComandaPagamento(idAt, pagId);
    }
    const movId = row.movimentacaoId;
    return this.api.listComandaPagamentos(idAt).pipe(
      switchMap(({ items }) => {
        const alvo = items.find((p) => p.movimentacao_id === movId);
        if (!alvo?.id) {
          throw new Error(
            'Pagamento da comanda não encontrado para excluir.',
          );
        }
        return this.api.excluirComandaPagamento(idAt, alvo.id);
      }),
    );
  }

  private executarExclusaoLinha(row: FinTransacaoLinhaUi): Observable<void> {
    if (this.podePagarPendencia(row)) {
      const idAt = row.idAtendimento!.trim();
      const pagId = row.comandaPagamentoId!;
      return this.api
        .excluirComandaPagamento(idAt, pagId)
        .pipe(map(() => undefined));
    }
    if (this.podeEstornarComissao(row)) {
      return this.api
        .excluirComissaoMovimentacao(row.movimentacaoId!)
        .pipe(map(() => undefined));
    }
    if (this.podeEstornarComanda(row)) {
      return this.executarExcluirComandaPagamento(row).pipe(map(() => undefined));
    }
    const movId = row.movimentacaoId;
    if (movId != null && movId > 0 && row.editavel) {
      return this.api.deleteMovimentacao(movId).pipe(map(() => undefined));
    }
    if (this.podeEstornarMovimentacao(row) && movId != null && movId > 0) {
      return this.api.deleteMovimentacao(movId).pipe(map(() => undefined));
    }
    return throwError(() => new Error('Não foi possível excluir esta transação.'));
  }

  abrirModalExclusao(row: FinTransacaoLinhaUi): void {
    if (!this.podeExcluirNoMenu(row) || this.excluindoId != null) return;
    this.exclusaoModalLinha = row;
  }

  fecharModalExclusao(): void {
    if (this.exclusaoModalSalvando) return;
    this.exclusaoModalLinha = null;
  }

  confirmarModalExclusao(): void {
    const row = this.exclusaoModalLinha;
    if (!row || this.exclusaoModalSalvando) return;
    this.exclusaoModalSalvando = true;
    this.excluindoId = row.id;
    this.executarExclusaoLinha(row).subscribe({
      next: () => {
        this.exclusaoModalSalvando = false;
        this.excluindoId = null;
        this.exclusaoModalLinha = null;
        this.removerLinhaLocal(row.id);
        this.toast.show('Transação excluída com sucesso!');
      },
      error: (e: Error) => {
        this.exclusaoModalSalvando = false;
        this.excluindoId = null;
        this.toast.show(e.message || 'Não foi possível excluir a transação.');
      },
    });
  }

  linhaSelecionada(id: number): boolean {
    return this.selecionados().has(id);
  }

  todosSelecionados(): boolean {
    const pag = this.linhasPagina;
    return pag.length > 0 && pag.every((r) => this.selecionados().has(r.id));
  }

  toggleLinha(id: number, ev: Event): void {
    const checked = (ev.target as HTMLInputElement).checked;
    this.selecionados.update((atual) => {
      const next = new Set(atual);
      if (checked) next.add(id);
      else next.delete(id);
      return next;
    });
  }

  toggleTodos(ev: Event): void {
    const checked = (ev.target as HTMLInputElement).checked;
    if (checked) {
      this.selecionados.update((atual) => {
        const next = new Set(atual);
        for (const r of this.linhasPagina) next.add(r.id);
        return next;
      });
    } else {
      this.selecionados.update((atual) => {
        const next = new Set(atual);
        for (const r of this.linhasPagina) next.delete(r.id);
        return next;
      });
    }
  }

  onBuscaWrapClick(): void {
    if (!this.buscaAberta) {
      this.abrirPainelBusca();
    }
  }

  onBuscaSubmit(): void {
    const el = document.getElementById('fin-trans-busca');
    if (el instanceof HTMLInputElement) {
      el.blur();
    }
  }

  onBuscaEnter(ev: Event): void {
    ev.preventDefault();
    this.onBuscaSubmit();
  }

  toggleFiltros(): void {
    this.dispararPulsoToolbar('filtro');
    const abrindo = !this.filtrosAbertos;
    this.filtrosAbertos = abrindo;
    if (abrindo) this.carregarOpcoesFiltrosSidebar();
  }

  onPeriodoFiltroAlterado(): void {
    this.syncDdMmFromPeriodoYmd();
    this.filtroVisao = null;
    this.aplicarFiltrosAutomatico();
  }

  onFiltroTipoDataChange(tipo: FinTransacoesFiltroTipoData): void {
    this.filtroTipoData = tipo;
    this.filtroVisao = null;
    this.pagina = 1;
    this.aplicarFiltrosAutomatico();
  }

  formasPagamentoFiltro(): string[] {
    return this.formasOpcoes();
  }

  categoriasFiltro(): CategoriaFinanceiraItem[] {
    return this.categoriasOpcoes();
  }

  formaSelecionada(forma: string): boolean {
    return this.formasMarcadas.has(forma);
  }

  categoriaSelecionada(id: number): boolean {
    return this.categoriasMarcadas.has(id);
  }

  toggleFiltroReceber(ev: Event): void {
    const checked = (ev.target as HTMLInputElement).checked;
    if (!checked && !this.filtroPagar) {
      (ev.target as HTMLInputElement).checked = true;
      return;
    }
    this.filtroReceber = checked;
    this.filtroVisao = null;
    this.pagina = 1;
    this.aplicarFiltrosNaturezaNaHora();
  }

  toggleFiltroPagar(ev: Event): void {
    const checked = (ev.target as HTMLInputElement).checked;
    if (!checked && !this.filtroReceber) {
      (ev.target as HTMLInputElement).checked = true;
      return;
    }
    this.filtroPagar = checked;
    this.filtroVisao = null;
    this.pagina = 1;
    this.aplicarFiltrosNaturezaNaHora();
  }

  toggleStatusPago(ev: Event): void {
    this.statusPago = (ev.target as HTMLInputElement).checked;
    this.filtroVisao = null;
    this.pagina = 1;
    this.aplicarFiltrosAutomatico();
  }

  toggleStatusEmAberto(ev: Event): void {
    this.statusEmAberto = (ev.target as HTMLInputElement).checked;
    this.filtroVisao = null;
    this.pagina = 1;
    this.aplicarFiltrosAutomatico();
  }

  toggleStatusAtrasado(ev: Event): void {
    this.statusAtrasado = (ev.target as HTMLInputElement).checked;
    this.filtroVisao = null;
    this.pagina = 1;
    this.aplicarFiltrosAutomatico();
  }

  toggleFormaPagamento(forma: string, ev: Event): void {
    const checked = (ev.target as HTMLInputElement).checked;
    if (checked) this.formasMarcadas.add(forma);
    else this.formasMarcadas.delete(forma);
    this.filtroVisao = null;
    this.pagina = 1;
    this.aplicarFiltrosAutomatico();
  }

  toggleCategoria(id: number, ev: Event): void {
    const checked = (ev.target as HTMLInputElement).checked;
    if (checked) this.categoriasMarcadas.add(id);
    else this.categoriasMarcadas.delete(id);
    this.filtroVisao = null;
    this.pagina = 1;
    this.aplicarFiltrosAutomatico();
  }

  desmarcarTodasFormas(): void {
    this.formasMarcadas.clear();
    this.filtroVisao = null;
    this.pagina = 1;
    this.aplicarFiltrosAutomatico();
  }

  desmarcarTodasCategorias(): void {
    this.categoriasMarcadas.clear();
    this.filtroVisao = null;
    this.pagina = 1;
    this.aplicarFiltrosAutomatico();
  }

  private carregarOpcoesFiltrosSidebar(): void {
    if (this.opcoesFiltroCarregadas) return;
    this.opcoesFiltroCarregadas = true;
    forkJoin({
      formas: this.api.listFinFormasPagamentoOpcoes().pipe(catchError(() => of([]))),
      categorias: this.api.listCategoriasFinanceiras().pipe(catchError(() => of([]))),
    }).subscribe(({ formas, categorias }) => {
      const nomes = mapFormasParaNomes(formas);
      const extras = new Set(nomes);
      for (const row of this.linhasFonte) {
        const f = row.formaPagamento.trim();
        if (f && f !== '—') extras.add(f);
      }
      this.formasOpcoes.set([...extras].sort((a, b) => a.localeCompare(b, 'pt-BR')));
      this.categoriasOpcoes.set(
        [...categorias].sort((a, b) => a.nome.localeCompare(b.nome, 'pt-BR')),
      );
      this.inicializarMarcacoesFiltro();
    });
  }

  private inicializarMarcacoesFiltro(): void {
    this.formasMarcadas = new Set(this.formasOpcoes());
    this.categoriasMarcadas = new Set(this.categoriasOpcoes().map((c) => c.id));
  }

  private linhaPassaForma(row: FinTransacaoLinhaUi): boolean {
    if (!this.opcoesFiltroCarregadas) return true;
    if (this.formasMarcadas.size === 0) return false;
    const forma = row.formaPagamento.trim() || '—';
    return this.formasMarcadas.has(forma);
  }

  private linhaPassaCategoria(row: FinTransacaoLinhaUi): boolean {
    if (!this.opcoesFiltroCarregadas) return true;
    if (this.categoriasMarcadas.size === 0) return false;
    const id = row.categoriaId;
    if (id != null && this.categoriasMarcadas.has(id)) return true;
    const nome = row.categoria.trim();
    return this.categoriasOpcoes().some(
      (c) => this.categoriasMarcadas.has(c.id) && c.nome === nome,
    );
  }

  private syncPeriodoYmdFromDdMm(): void {
    const di = parseFiltroDataDdMm(this.dataInicio.trim());
    const df = parseFiltroDataDdMm(this.dataFim.trim());
    if (di) this.periodoInicioYmd = di;
    if (df) this.periodoFimYmd = df;
  }

  private syncDdMmFromPeriodoYmd(): void {
    if (this.periodoInicioYmd) {
      this.dataInicio = ymdToDdMmYyyy(this.periodoInicioYmd);
    }
    if (this.periodoFimYmd) {
      this.dataFim = ymdToDdMmYyyy(this.periodoFimYmd);
    }
  }

  private aplicarFiltroEstadoParaUi(
    natureza: FiltroNatureza,
    status: FiltroStatus,
  ): void {
    if (natureza === 'receita') {
      this.filtroReceber = true;
      this.filtroPagar = false;
    } else if (natureza === 'despesa') {
      this.filtroReceber = false;
      this.filtroPagar = true;
    } else {
      this.filtroReceber = true;
      this.filtroPagar = true;
    }

    if (status === 'pago') {
      this.statusPago = true;
      this.statusEmAberto = false;
      this.statusAtrasado = false;
    } else if (status === 'em_aberto') {
      this.statusPago = false;
      this.statusEmAberto = true;
      this.statusAtrasado = true;
    } else {
      this.statusPago = true;
      this.statusEmAberto = true;
      this.statusAtrasado = true;
    }
  }

  private derivarNaturezaParaUrl(): FiltroNatureza {
    if (this.filtroReceber && this.filtroPagar) return 'todos';
    if (this.filtroReceber) return 'receita';
    if (this.filtroPagar) return 'despesa';
    return 'todos';
  }

  private derivarStatusParaUrl(): FiltroStatus {
    if (this.statusPago && this.statusEmAberto && this.statusAtrasado) {
      return 'todos';
    }
    if (this.statusPago && !this.statusEmAberto && !this.statusAtrasado) {
      return 'pago';
    }
    if (!this.statusPago && this.statusEmAberto && this.statusAtrasado) {
      return 'em_aberto';
    }
    return 'todos';
  }

  rotuloVisaoAtiva(): string | null {
    if (!this.filtroVisao) return null;
    const map: Record<FinTransacoesVisaoPreset, string> = {
      'receber-hoje': 'A receber hoje',
      'pagar-hoje': 'A pagar hoje',
      recebidos: 'Recebidos',
      'a-receber': 'A Receber',
      pagos: 'Pagos',
      'a-pagar': 'A Pagar',
    };
    return map[this.filtroVisao] ?? null;
  }

  private syncUrlFromFiltro(): void {
    const q = filtroParaQueryParams({
      dataInicio: this.dataInicio,
      dataFim: this.dataFim,
      natureza: this.derivarNaturezaParaUrl(),
      status: this.derivarStatusParaUrl(),
      tipoData: this.filtroTipoData,
      visao: this.filtroVisao,
    });
    this.router.navigate([], {
      relativeTo: this.route,
      queryParams: q,
      replaceUrl: true,
    });
  }

  calcularTotais(): void {
    this.resumoTotais.set(calcularTotaisTransacoes(this.linhasFiltradas));
    this.modalTotaisAberto.set(true);
  }

  fecharModalTotais(): void {
    this.modalTotaisAberto.set(false);
  }

  toggleNovoMenu(ev: Event): void {
    ev.stopPropagation();
    this.dispararPulsoToolbar('novo');
    if (this.novoMenuAberto && !this.novoMenuFechando) {
      this.fecharNovoMenuAnimado();
      return;
    }
    this.abrirNovoMenu();
  }

  abrirNovoRecebimento(): void {
    this.abrirNovoDrawer('receita');
  }

  abrirNovoDespesa(): void {
    this.abrirNovoDrawer('despesa');
  }

  abrirNovoVale(): void {
    this.abrirNovoDrawer('vale');
  }

  private abrirNovoDrawer(tipo: FinTransacaoNovoTipo): void {
    this.fecharNovoMenuAnimado();
    this.novoDrawerTipo.set(tipo);
    this.abrirDrawerComAnimacao(
      () => {
        this.novoDrawerAberto = true;
      },
      (open) => {
        this.novoDrawerPanelOpen = open;
      },
    );
  }

  fecharNovoDrawer(): void {
    if (!this.novoDrawerAberto || this.novoDrawerSalvando()) return;
    this.novoDrawerPanelOpen = false;
    if (this.novoDrawerCloseTimer != null) {
      clearTimeout(this.novoDrawerCloseTimer);
    }
    this.novoDrawerCloseTimer = setTimeout(() => {
      this.novoDrawerCloseTimer = null;
      this.novoDrawerAberto = false;
      if (
        !this.comandaPainelAberto &&
        !this.faturarDrawerAberto &&
        !this.editarDrawerAberto
      ) {
        this.desbloquearScrollPagina();
      }
    }, DRAWER_ANIM_MS);
  }

  onConfirmarNovo(ev: FinTransacaoNovoSubmit): void {
    this.novoDrawerSalvando.set(true);
    const done = () => {
      this.novoDrawerSalvando.set(false);
      this.fecharNovoDrawer();
      this.carregar();
      this.mostrarMensagemAcao('Lançamento registado.');
    };
    const fail = (e: Error) => {
      this.novoDrawerSalvando.set(false);
      this.mostrarMensagemAcao(
        e.message || 'Não foi possível guardar o lançamento.',
      );
    };

    if (ev.tipo === 'receita') {
      this.api
        .createMovimentacao({
          data_mov: ev.data_mov,
          natureza: 'receita',
          valor: ev.valor,
          categoria_id: ev.categoria_id,
          descricao: ev.descricao,
          metodo_pagamento: ev.metodo_pagamento,
        })
        .subscribe({ next: () => done(), error: fail });
    } else {
      this.api
        .createDespesa({
          data_mov: ev.data_mov,
          valor: ev.valor,
          categoria_id: ev.categoria_id,
          descricao: ev.descricao,
          metodo_pagamento: ev.metodo_pagamento,
        })
        .subscribe({ next: () => done(), error: fail });
    }
  }

  podeVerComanda(row: FinTransacaoLinhaUi): boolean {
    const id = String(row.idAtendimento ?? '').trim();
    return id.length > 0 && row.origem.startsWith('C#');
  }

  podeAbrirEditarDrawer(row: FinTransacaoLinhaUi): boolean {
    return (
      row.tipoLinha === 'movimentacao' &&
      row.movimentacaoId != null &&
      row.movimentacaoId > 0
    );
  }

  podeExcluirNoMenu(row: FinTransacaoLinhaUi): boolean {
    if (this.podeEditarExcluir(row)) return true;
    if (this.podeEstornarLinha(row)) return true;
    return this.podePagarPendencia(row);
  }

  podeAcaoEditarLinha(row: FinTransacaoLinhaUi): boolean {
    return (
      this.podeAbrirEditarDrawer(row) ||
      this.podeVerComanda(row)
    );
  }

  linhaTemAcoes(row: FinTransacaoLinhaUi): boolean {
    return this.podeAcaoEditarLinha(row) || this.podeExcluirNoMenu(row);
  }

  @HostListener('document:click', ['$event'])
  fecharMenuAcaoDocumento(ev: MouseEvent): void {
    const t = ev.target as HTMLElement | null;
    if (!t?.closest?.('.fin-transacoes-novo-menu')) {
      this.fecharNovoMenuAnimado();
    }
    this.perPageMenuAberto = false;
    this.pagoPopoverLinhaId = null;
    if (this.buscaAberta && !t?.closest?.('.list-head__busca-wrap')) {
      this.fecharPainelBusca();
    }
  }

  /**
   * ESC: fecha a camada superior (drawers empilhados — ver `styles/drawer-stack.scss`).
   */
  @HostListener('document:keydown.escape', ['$event'])
  onEscapeGlobal(ev: KeyboardEvent): void {
    if (this.pagamentoModalLinha) {
      if (!this.pagamentoModalSalvando) {
        ev.preventDefault();
        this.fecharModalPagamento();
      }
      return;
    }
    if (this.pagoPopoverLinhaId != null) {
      ev.preventDefault();
      this.pagoPopoverLinhaId = null;
      return;
    }
    if (this.exclusaoModalLinha) {
      if (!this.exclusaoModalSalvando) {
        ev.preventDefault();
        this.fecharModalExclusao();
      }
      return;
    }
    if (this.estornoModalLinha) {
      if (!this.estornoModalSalvando) {
        ev.preventDefault();
        this.fecharModalEstorno();
      }
      return;
    }
    if (this.novoDrawerAberto) {
      if (!this.novoDrawerSalvando()) {
        ev.preventDefault();
        this.fecharNovoDrawer();
      }
      return;
    }
    if (this.modalTotaisAberto()) {
      ev.preventDefault();
      this.fecharModalTotais();
      return;
    }
    if (this.cadastroDrawer.tratarEscapeComandaEmpilhadaNaFicha()) {
      ev.preventDefault();
      return;
    }
    if (this.cadastroDrawer.isAberto) {
      ev.preventDefault();
      this.cadastroDrawer.fechar();
      return;
    }
    if (this.faturarDrawerAberto) {
      ev.preventDefault();
      this.fecharFaturarDrawer();
      return;
    }
    if (this.comandaPainelAberto) {
      ev.preventDefault();
      this.fecharComandaDrawer();
      return;
    }
    if (this.editarDrawerAberto) {
      if (!this.editarSalvando()) {
        ev.preventDefault();
        this.fecharEditarDrawer();
      }
      return;
    }
    if (this.filtrosAbertos) {
      ev.preventDefault();
      this.filtrosAbertos = false;
      return;
    }
    if (this.perPageMenuAberto) {
      ev.preventDefault();
      this.perPageMenuAberto = false;
      return;
    }
    if (!this.buscaAberta) return;
    ev.preventDefault();
    this.fecharPainelBusca();
  }

  onAcaoEditarLinha(row: FinTransacaoLinhaUi): void {
    if (this.podeAbrirEditarDrawer(row)) {
      this.editarLinha = row;
      this.abrirDrawerComAnimacao(
        () => {
          this.editarDrawerAberto = true;
        },
        (open) => {
          this.editarDrawerPanelOpen = open;
        },
      );
      return;
    }
    if (this.podeVerComanda(row)) {
      this.verComanda(row);
      return;
    }
  }

  fecharEditarDrawer(): void {
    if (!this.editarDrawerAberto) return;
    this.editarDrawerPanelOpen = false;
    if (this.editarDrawerCloseTimer != null) {
      clearTimeout(this.editarDrawerCloseTimer);
    }
    this.editarDrawerCloseTimer = setTimeout(() => {
      this.editarDrawerCloseTimer = null;
      this.editarDrawerAberto = false;
      this.editarLinha = null;
      if (
        !this.comandaPainelAberto &&
        !this.faturarDrawerAberto &&
        !this.novoDrawerAberto
      ) {
        this.desbloquearScrollPagina();
      }
    }, DRAWER_ANIM_MS);
  }

  onSalvarEditar(ev: FinTransacaoEditarSubmit): void {
    this.editarSalvando.set(true);
    this.api
      .patchMovimentacao(ev.movimentacaoId, {
        valor: ev.valor,
        categoria_id: ev.categoria_id,
        metodo_pagamento: ev.metodo_pagamento,
        descricao: ev.descricao ?? null,
        data_mov: ev.data_mov,
        pago_em: ev.pago_em,
      })
      .subscribe({
        next: () => {
          this.editarSalvando.set(false);
          this.fecharEditarDrawer();
          this.carregar();
          this.mostrarMensagemAcao('Lançamento atualizado.');
        },
        error: (e: Error) => {
          this.editarSalvando.set(false);
          this.mostrarMensagemAcao(
            e.message || 'Não foi possível guardar as alterações.',
          );
        },
      });
  }

  verComanda(row: FinTransacaoLinhaUi): void {
    const idAt = String(row.idAtendimento ?? '').trim();
    if (!idAt || this.abrindoComanda) return;
    this.abrindoComanda = true;
    const numeroLinha = this.numeroComandaDeRow(row);
    this.api
      .listAgendamentos(undefined, undefined, idAt)
      .pipe(catchError(() => of([])))
      .subscribe({
        next: (items) => {
          this.abrindoComanda = false;
          const l0 = items[0];
          if (!l0) {
            this.mostrarMensagemAcao(
              'Não foi possível abrir a comanda. Pedido não encontrado.',
            );
            return;
          }
          const cid = String(l0.idCliente ?? '').trim();
          if (!cid) {
            this.mostrarMensagemAcao('Comanda sem cliente associado.');
            return;
          }
          const dataYmd = String(l0.data ?? row.dataYmd).trim().slice(0, 10);
          const nApi = l0.numeroComanda;
          const numero =
            typeof nApi === 'number' && nApi > 0
              ? nApi
              : numeroLinha > 0
                ? numeroLinha
                : 1;
          const nomeLista = String(l0.nomeCliente ?? row.titular ?? '').trim();
          forkJoin({
            cliente: this.api.getCliente(cid).pipe(catchError(() => of(null))),
          }).subscribe({
            next: ({ cliente }) => {
              this.abrirDrawerComanda({
                acessar: true,
                idAtendimento: idAt,
                numeroComandaTitulo: numero,
                clienteId: cid,
                cliente,
                opcoesClientes: this.opcoesClientesParaComanda(
                  cid,
                  nomeLista,
                  cliente,
                ),
                dataYmd: /^\d{4}-\d{2}-\d{2}$/.test(dataYmd) ? dataYmd : null,
                linhasSnapshot: [],
              });
            },
          });
        },
        error: () => {
          this.abrindoComanda = false;
          this.mostrarMensagemAcao('Não foi possível carregar a comanda.');
        },
      });
  }

  private numeroComandaDeRow(row: FinTransacaoLinhaUi): number {
    const n = row.numeroComanda;
    if (typeof n === 'number' && n > 0) return n;
    const m = /^C#\s*(\d+)/i.exec(String(row.origem ?? '').trim());
    if (m?.[1]) {
      const p = Number.parseInt(m[1], 10);
      if (Number.isFinite(p) && p > 0) return p;
    }
    return 0;
  }

  private opcoesClientesParaComanda(
    cid: string,
    nomeLista: string,
    cliente: Cliente | null,
  ): SaasSelectOption[] {
    const label =
      cliente?.nome?.trim() || nomeLista || cid || '—';
    return [{ value: cid, label }];
  }

  private abrirDrawerComanda(ctx: ComandaDrawerContextoAgenda): void {
    this.comandaDrawerContexto = ctx;
    const y = (ctx.dataYmd ?? '').trim();
    this.comandaDataYmdParaFaturar =
      /^\d{4}-\d{2}-\d{2}$/.test(y) ? y : null;
    this.abrirDrawerComAnimacao(
      () => {
        this.comandaPainelAberto = true;
      },
      (open) => {
        this.comandaDrawerPanelOpen = open;
      },
    );
  }

  fecharComandaDrawer(): void {
    if (!this.comandaPainelAberto) return;
    this.comandaDrawerPanelOpen = false;
    if (this.faturarDrawerAberto) {
      this.fecharFaturarDrawer();
    }
    if (this.comandaDrawerCloseTimer != null) {
      clearTimeout(this.comandaDrawerCloseTimer);
    }
    this.comandaDrawerCloseTimer = setTimeout(() => {
      this.comandaDrawerCloseTimer = null;
      this.comandaPainelAberto = false;
      this.comandaDrawerContexto = null;
      this.comandaDataYmdParaFaturar = null;
      this.desbloquearScrollPagina();
    }, DRAWER_ANIM_MS);
  }

  onComandaExcluida(): void {
    this.fecharComandaDrawer();
    this.carregar();
  }

  onComandaDataYmdAlterada(ymd: string | null): void {
    this.comandaDataYmdParaFaturar = ymd;
  }

  onAbrirFaturarComanda(ev: {
    idAtendimento: string;
    resumo: ComandaResumoPagamentos;
    creditoAUsar?: number;
    dataComandaYmd?: string | null;
    modoVerPagamentos?: boolean;
  }): void {
    this.comandaDataYmdParaFaturar =
      ev.dataComandaYmd ?? this.comandaDataYmdParaFaturar;
    this.faturarCtx = {
      idAtendimento: ev.idAtendimento,
      resumo: ev.resumo,
      creditoAUsar: ev.creditoAUsar,
      modoVerPagamentos: ev.modoVerPagamentos ?? false,
    };
    this.abrirDrawerComAnimacao(
      () => {
        this.faturarDrawerAberto = true;
      },
      (open) => {
        this.faturarDrawerPanelOpen = open;
      },
    );
  }

  fecharFaturarDrawer(): void {
    if (!this.faturarDrawerAberto) return;
    this.faturarDrawerPanelOpen = false;
    if (this.faturarDrawerCloseTimer != null) {
      clearTimeout(this.faturarDrawerCloseTimer);
    }
    this.faturarDrawerCloseTimer = setTimeout(() => {
      this.faturarDrawerCloseTimer = null;
      this.faturarDrawerAberto = false;
      this.faturarCtx = null;
      if (!this.comandaPainelAberto) {
        this.desbloquearScrollPagina();
      }
      this.comandaDrawerRef?.recarregarAposFaturar();
    }, DRAWER_ANIM_MS);
  }

  onFaturaComandaSucesso(): void {
    this.fecharFaturarDrawer();
    this.carregar();
  }

  onAbrirCadastroClienteDaComanda(
    payload: AbrirCadastroClientePayload = {},
  ): void {
    abrirCadastroClienteDesdeSidebarComanda(
      this.cadastroDrawer,
      this.comandaContextoHolder,
      payload,
      (cid) => this.comandaDrawerRef?.recarregarClienteAposSalvarFicha(cid),
    );
  }

  ariaLabelComandaDrawer(): string {
    return this.comandaDrawerContexto?.idAtendimento?.trim()
      ? 'Visualizando comanda'
      : 'Comanda';
  }

  private abrirDrawerComAnimacao(
    marcarDrawerAberto: () => void,
    setPanelOpen: (open: boolean) => void,
  ): void {
    marcarDrawerAberto();
    if (!this.pageScrollLockAtivo) {
      this.bloquearScrollPagina();
    }
    setPanelOpen(false);
    queueMicrotask(() => {
      requestAnimationFrame(() => {
        requestAnimationFrame(() => {
          setPanelOpen(true);
        });
      });
    });
  }

  private obterLarguraScrollbar(): number {
    if (typeof window === 'undefined' || typeof document === 'undefined') {
      return 0;
    }
    return Math.max(0, window.innerWidth - document.documentElement.clientWidth);
  }

  private bloquearScrollPagina(): void {
    if (this.pageScrollLockAtivo) return;
    this.bodyScrollPreDrawer = window.scrollY || 0;
    const gutter = this.obterLarguraScrollbar();
    const body = document.body;
    body.style.position = 'fixed';
    body.style.top = `-${this.bodyScrollPreDrawer}px`;
    body.style.left = '0';
    body.style.right = '0';
    body.style.width = '100%';
    if (gutter > 0) {
      body.style.paddingRight = `${gutter}px`;
    }
    this.pageScrollLockAtivo = true;
  }

  private desbloquearScrollPagina(): void {
    if (!this.pageScrollLockAtivo) return;
    const body = document.body;
    body.style.position = '';
    body.style.top = '';
    body.style.left = '';
    body.style.right = '';
    body.style.width = '';
    body.style.paddingRight = '';
    this.pageScrollLockAtivo = false;
    window.scrollTo(0, this.bodyScrollPreDrawer);
  }

  podeEditarExcluir(row: FinTransacaoLinhaUi): boolean {
    return (
      row.editavel === true &&
      row.movimentacaoId != null &&
      row.movimentacaoId > 0
    );
  }

  paginaAnterior(): void {
    if (this.podePaginaAnterior) this.pagina--;
  }

  paginaSeguinte(): void {
    if (this.podePaginaSeguinte) this.pagina++;
  }

  alterarItensPorPagina(n: number): void {
    this.itensPorPagina = n;
    this.pagina = 1;
    this.perPageMenuAberto = false;
  }
}
