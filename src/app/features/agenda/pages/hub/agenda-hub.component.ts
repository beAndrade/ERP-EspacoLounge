import {
  Component,
  DestroyRef,
  ElementRef,
  ApplicationRef,
  inject,
  LOCALE_ID,
  NgZone,
  OnDestroy,
  OnInit,
  ViewChild,
} from '@angular/core';
import { NgTemplateOutlet } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { ActivatedRoute, Router } from '@angular/router';
import { Title } from '@angular/platform-browser';
import { filter } from 'rxjs/operators';
import { catchError, of, take } from 'rxjs';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import {
  AtendimentoListaItem,
  ProfissionalListaItem,
  Cliente,
  Servico,
  RegraMegaItem,
} from '../../../../core/models/api.models';
import { SheetsApiService } from '../../../../core/services/sheets-api.service';
import { SessaoUsuarioService } from '../../../../core/services/sessao-usuario.service';
import { minutosMeiaNoiteEmBrasilia } from '../../../../core/utils/brasilia-time';
import { diffMinutesEntreHorarios } from '../../../../core/utils/sql-local-datetime';
import {
  dataDdMmBarraAaaa,
  horaInicialMenorDasLinhasAtendimento,
  isTipoPacoteQueratinaNorm,
  linhaResumoAtendimentoLista,
  ordenarLinhasAtendimentoInPlace,
  pedidoTemPosicaoNaGrelhaAgenda,
  toYmd,
} from '../../../../core/utils/atendimento-display';
import {
  AGENDA_COR_COMANDA_FATURADA,
  AGENDA_STATUS_META,
  corHexAgendaPorStatus,
  normalizarAgendaStatusId,
  type AgendaStatusId,
} from '../../../../core/utils/agenda-status-card';
import { particionarLinhasPedidoEmCartoesAgenda } from '../../../../core/utils/agenda-cartao-particao';
import {
  cobrancaFinalizadaItem,
  comandaQuitadaNasCifrasItem,
} from '../../../../core/utils/comanda-status.util';
import { AgendaNovoComponent } from '../novo/agenda-novo.component';
import type { ComandaDrawerContextoAgenda } from './comanda-drawer.types';
import { NovaComandaDrawerComponent } from './nova-comanda-drawer.component';
import { FaturarDrawerComponent } from './faturar-drawer.component';
import type { ComandaResumoPagamentos } from '../../../../core/models/api.models';
import {
  ClienteCadastroDrawerService,
  type AbrirCadastroClientePayload,
} from '../../../../shared/cliente-cadastro-drawer/cliente-cadastro-drawer.service';
import {
  AgendaNovoGlobalService,
  type AgendaNovoGlobalModo,
} from '../../../../shared/agenda-novo-global/agenda-novo-global.service';
import { ProfissionalCadastroDrawerService } from '../../../../shared/profissional-cadastro-drawer/profissional-cadastro-drawer.service';
import { ServicoCadastroDrawerService } from '../../../../shared/servico-cadastro-drawer/servico-cadastro-drawer.service';
import { ProfissionalAvatarComponent } from '../../../../shared/profissional-avatar/profissional-avatar.component';
import { profissionalFotoUrl } from '../../../../core/utils/profissional-foto.util';
import { mediaQueryMax } from '../../../../styles/breakpoints';
import { AppShellUiService } from '../../../../core/services/app-shell-ui.service';
import { telefoneBrDigitos, telefoneClienteWhatsappExibicao } from '../../../../core/utils/telefone-br';
import {
  AGENDA_COR_META_BASE,
  AGENDA_COR_PADRAO_ID,
  listarOpcoesCorAgenda,
  resolverAgendaCorIdPorHex,
  type AgendaCorOpcao,
} from '../../../../core/utils/agenda-cor-card';
import { resolverHoraWhatsappAgendamento } from '../../../../core/utils/whatsapp-agendamento-hora';
import { nomeClienteParaWhatsapp } from '../../../../core/utils/whatsapp-variaveis';
import type { WhatsappEnviarContexto } from '../../../../core/models/whatsapp.model';
import { WhatsappEnviarModalComponent } from '../../../../shared/whatsapp/whatsapp-enviar-modal.component';
import { AppToastService } from '../../../../shared/app-toast/app-toast.service';
import { ClienteAvatarComponent } from '../../../../shared/cliente-avatar/cliente-avatar.component';
import { lerServicoTexto } from '../../../../core/utils/servico-campos';
import {
  DRAWER_ANIM_MS,
  beginDrawerCloseAnimation,
  runDrawerOpenAnimation,
  type DrawerOpenAnimHandle,
} from '../../../../shared/drawer-panel-anim';

type CelulaCalendario = {
  dia: number;
  ymd: string;
  foraDoMes: boolean;
};

type HubModoVista = 'dia' | 'semana' | 'mensal';
type HubMenuToolbar = 'visualizacao' | 'filtrar' | 'acoes';
type HubStatusFiltroId = AgendaStatusId | 'faturado' | 'bloqueado';

const HUB_STATUS_FILTROS: readonly {
  id: HubStatusFiltroId;
  label: string;
  cor?: string;
}[] = [
  ...AGENDA_STATUS_META,
  { id: 'faturado', label: 'Faturado', cor: AGENDA_COR_COMANDA_FATURADA },
  { id: 'bloqueado', label: 'Bloqueado', cor: '#9ca3af' },
];

/**
 * Grelha do dia em minutos desde 00:00.
 * `GRID_END_MIN` = fim **exclusivo** da timeline (último rótulo 23:00, faixa até 23:30).
 * Faixas de 30 min: `(GRID_END_MIN - GRID_START_MIN) / 30` (= 31), igual a `$agenda-slot-rows` no SCSS.
 *
 * Ex.: 90 min (10:00→11:30) = **3 faixas** de 30 min; na grelha há **4 traços** horizontais
 * nesse intervalo. A altura do cartão usa **(3 + 1) / 31** da coluna — ou seja,
 * `(duração em slots de 30 min + 1) / AGENDA_SLOT_COUNT`, para coincidir com esse desenho.
 */
const GRID_START_MIN = 8 * 60;
/** Fim exclusivo da timeline (8:00 → 23:30). */
const GRID_END_MIN = 23 * 60 + 30;
const GRID_RANGE = GRID_END_MIN - GRID_START_MIN;
/** Duração de cada faixa na grelha (deve coincidir com o SCSS). */
const AGENDA_SLOT_MIN = 30;
/** Nº de faixas de 30 min na coluna (31). */
const AGENDA_SLOT_COUNT = GRID_RANGE / AGENDA_SLOT_MIN;
/** Faixa semanal: sempre 7 dias (âncora + 6 à frente), não semana calendário seg–dom. */
const SEMANA_COLUNAS = 7;
/** Grelha mensal: 6 semanas × 7 dias (sempre 42 células). */
const MES_GRELHA_CELULAS = 42;
/** Último slot de 30 min a começar na grelha (23:00). */
const GRID_LAST_SLOT_START_MIN = GRID_END_MIN - 30;

/** Distância mínima (px) para distinguir arraste de clique no cartão. */
const ARRASTE_CARD_LIMIAR_PX = 8;

/** Tempo (ms) antes de ocultar o indicador horizontal após soltar o arraste. */
const PROF_HEAD_SCROLLBAR_HIDE_MS = 900;

/** Distância mínima (px) para distinguir pan horizontal de vertical na grelha (compacto). */
const PAN_GRELHA_LIMIAR_PX = 5;

/** Um cartão na grelha = mesmo `id` + mesmo profissional (várias linhas = um bloco). */
type AgendaHubBloco = {
  trackKey: string;
  linhas: AtendimentoListaItem[];
};

type AgendaCardHoverTip = {
  trackKey: string;
  bloco: AgendaHubBloco;
  ymdCtx?: string;
  left: number;
  top: number;
  /** Distância da seta ao canto esquerdo do tip (centro do cartão da grelha). */
  arrowLeft: number;
  placement: 'below' | 'above';
  nome: string;
  telefone: string;
  fotoUrl: string;
  intervalo: string;
  dataLabel: string;
  servico: string;
  statusLabel: string;
  statusCor: string;
  corLabel: string;
  /** Hex da cor nomeada; vazio = «Sem cor». */
  corHex: string;
  /** Número do pedido (`atendimentos_pedido`); 0 se ainda não houver. */
  numeroComanda: number;
};

/** Texto «Sem cor» no tip (Belasis). */
const TIP_SEM_COR_TEXTO = 'rgba(0, 0, 0, 0.7)';

const CARD_HOVER_TIP_DELAY_MS = 800;
const CARD_HOVER_TIP_GAP_PX = 14;
const CARD_HOVER_TIP_FADE_MS = 220;
const CARD_HOVER_TIP_W_PX = 230;
const CARD_HOVER_TIP_H_PX = 333.53;
/** DEBUG visual do tip — desligado com as ações reais. */
const CARD_HOVER_TIP_PIN_DEBUG = false;

@Component({
  selector: 'app-agenda-hub',
  host: {
    class: 'agenda-hub-host',
  },
  standalone: true,
  imports: [
    FormsModule,
    NgTemplateOutlet,
    AgendaNovoComponent,
    NovaComandaDrawerComponent,
    FaturarDrawerComponent,
    ProfissionalAvatarComponent,
    WhatsappEnviarModalComponent,
    ClienteAvatarComponent,
  ],
  providers: [{ provide: LOCALE_ID, useValue: 'pt-BR' }],
  templateUrl: './agenda-hub.component.html',
  styleUrl: './agenda-hub.component.scss',
})
export class AgendaHubComponent implements OnInit, OnDestroy {
  private static readonly MAIN_AGENDA_CLASS = 'main--agenda-hub';
  private static readonly ROOT_SCROLL_LOCK_CLASS = 'agenda-hub-scroll-lock';
  private static readonly TITULO_APP = 'Nexa Beauty';
  private static readonly TITULO_APP_DEFAULT = 'Nexa Beauty | Agenda';

  private readonly elRef = inject(ElementRef<HTMLElement>);
  private readonly api = inject(SheetsApiService);
  private readonly router = inject(Router);
  private readonly route = inject(ActivatedRoute);
  private readonly destroyRef = inject(DestroyRef);
  private readonly title = inject(Title);
  private readonly appRef = inject(ApplicationRef);
  private readonly ngZone = inject(NgZone);
  private readonly cadastroDrawer = inject(ClienteCadastroDrawerService);
  private readonly profissionalDrawer = inject(ProfissionalCadastroDrawerService);
  private readonly servicoDrawer = inject(ServicoCadastroDrawerService);
  private readonly agendaNovoGlobal = inject(AgendaNovoGlobalService);
  readonly sessao = inject(SessaoUsuarioService);
  private readonly shellUi = inject(AppShellUiService);
  private readonly toast = inject(AppToastService);
  readonly profissionalFotoUrl = profissionalFotoUrl;

  @ViewChild(AgendaNovoComponent)
  private agendaDrawerRef?: AgendaNovoComponent;

  /** Após `?abrirNovaComanda=1`, quando um fluxo quiser já abrir o drawer de comanda. */
  private timerAbrirNovaComandaDesdeLista: ReturnType<typeof setTimeout> | null =
    null;

  mesRef = this.inicioDoMes(new Date());
  diaYmd = toYmd(new Date());
  /** Âncora da faixa semanal: esse dia + 6 à frente (não semana seg–dom). */
  semanaGridInicioYmd = toYmd(new Date());
  carregandoMes = false;
  carregandoDia = false;
  erro = '';
  porDia = new Map<string, number>();
  itensMes: AtendimentoListaItem[] = [];
  linhasDia: AtendimentoListaItem[] = [];
  linhasSemana: AtendimentoListaItem[] = [];
  carregandoSemana = false;
  profissionais: ProfissionalListaItem[] = [];
  /** Catálogo para altura do card (etapas Mega/Pacote e Serviços). */
  private regrasMega: RegraMegaItem[] = [];
  private regrasMegaQueratina: RegraMegaItem[] = [];
  private servicosCatalogo: Servico[] = [];
  /** Profissionais ocultos na grelha (vazio = todos visíveis). */
  profOcultos = new Set<number>();

  /** Mobile: dia único ou faixa semanal (mesma grelha por dia selecionado). */
  modoVista: HubModoVista = 'dia';
  profissionalMobileId: number | null = null;
  buscaCliente = '';
  layoutMobile = false;
  /** Deslocamento horizontal sincronizado (corpo da grelha usa transform, sem overflow). */
  grelhaScrollXDia = 0;
  grelhaScrollXSemana = 0;
  /**
   * Dock do scrollbar horizontal da vista semanal (fixed): gruda no bottom do
   * `main` quando o fim da grelha sai da viewport.
   */
  semanaHScroll: {
    visivel: boolean;
    left: number;
    width: number;
    bottom: number;
    scrollWidth: number;
  } = { visivel: false, left: 0, width: 0, bottom: 0, scrollWidth: 0 };
  private semanaHScrollRaf = 0;
  private semanaHScrollRo: ResizeObserver | null = null;

  readonly statusFiltrosHub = HUB_STATUS_FILTROS;
  /** Status ocultos na grelha (vazio = todos visíveis). */
  statusOcultos = new Set<HubStatusFiltroId>();

  hubMenuAberto: HubMenuToolbar | null = null;
  pulsoToolbarVisualizacao = false;
  pulsoToolbarFiltro = false;
  pulsoToolbarAcoes = false;
  pulsoMenuItem: string | null = null;
  private tPulsoVisualizacao: ReturnType<typeof setTimeout> | null = null;
  private tPulsoFiltro: ReturnType<typeof setTimeout> | null = null;
  private tPulsoAcoes: ReturnType<typeof setTimeout> | null = null;
  private tPulsoMenuItem: ReturnType<typeof setTimeout> | null = null;
  private readonly duracaoPulsoToolbarMs = 600;
  readonly monthDowLabels = [
    'dom.',
    'seg.',
    'ter.',
    'qua.',
    'qui.',
    'sex.',
    'sáb.',
  ] as const;
  readonly calDowLabels = [
    'DOM',
    'SEG',
    'TER',
    'QUA',
    'QUI',
    'SEX',
    'SÁB',
  ] as const;
  painelCalendarioAberto = false;
  /** Compacto: «Hoje» = modal centrado; rodapé «Calendário» = tela cheia. */
  painelCalendarioModo: 'centered' | 'fullscreen' = 'centered';
  /** Destaque visual no cabeçalho da coluna (clique no nome). */
  profCabecalhoAtivoId: number | null = null;

  slotsHoras: string[] = [];

  /** Modal «Atualizar Agendamento?» após arrastar cartão na grelha. */
  remarcarModalAberto = false;
  remarcarSalvando = false;
  remarcarErro = '';
  remarcarCtx: {
    bloco: AgendaHubBloco;
    profOrigemId: number;
    ymdOrigem: string;
    profDestinoId: number;
    ymdDestino: string;
    horaInicio: string;
  } | null = null;

  /** Modal «Atenção» excluir agendamento (ação do tip do cartão). */
  excluirTipModalAberto = false;
  excluirTipSalvando = false;
  excluirTipErro = '';
  excluirTipId: string | null = null;

  cardArrasteBloco: AgendaHubBloco | null = null;
  cardArrasteYmd = '';
  cardArrasteProfId = 0;
  cardArrasteAtivo = false;
  cardArrasteGhostTop = 0;
  cardArrasteGhostLeft = 0;
  cardArrasteGhostWidth = 0;
  cardArrasteGhostHeight = 0;
  cardArrasteGhostCor = '';
  private cardArrasteOffsetX = 0;
  private cardArrasteOffsetY = 0;
  private cardArrasteStartX = 0;
  private cardArrasteStartY = 0;
  private cardArrasteSuprimirClick = false;
  private cardArrastePointerId: number | null = null;
  private cardArrasteCaptureEl: HTMLElement | null = null;
  /** Último encaixe na grelha durante o arraste (snap por faixa de 30 min). */
  private cardArrasteDropPreview: {
    profId: number;
    ymd: string;
    horaInicio: string;
  } | null = null;
  private readonly onDocPointerMove = (e: PointerEvent) =>
    this.onCardArrasteMove(e);
  private readonly onDocPointerUp = (e: PointerEvent) =>
    this.onCardArrasteUp(e);

  /** Tooltip de hover nos cartões da grelha (delay 1.8s). */
  cardHoverTip: AgendaCardHoverTip | null = null;
  cardHoverTipVisible = false;
  /** Expõe o flag de pin para o template (badge DEBUG). */
  readonly cardHoverTipPinDebug = CARD_HOVER_TIP_PIN_DEBUG;
  /** Cor do texto «Sem cor» no tip. */
  readonly tipSemCorTexto = TIP_SEM_COR_TEXTO;
  /**
   * Tip preso após ação (ex.: abrir drawer): não fecha no mouseleave;
   * só fecha ao voltar a pairar no cartão de origem.
   */
  private cardHoverTipSticky = false;
  /** Submenu de status no tip (hover). */
  tipStatusMenuOpen = false;
  private tipStatusMenuCloseTimer: ReturnType<typeof setTimeout> | null = null;
  private tipStatusMenuOpenTimer: ReturnType<typeof setTimeout> | null = null;
  readonly agendaStatusOpcoesTip = AGENDA_STATUS_META;
  tipStatusSalvando = false;
  /** Submenu de cor no tip (hover). */
  tipCorMenuOpen = false;
  private tipCorMenuCloseTimer: ReturnType<typeof setTimeout> | null = null;
  private tipCorMenuOpenTimer: ReturnType<typeof setTimeout> | null = null;
  readonly agendaCorOpcoesTip = AGENDA_COR_META_BASE.filter(
    (o) => o.id !== AGENDA_COR_PADRAO_ID,
  );
  tipCorSalvando = false;
  private cardHoverShowTimer: ReturnType<typeof setTimeout> | null = null;
  private cardHoverHideTimer: ReturnType<typeof setTimeout> | null = null;
  private cardHoverFadeTimer: ReturnType<typeof setTimeout> | null = null;
  private cardHoverSuppressed = false;
  private readonly clienteTipCache = new Map<string, Cliente>();

  modalAberto = false;
  modalContexto: {
    data: string;
    profissional_id: number;
    /** Vazio = abrir só com data (e opcionalmente profissional). */
    hora?: string;
    /** Edição: abre o drawer já com este pedido carregado. */
    id_atendimento?: string;
  } | null = null;

  /**
   * Quando true, o drawer e o overlay aplicam o estado “aberto” (animação
   * `translateX(0)` / opacidade). Ao fechar passa a false primeiro e só depois
   * desmonta o conteúdo após `DRAWER_ANIM_MS`.
   */
  drawerPanelOpen = false;

  /** Segundo painel («Nova comanda») por cima do drawer de agendamento. */
  comandaPainelAberto = false;
  comandaDrawerPanelOpen = false;
  /**
   * Após a slide-in: desliga transition de transform (evita shake ao fechar
   * Faturar / Editar itens por cima).
   */
  comandaDrawerSettled = false;
  /** Comanda aberta sem drawer de agendamento (cartão já faturado na grelha). */
  comandaSomenteStandalone = false;
  /** Último pedido de abertura (para ligar o drawer de comanda à API depois). */
  comandaDrawerContexto: ComandaDrawerContextoAgenda | null = null;

  /** Sub-drawer Faturar (camada acima da comanda). */
  faturarDrawerAberto = false;
  faturarDrawerPanelOpen = false;
  faturarCtx: {
    idAtendimento: string;
    resumo: ComandaResumoPagamentos;
    creditoAUsar?: number;
    nomeCliente: string;
    modoVerPagamentos?: boolean;
  } | null = null;
  /** Data da comanda (`AAAA-MM-DD`) — alinha «Data do pagamento» / «Atrasado» no Faturar. */
  comandaDataYmdParaFaturar: string | null = null;

  /**
   * Drawer «Editando itens da comanda» (fluxoSomenteComanda), por cima da
   * visualização da comanda — não o drawer de agendamento do calendário.
   */
  editComandaAberto = false;
  editComandaPanelOpen = false;
  editComandaCtx: {
    data: string;
    profissional_id: number;
    hora?: string;
    id_atendimento?: string;
  } | null = null;

  whatsappModalAberto = false;
  whatsappContexto: WhatsappEnviarContexto | null = null;

  @ViewChild(NovaComandaDrawerComponent)
  private comandaDrawerRef?: NovaComandaDrawerComponent;

  @ViewChild(FaturarDrawerComponent)
  private faturarDrawerRef?: FaturarDrawerComponent;

  @ViewChild('editComandaDrawer')
  private editComandaDrawerRef?: AgendaNovoComponent;

  private drawerCloseTimer: ReturnType<typeof setTimeout> | null = null;
  private drawerOpenAnim: DrawerOpenAnimHandle | null = null;
  private comandaDrawerCloseTimer: ReturnType<typeof setTimeout> | null = null;
  private comandaDrawerSettleTimer: ReturnType<typeof setTimeout> | null = null;
  private faturarDrawerCloseTimer: ReturnType<typeof setTimeout> | null = null;
  private editComandaCloseTimer: ReturnType<typeof setTimeout> | null = null;
  private bodyScrollPreDrawer = 0;
  private pageScrollLockAtivo = false;

  private readonly onHubToolbarDocClick = (ev: MouseEvent): void => {
    const t = ev.target;
    if (!(t instanceof Element)) return;
    if (t.closest('.hub-toolbar-menu')) return;
    if (
      this.painelCalendarioAberto &&
      !t.closest('.hub-cal-anchor') &&
      !t.closest('.hub-header-compact__title')
    ) {
      this.fecharPaineisHub();
    }
    this.fecharMenusToolbar();
  };

  /**
   * ESC: um nível por vez (pagamentos → edição de itens → comanda → agendamento).
   * Usa `*Aberto` (não `*PanelOpen`) para não saltar níveis no mesmo keypress
   * enquanto a animação de fecho corre.
   */
  private readonly onDrawerKeydown = (ev: KeyboardEvent): void => {
    if (ev.key !== 'Escape' && ev.key !== 'Esc') return;
    if (ev.defaultPrevented) return;

    // Ficha/pilha do cliente, profissional ou serviço: ESC é só do host global.
    if (this.cadastroDrawer.isAberto) return;
    if (this.profissionalDrawer.aberto) return;
    if (this.servicoDrawer.aberto()) return;

    if (this.hubMenuAberto) {
      ev.preventDefault();
      ev.stopImmediatePropagation();
      this.fecharMenusToolbar();
      return;
    }
    if (this.algumPainelHubAberto()) {
      ev.preventDefault();
      ev.stopImmediatePropagation();
      this.fecharPaineisHub();
      return;
    }
    if (this.excluirTipModalAberto) {
      ev.preventDefault();
      ev.stopImmediatePropagation();
      if (!this.excluirTipSalvando) {
        this.fecharModalExcluirTip();
      }
      return;
    }
    if (this.remarcarModalAberto) {
      ev.preventDefault();
      ev.stopImmediatePropagation();
      if (!this.remarcarSalvando) {
        this.fecharModalRemarcar();
      }
      return;
    }
    if (this.whatsappModalAberto) {
      ev.preventDefault();
      ev.stopImmediatePropagation();
      this.fecharWhatsappModal();
      return;
    }

    if (this.faturarDrawerAberto) {
      ev.preventDefault();
      ev.stopImmediatePropagation();
      if (this.faturarDrawerRef?.tratarEscapeInterno()) return;
      if (this.faturarDrawerRef && !this.faturarDrawerRef.podeFecharDrawer()) {
        return;
      }
      this.fecharFaturarDrawer();
      return;
    }
    if (this.editComandaAberto) {
      ev.preventDefault();
      ev.stopImmediatePropagation();
      if (this.editComandaDrawerRef?.tratarEscapeInterno()) return;
      this.fecharEditComanda();
      return;
    }
    if (this.comandaPainelAberto) {
      ev.preventDefault();
      ev.stopImmediatePropagation();
      this.fecharComandaDrawer();
      return;
    }
    if (this.modalAberto) {
      ev.preventDefault();
      ev.stopImmediatePropagation();
      if (this.agendaDrawerRef?.tratarEscapeInterno()) return;
      this.fecharModal();
      return;
    }
  };

  /** Menu Novo → Agendamento: mesmo drawer da grelha. */
  private readonly onAgendaNovoAtalho = (
    modo: AgendaNovoGlobalModo,
  ): boolean => {
    if (modo !== 'agendamento') return false;
    this.limparComandaDrawerSemAnimacao();
    this.abrirNovoAtendimentoModal();
    return true;
  };

  ngOnInit(): void {
    this.ativarLayoutAgendaNoMain();
    this.destroyRef.onDestroy(() => this.desativarLayoutAgendaNoMain());

    this.agendaNovoGlobal.registerPageHandler(this.onAgendaNovoAtalho);
    this.destroyRef.onDestroy(() => {
      this.agendaNovoGlobal.unregisterPageHandler(this.onAgendaNovoAtalho);
    });

    this.slotsHoras = this.gerarSlots();
    this.setupLayoutMobile();
    this.setupRelogioGrelha();
    this.setupSemanaHScrollDock();
    window.addEventListener('keydown', this.onDrawerKeydown);
    document.addEventListener('click', this.onHubToolbarDocClick);
    this.destroyRef.onDestroy(() => {
      window.removeEventListener('keydown', this.onDrawerKeydown);
      document.removeEventListener('click', this.onHubToolbarDocClick);
      if (this.profHeadScrollbarHideTimer != null) {
        clearTimeout(this.profHeadScrollbarHideTimer);
        this.profHeadScrollbarHideTimer = null;
      }
    });
    this.carregarProfissionais();
    this.carregarCatalogoDuracoesAgenda();
    this.recarregarVistaAtiva();
    this.route.queryParamMap
      .pipe(
        filter((qm) => qm.get('abrirNovaComanda') === '1'),
        takeUntilDestroyed(this.destroyRef),
      )
      .subscribe(() => {
        queueMicrotask(() => this.abrirNovaComandaIgualAoBotaoRodapeAgenda());
      });
    this.route.queryParamMap
      .pipe(
        filter((qm) => qm.get('abrirNovoAgendamento') === '1'),
        takeUntilDestroyed(this.destroyRef),
      )
      .subscribe(() => {
        queueMicrotask(() => {
          this.limparComandaDrawerSemAnimacao();
          this.abrirNovoAtendimentoModal();
          this.limparQueryAbrirNovoAgendamento();
        });
      });
  }

  private ativarLayoutAgendaNoMain(): void {
    document.documentElement.classList.add(AgendaHubComponent.ROOT_SCROLL_LOCK_CLASS);
    document.querySelector('main.main')?.classList.add(AgendaHubComponent.MAIN_AGENDA_CLASS);
  }

  private desativarLayoutAgendaNoMain(): void {
    document.documentElement.classList.remove(AgendaHubComponent.ROOT_SCROLL_LOCK_CLASS);
    document.querySelector('main.main')?.classList.remove(AgendaHubComponent.MAIN_AGENDA_CLASS);
  }

  aoScrollProxySemana(ev: Event): void {
    if (this.layoutMobile || this.modoVista !== 'semana') return;
    const proxy = ev.target as HTMLElement | null;
    if (!proxy) return;
    const wrap = this.hostEl.querySelector('.week-grid-wrap');
    if (!wrap) return;
    this.aplicarScrollHorizontalGrelha(proxy.scrollLeft, wrap, 'semana');
  }

  private setupSemanaHScrollDock(): void {
    if (typeof window === 'undefined') return;
    const onScrollOrResize = (): void => this.agendarAtualizarSemanaHScrollDock();
    this.ngZone.runOutsideAngular(() => {
      window.addEventListener('resize', onScrollOrResize, { passive: true });
      this.destroyRef.onDestroy(() => {
        window.removeEventListener('resize', onScrollOrResize);
        if (this.semanaHScrollRaf) {
          cancelAnimationFrame(this.semanaHScrollRaf);
          this.semanaHScrollRaf = 0;
        }
        this.semanaHScrollRo?.disconnect();
        this.semanaHScrollRo = null;
        const main = this.mainAgendaEl();
        if (main) main.removeEventListener('scroll', onScrollOrResize);
      });

      queueMicrotask(() => {
        const main = this.mainAgendaEl();
        if (main) {
          main.addEventListener('scroll', onScrollOrResize, { passive: true });
        }
        if (typeof ResizeObserver !== 'undefined') {
          this.semanaHScrollRo = new ResizeObserver(() => onScrollOrResize());
          this.semanaHScrollRo.observe(this.hostEl as Element);
        }
        onScrollOrResize();
      });
    });
  }

  private mainAgendaEl(): HTMLElement | null {
    return this.hostEl.closest('main.main--agenda-hub');
  }

  private agendarAtualizarSemanaHScrollDock(): void {
    if (this.semanaHScrollRaf) cancelAnimationFrame(this.semanaHScrollRaf);
    this.semanaHScrollRaf = requestAnimationFrame(() => {
      this.semanaHScrollRaf = 0;
      this.ngZone.run(() => this.atualizarSemanaHScrollDock());
    });
  }

  private atualizarSemanaHScrollDock(): void {
    if (this.layoutMobile || this.modoVista !== 'semana') {
      if (this.semanaHScroll.visivel) {
        this.semanaHScroll = {
          visivel: false,
          left: 0,
          width: 0,
          bottom: 0,
          scrollWidth: 0,
        };
      }
      return;
    }

    const wrap = this.hostEl.querySelector('.week-grid-wrap');
    const pane = wrap?.querySelector<HTMLElement>(
      '.week-grid-body > .grid-x-pane',
    );
    const cols = pane?.querySelector<HTMLElement>('.week-grid-body__cols');
    const main = this.mainAgendaEl();
    if (!pane || !cols || !main) {
      if (this.semanaHScroll.visivel) {
        this.semanaHScroll = {
          visivel: false,
          left: 0,
          width: 0,
          bottom: 0,
          scrollWidth: 0,
        };
      }
      return;
    }

    if (this.semanaHScrollRo && wrap) {
      try {
        this.semanaHScrollRo.observe(wrap);
        this.semanaHScrollRo.observe(pane);
        this.semanaHScrollRo.observe(cols);
      } catch {
        /* já observado */
      }
    }

    const scrollWidth = cols.scrollWidth;
    const clientWidth = pane.clientWidth;
    const needsScroll = scrollWidth > clientWidth + 1;
    const mainRect = main.getBoundingClientRect();
    const paneRect = pane.getBoundingClientRect();
    const stillInView =
      paneRect.top < mainRect.bottom - 4 && paneRect.bottom > mainRect.top + 4;

    if (!needsScroll || !stillInView) {
      if (this.semanaHScroll.visivel) {
        this.semanaHScroll = {
          visivel: false,
          left: 0,
          width: 0,
          bottom: 0,
          scrollWidth: 0,
        };
      }
      return;
    }

    /** Fim natural da grelha; se passar do main, gruda no bottom do main. */
    const bottom = Math.max(
      Math.max(0, window.innerHeight - paneRect.bottom),
      Math.max(0, window.innerHeight - mainRect.bottom),
    );

    this.semanaHScroll = {
      visivel: true,
      left: paneRect.left,
      width: paneRect.width,
      bottom,
      scrollWidth,
    };

    const proxy = this.hostEl.querySelector<HTMLElement>(
      '.hub-hscroll-dock__viewport',
    );
    if (proxy && !this.gridScrollSyncLock) {
      const left = pane.scrollLeft;
      if (Math.abs(proxy.scrollLeft - left) > 0.5) {
        proxy.scrollLeft = left;
      }
    }
  }

  private sincronizarProxySemanaHScroll(left: number): void {
    const proxy = this.hostEl.querySelector<HTMLElement>(
      '.hub-hscroll-dock__viewport',
    );
    if (!proxy) return;
    if (Math.abs(proxy.scrollLeft - left) > 0.5) {
      proxy.scrollLeft = left;
    }
  }

  ngOnDestroy(): void {
    this.cancelarArrasteCard();
    this.cancelarPanGrelha();
    this.desativarLayoutAgendaNoMain();
    this.fecharCardHoverTip();
    this.restaurarTituloAba();
    if (this.timerAbrirNovaComandaDesdeLista != null) {
      clearTimeout(this.timerAbrirNovaComandaDesdeLista);
      this.timerAbrirNovaComandaDesdeLista = null;
    }
    if (this.drawerCloseTimer != null) {
      clearTimeout(this.drawerCloseTimer);
      this.drawerCloseTimer = null;
    }
    if (this.comandaDrawerCloseTimer != null) {
      clearTimeout(this.comandaDrawerCloseTimer);
      this.comandaDrawerCloseTimer = null;
    }
    if (this.comandaDrawerSettleTimer != null) {
      clearTimeout(this.comandaDrawerSettleTimer);
      this.comandaDrawerSettleTimer = null;
    }
    if (this.faturarDrawerCloseTimer != null) {
      clearTimeout(this.faturarDrawerCloseTimer);
      this.faturarDrawerCloseTimer = null;
    }
    this.limparEfeitosDrawer();
  }

  profissionaisVisiveis(): ProfissionalListaItem[] {
    return this.profissionais.filter((p) => !this.profOcultos.has(p.id));
  }

  temProfissionaisVisiveis(): boolean {
    return this.profissionaisVisiveis().length > 0;
  }

  abrirCadastroProfissionais(): void {
    void this.router.navigate(['/profissionais']);
  }

  profissionalAtivoMobile(): number | null {
    const all = this.profissionais.filter((p) => !this.profOcultos.has(p.id));
    if (all.length === 0) return null;
    if (
      this.profissionalMobileId != null &&
      all.some((p) => p.id === this.profissionalMobileId)
    ) {
      return this.profissionalMobileId;
    }
    return all[0]?.id ?? null;
  }

  profissionaisParaSelectMobile(): ProfissionalListaItem[] {
    return this.profissionais.filter((p) => !this.profOcultos.has(p.id));
  }

  selecionarModoVista(modo: HubModoVista): void {
    this.modoVista = modo;
    this.fecharMenusToolbar();
    this.dispararPulsoMenuItem(`vista-${modo}`);
    if (modo === 'mensal') {
      this.mesRef = this.inicioDoMes(this.parseYmdLocal(this.diaYmd));
    }
    if (modo === 'semana') {
      /** Sempre: hoje + 6 dias à frente. */
      const hoje = this.hojeYmd();
      this.semanaGridInicioYmd = hoje;
      this.diaYmd = hoje;
    }
    this.recarregarVistaAtiva();
    this.agendarAtualizarSemanaHScrollDock();
  }

  toggleHubMenu(menu: HubMenuToolbar, ev?: Event): void {
    ev?.stopPropagation();
    if (this.painelCalendarioAberto) {
      this.fecharPaineisHub();
    }
    this.hubMenuAberto = this.hubMenuAberto === menu ? null : menu;
    this.dispararPulsoToolbar(menu);
  }

  acaoAbrirConfiguracoesAgenda(): void {
    this.fecharMenusToolbar();
    void this.router.navigate(['/profissionais']);
  }

  private dispararPulsoToolbar(which: HubMenuToolbar): void {
    if (which === 'visualizacao') {
      if (this.tPulsoVisualizacao != null) clearTimeout(this.tPulsoVisualizacao);
      this.pulsoToolbarVisualizacao = false;
      queueMicrotask(() => {
        this.pulsoToolbarVisualizacao = true;
        this.tPulsoVisualizacao = setTimeout(() => {
          this.pulsoToolbarVisualizacao = false;
        }, this.duracaoPulsoToolbarMs);
      });
      return;
    }
    if (which === 'filtrar') {
      if (this.tPulsoFiltro != null) clearTimeout(this.tPulsoFiltro);
      this.pulsoToolbarFiltro = false;
      queueMicrotask(() => {
        this.pulsoToolbarFiltro = true;
        this.tPulsoFiltro = setTimeout(() => {
          this.pulsoToolbarFiltro = false;
        }, this.duracaoPulsoToolbarMs);
      });
      return;
    }
    if (this.tPulsoAcoes != null) clearTimeout(this.tPulsoAcoes);
    this.pulsoToolbarAcoes = false;
    queueMicrotask(() => {
      this.pulsoToolbarAcoes = true;
      this.tPulsoAcoes = setTimeout(() => {
        this.pulsoToolbarAcoes = false;
      }, this.duracaoPulsoToolbarMs);
    });
  }

  dispararPulsoMenuItem(id: string): void {
    if (this.tPulsoMenuItem != null) clearTimeout(this.tPulsoMenuItem);
    this.pulsoMenuItem = null;
    queueMicrotask(() => {
      this.pulsoMenuItem = id;
      this.tPulsoMenuItem = setTimeout(() => {
        this.pulsoMenuItem = null;
      }, this.duracaoPulsoToolbarMs);
    });
  }

  carregandoVista(): boolean {
    if (this.modoVista === 'semana') return this.carregandoSemana;
    if (this.modoVista === 'mensal') return this.carregandoMes;
    return this.carregandoDia;
  }

  fecharMenusToolbar(): void {
    this.hubMenuAberto = null;
  }

  /**
   * Rótulo central do header conforme distância a «hoje»:
   * Diário: 0 → Hoje; +1 → Amanhã; +2 → nome do dia; +3+ / -2- → data completa; -1 → Ontem.
   * Semanal: 0 → Essa semana; +1 → Próxima semana; -1 → Semana passada; ±2+ → intervalo de datas.
   * Mensal: «Junho, 2026»; ‹ › mudam o mês.
   */
  rotuloNavegacaoDia(): string {
    if (this.modoVista === 'mensal') {
      return this.rotuloMesNavegacao();
    }
    if (this.modoVista === 'semana') {
      return this.rotuloFaixaSemanal();
    }
    const diff = this.diffDiasDesdeHoje(this.diaYmd);
    if (diff === 0) return 'Hoje';
    if (diff === 1) return 'Amanhã';
    if (diff === -1) return 'Ontem';
    if (diff === 2) return this.nomeDiaSemanaLongo(this.diaYmd);
    return this.formatarDiaCabecalhoCompleto(this.diaYmd);
  }

  /** Título da aba: «Nexa Beauty | Agenda — Hoje» (segue o rótulo do header). */
  private atualizarTituloAba(): void {
    const rotulo = this.rotuloNavegacaoDia().trim();
    this.title.setTitle(
      rotulo
        ? `${AgendaHubComponent.TITULO_APP} | Agenda — ${rotulo}`
        : AgendaHubComponent.TITULO_APP_DEFAULT,
    );
  }

  private restaurarTituloAba(): void {
    this.title.setTitle(AgendaHubComponent.TITULO_APP_DEFAULT);
  }

  rotuloDowColunaSemana(d: { label: string }): string {
    return d.label
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .toLowerCase()
      .slice(0, 3);
  }

  rotuloNumColunaSemana(d: { diaNum: number }): string {
    return String(d.diaNum).padStart(2, '0');
  }

  isDomingo(ymd: string): boolean {
    return this.parseYmdLocal(ymd).getDay() === 0;
  }

  slotForaExpediente(slot: string): boolean {
    const h = parseInt(slot.split(':')[0] ?? '0', 10);
    return Number.isFinite(h) && h >= 12;
  }

  /** Diferença em dias civis (local): `ymd` menos hoje. */
  private diffDiasDesdeHoje(ymd: string): number {
    const hoje = this.parseYmdLocal(this.hojeYmd());
    const alvo = this.parseYmdLocal(ymd);
    hoje.setHours(12, 0, 0, 0);
    alvo.setHours(12, 0, 0, 0);
    return Math.round((alvo.getTime() - hoje.getTime()) / 86_400_000);
  }

  private nomeDiaSemanaLongo(ymd: string): string {
    const nome = this.parseYmdLocal(ymd).toLocaleDateString('pt-BR', {
      weekday: 'long',
    });
    if (!nome) return '';
    return nome.charAt(0).toUpperCase() + nome.slice(1);
  }

  private formatarDiaCabecalhoCompleto(ymd: string): string {
    const d = this.parseYmdLocal(ymd);
    const dia = String(d.getDate()).padStart(2, '0');
    const mes = d
      .toLocaleDateString('pt-BR', { month: 'short' })
      .replace(/\./g, '')
      .trim()
      .toLowerCase();
    const ano = d.getFullYear();
    const dow = d
      .toLocaleDateString('pt-BR', { weekday: 'short' })
      .replace(/\./g, '')
      .trim()
      .toLowerCase()
      .slice(0, 3);
    return `${dia} ${mes}, ${ano} (${dow})`;
  }

  /** 7 dias da semana (mesma faixa repetida em cada profissional). */
  /**
   * 7 dias da faixa semanal (âncora = `semanaGridInicioYmd`, tipicamente hoje).
   * A mesma faixa repete-se em cada profissional.
   */
  diasFaixaSemanal(): Array<{
    ymd: string;
    label: string;
    diaNum: number;
    selecionado: boolean;
    hoje: boolean;
    contagem: number;
  }> {
    return this.diasFaixaSemanaInterno(
      SEMANA_COLUNAS,
      this.semanaGridInicioYmd,
    );
  }

  private diasFaixaSemanaInterno(
    total: number,
    inicioYmd: string,
  ): Array<{
    ymd: string;
    label: string;
    diaNum: number;
    selecionado: boolean;
    hoje: boolean;
    contagem: number;
  }> {
    const inicio = this.parseYmdLocal(inicioYmd);
    const out: Array<{
      ymd: string;
      label: string;
      diaNum: number;
      selecionado: boolean;
      hoje: boolean;
      contagem: number;
    }> = [];
    for (let i = 0; i < total; i++) {
      const d = new Date(inicio);
      d.setDate(inicio.getDate() + i);
      const ymd = toYmd(d);
      out.push({
        ymd,
        label: this.labelDiaSemanaCurto(d),
        diaNum: d.getDate(),
        selecionado: ymd === this.diaYmd,
        hoje: ymd === this.hojeYmd(),
        contagem: this.contagem(ymd),
      });
    }
    return out;
  }

  private fimFaixaSemanalYmd(inicioYmd: string): string {
    const d = this.parseYmdLocal(inicioYmd);
    d.setDate(d.getDate() + SEMANA_COLUNAS - 1);
    return toYmd(d);
  }

  /** Deslocamento da faixa visível em blocos de 7 dias relativamente a «hoje». */
  private diffSemanasFaixaDesdeHoje(): number {
    return Math.round(this.diffDiasDesdeHoje(this.semanaGridInicioYmd) / 7);
  }

  /** Vista mensal: «Junho, 2026». */
  private rotuloMesNavegacao(): string {
    const mes = this.mesRef.toLocaleDateString('pt-BR', { month: 'long' });
    const mesCap = mes.charAt(0).toUpperCase() + mes.slice(1);
    return `${mesCap}, ${this.mesRef.getFullYear()}`;
  }

  private rotuloFaixaSemanal(): string {
    const diff = this.diffSemanasFaixaDesdeHoje();
    if (diff === 0) return 'Essa semana';
    if (diff === 1) return 'Próxima semana';
    if (diff === -1) return 'Semana passada';
    const inicio = this.semanaGridInicioYmd;
    const fim = this.fimFaixaSemanalYmd(inicio);
    return `${this.formatarDataFaixaSemanal(inicio)} - ${this.formatarDataFaixaSemanal(fim)}`;
  }

  /** Ex.: «18 jun, 2026» (mês abreviado minúsculo, sem zero à esquerda no dia). */
  private formatarDataFaixaSemanal(ymd: string): string {
    const d = this.parseYmdLocal(ymd);
    const mes = d
      .toLocaleDateString('pt-BR', { month: 'short' })
      .replace(/\./g, '')
      .trim()
      .toLowerCase();
    return `${d.getDate()} ${mes}, ${d.getFullYear()}`;
  }

  private labelDiaSemanaCurto(d: Date): string {
    const nome = d
      .toLocaleDateString('pt-BR', { weekday: 'short' })
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .replace(/\./g, '')
      .trim()
      .toLowerCase();
    return nome.slice(0, 3);
  }

  private deslocarFaixaSemanal(deltaDias: number): void {
    const d = this.parseYmdLocal(this.semanaGridInicioYmd);
    d.setDate(d.getDate() + deltaDias);
    this.semanaGridInicioYmd = toYmd(d);
    this.diaYmd = this.semanaGridInicioYmd;
    this.atualizarTituloAba();
    this.carregarSemana();
  }

  diaAnterior(): void {
    if (this.modoVista === 'mensal') {
      this.mesAnterior();
      return;
    }
    if (this.modoVista === 'semana') {
      this.deslocarFaixaSemanal(-7);
      return;
    }
    const d = this.parseYmdLocal(this.diaYmd);
    d.setDate(d.getDate() - 1);
    this.selecionarDia(toYmd(d));
  }

  diaSeguinte(): void {
    if (this.modoVista === 'mensal') {
      this.mesSeguinte();
      return;
    }
    if (this.modoVista === 'semana') {
      this.deslocarFaixaSemanal(7);
      return;
    }
    const d = this.parseYmdLocal(this.diaYmd);
    d.setDate(d.getDate() + 1);
    this.selecionarDia(toYmd(d));
  }

  limparBuscaCliente(): void {
    this.buscaCliente = '';
  }

  algumPainelHubAberto(): boolean {
    return this.painelCalendarioAberto;
  }

  fecharPaineisHub(): void {
    this.painelCalendarioAberto = false;
    this.fecharMenusToolbar();
  }

  abrirPainelCalendario(modo: 'centered' | 'fullscreen'): void {
    this.fecharMenusToolbar();
    this.painelCalendarioModo = modo;
    this.mesRef = this.inicioDoMes(this.parseYmdLocal(this.diaYmd));
    this.painelCalendarioAberto = true;
  }

  togglePainelCalendario(modo: 'centered' | 'fullscreen' = 'centered'): void {
    if (this.painelCalendarioAberto && this.painelCalendarioModo === modo) {
      this.fecharPaineisHub();
      return;
    }
    this.abrirPainelCalendario(modo);
  }

  filtroHubAtivo(): boolean {
    return this.profOcultos.size > 0 || this.statusOcultos.size > 0;
  }

  statusFiltroVisivel(id: HubStatusFiltroId): boolean {
    return !this.statusOcultos.has(id);
  }

  toggleStatusFiltro(id: HubStatusFiltroId): void {
    if (this.statusOcultos.has(id)) {
      this.statusOcultos.delete(id);
    } else {
      this.statusOcultos.add(id);
    }
  }

  restaurarStatusFiltroPadrao(): void {
    this.statusOcultos.clear();
  }

  desmarcarTodosProfissionais(): void {
    for (const p of this.profissionais) {
      this.profOcultos.add(p.id);
    }
    this.agendarAtualizarSemanaHScrollDock();
  }

  selecionarTodosProfissionais(): void {
    this.profOcultos.clear();
    this.agendarAtualizarSemanaHScrollDock();
  }

  /** Todos os profissionais ocultos no filtro (lista não vazia). */
  todosProfissionaisDesmarcados(): boolean {
    const list = this.profissionais;
    return (
      list.length > 0 && list.every((p) => this.profOcultos.has(p.id))
    );
  }

  alternarSelecaoTodosProfissionais(): void {
    if (this.todosProfissionaisDesmarcados()) {
      this.selecionarTodosProfissionais();
    } else {
      this.desmarcarTodosProfissionais();
    }
  }

  profissionalFiltroVisivel(id: number): boolean {
    return !this.profOcultos.has(id);
  }

  acaoBloquearHorarios(): void {
    this.dispararPulsoMenuItem('acao-bloquear');
    this.fecharMenusToolbar();
    this.abrirNovoAtendimentoModal();
  }

  acaoAgruparAgendamentos(): void {
    this.dispararPulsoMenuItem('acao-agrupar');
    this.fecharMenusToolbar();
    this.abrirNovoAtendimentoModal();
  }

  acaoEnviarWhatsapp(): void {
    this.dispararPulsoMenuItem('acao-whatsapp');
    this.fecharMenusToolbar();

    const ctx = this.comandaDrawerContexto;
    let cliente: Cliente | null = ctx?.cliente ?? null;
    let clienteId = ctx?.clienteId?.trim() ?? '';
    let idAtendimento = ctx?.idAtendimento?.trim() ?? '';
    let dataYmd = ctx?.dataYmd ?? this.diaYmd;

    if (!cliente) {
      const ag = this.agendaDrawerRef?.clienteSelecionado();
      if (ag?.id?.trim()) {
        clienteId = ag.id.trim();
        cliente = {
          id: clienteId,
          nome: String(ag.nome ?? '').trim(),
          telefone: ag.telefone ?? null,
          celular: ag.celular ?? null,
        };
      }
    }

    const tel = cliente?.celular?.trim() || cliente?.telefone?.trim() || '';
    const digitos = telefoneBrDigitos(tel);
    if (digitos.length < 10) {
      this.toast.show('Selecione um agendamento com cliente e telefone válido.');
      return;
    }

    const linhas = idAtendimento
      ? this.linhasDia.filter((l) => l.id === idAtendimento)
      : this.linhasDia.filter((l) => l.idCliente === clienteId);
    const linha = linhas[0];
    if (linha?.id && !idAtendimento) idAtendimento = linha.id;

    const ymd = (linha?.data ?? dataYmd ?? '').slice(0, 10);
    let dataFmt = ymd;
    const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(ymd);
    if (m) dataFmt = `${m[3]}/${m[2]}/${m[1]}`;

    let hora =
      resolverHoraWhatsappAgendamento({ linhasInicio: linhas }) ?? '';

    this.whatsappContexto = {
      telefone: digitos,
      clienteId: clienteId || undefined,
      clienteNome: nomeClienteParaWhatsapp(cliente),
      idAtendimento: idAtendimento || undefined,
      templateCodigo: 'confirmacao',
      variaveis: {
        cliente: nomeClienteParaWhatsapp(cliente),
        data: dataFmt,
        hora,
      },
    };
    this.whatsappModalAberto = true;
  }

  fecharWhatsappModal(): void {
    this.whatsappModalAberto = false;
  }

  abrirConfigProfissional(_p: ProfissionalListaItem, ev: Event): void {
    ev.preventDefault();
    ev.stopPropagation();
    this.fecharMenusToolbar();
    void this.router.navigate(['/profissionais']);
  }

  atualizarGrelhaAgenda(): void {
    this.recarregarVistaAtiva();
  }

  /** Escolha de dia no painel Calendário: atualiza grelha e fecha o painel. */
  selecionarDiaCalendario(ymd: string | null): void {
    this.selecionarDia(ymd);
    this.fecharPaineisHub();
  }

  abrirMenuAgenda(): void {
    this.fecharMenusToolbar();
    if (
      typeof window !== 'undefined' &&
      window.matchMedia(mediaQueryMax('shellMobile')).matches
    ) {
      this.shellUi.requestToggleMobileNav();
    } else {
      this.shellUi.requestToggleSidebar();
    }
  }

  aoClicarCabecalhoProfissional(p: ProfissionalListaItem): void {
    if (this.suprimirClickProfCabecalho) {
      this.suprimirClickProfCabecalho = false;
      return;
    }
    this.profCabecalhoAtivoId = p.id;
    this.profissionalDrawer.abrirEdicao(p.id, {
      onSalvo: (item) => {
        if (item) {
          const foto = profissionalFotoUrl(item);
          this.profissionais = this.profissionais.map((prof) =>
            prof.id === item.id
              ? { ...prof, ...item, fotoUrl: foto, foto_url: foto }
              : prof,
          );
        }
        this.carregarProfissionais();
        this.recarregarVistaAtiva();
      },
      onFechar: () => {
        this.profCabecalhoAtivoId = null;
      },
    });
  }

  private carregarProfissionais(): void {
    this.api.listProfissionais(false, 'agenda').subscribe({
      next: (items) => {
        this.profissionais = items ?? [];
        this.aplicarFiltroMinhaAgenda();
      },
      error: () => {
        this.profissionais = [];
      },
    });
  }

  /** Regras Mega + Serviços: duração do card segue o catálogo, não só inicio/fim gravados. */
  private carregarCatalogoDuracoesAgenda(): void {
    this.api.listRegrasMega().pipe(take(1), catchError(() => of([]))).subscribe({
      next: (items) => {
        this.regrasMega = items ?? [];
      },
    });
    this.api
      .listRegrasMegaQueratina()
      .pipe(take(1), catchError(() => of([])))
      .subscribe({
        next: (items) => {
          this.regrasMegaQueratina = items ?? [];
        },
      });
    this.api.listServicos().pipe(take(1), catchError(() => of([]))).subscribe({
      next: (items) => {
        this.servicosCatalogo = items ?? [];
      },
    });
  }

  /** Profissionais logados veem só a própria coluna na grelha. */
  private aplicarFiltroMinhaAgenda(): void {
    const pid = this.sessao.profissionalId();
    if (!this.sessao.isProfissional() || pid == null) return;
    for (const p of this.profissionais) {
      if (p.id !== pid) this.profOcultos.add(p.id);
    }
    this.profissionalMobileId = pid;
  }

  private gridScrollSyncLock = false;
  private panGrelhaGrupo: 'dia' | 'semana' | null = null;
  private panGrelhaPointerId = -1;
  private panGrelhaStartX = 0;
  private panGrelhaStartY = 0;
  private panGrelhaStartScroll = 0;
  private panGrelhaAxis: 'x' | 'y' | null = null;
  private panGrelhaWrap: Element | null = null;
  private panGrelhaCaptureEl: HTMLElement | null = null;
  /** Evita abrir drawer ao soltar após arraste horizontal no cabeçalho. */
  private suprimirClickProfCabecalho = false;
  private panGrelhaDistanciaMaxima = 0;
  private profHeadScrollbarHideTimer: ReturnType<typeof setTimeout> | null = null;

  transformGrelhaCols(grupo: 'dia' | 'semana'): string | null {
    if (!this.layoutMobile) return null;
    const x = grupo === 'dia' ? this.grelhaScrollXDia : this.grelhaScrollXSemana;
    return `translateX(${-x}px)`;
  }

  aoPanGrelhaInicio(ev: PointerEvent, grupo: 'dia' | 'semana'): void {
    if (!this.layoutMobile || ev.button !== 0) return;
    const alvo = ev.target;
    if (!(alvo instanceof Element)) return;
    if (alvo.closest('.day-col__card')) return;
    const pane = ev.currentTarget;
    if (!(pane instanceof HTMLElement)) return;
    /** Mobile: permite arrastar a partir dos botões de profissional no cabeçalho. */
    if (
      alvo.closest('.grid-head__prof') &&
      !(this.layoutMobile && pane.closest('.grid-head'))
    ) {
      return;
    }

    /**
     * No layout compacto, o hub-scroll-chrome está FORA do grid-wrap (a nível de hub-page).
     * Usa `closest` primeiro; se falhar (pan vindo do chrome), procura no host do componente.
     */
    const wrap =
      alvo.closest(grupo === 'semana' ? '.week-grid-wrap' : '.grid-wrap') ??
      this.hostEl.querySelector<Element>(
        grupo === 'semana' ? '.week-grid-wrap' : '.grid-wrap',
      );
    if (!wrap) return;

    this.panGrelhaGrupo = grupo;
    this.panGrelhaPointerId = ev.pointerId;
    this.panGrelhaStartX = ev.clientX;
    this.panGrelhaStartY = ev.clientY;
    this.panGrelhaStartScroll =
      grupo === 'dia' ? this.grelhaScrollXDia : this.grelhaScrollXSemana;
    this.panGrelhaAxis = null;
    this.panGrelhaDistanciaMaxima = 0;
    this.panGrelhaWrap = wrap;
    this.panGrelhaCaptureEl = pane;

    /** Fase 1 (passive): detecta eixo sem bloquear scroll vertical em `main`. */
    pane.addEventListener('pointermove', this.panGrelhaDetectMove, {
      passive: true,
    });
    pane.addEventListener('pointerup', this.onPanGrelhaEnd);
    pane.addEventListener('pointercancel', this.onPanGrelhaEnd);
  }

  /** Detecção de eixo com listener passive — não impede scroll nativo no eixo Y. */
  private readonly panGrelhaDetectMove = (ev: PointerEvent): void => {
    if (
      this.panGrelhaGrupo == null ||
      ev.pointerId !== this.panGrelhaPointerId ||
      this.panGrelhaAxis != null
    ) {
      return;
    }

    const dx = ev.clientX - this.panGrelhaStartX;
    const dy = ev.clientY - this.panGrelhaStartY;

    if (
      Math.abs(dx) < PAN_GRELHA_LIMIAR_PX &&
      Math.abs(dy) < PAN_GRELHA_LIMIAR_PX
    ) {
      return;
    }

    this.removerPanGrelhaDetectorPassivo();

    if (Math.abs(dy) > Math.abs(dx)) {
      this.cancelarPanGrelha();
      return;
    }

    this.panGrelhaAxis = 'x';
    if (this.layoutMobile) {
      this.setProfHeadScrollbarAtivo(true);
    }
    try {
      this.panGrelhaCaptureEl?.setPointerCapture(ev.pointerId);
    } catch {
      /* ignorar */
    }
    this.panGrelhaCaptureEl?.addEventListener(
      'pointermove',
      this.onPanGrelhaMove,
      { passive: false },
    );
    this.onPanGrelhaMove(ev);
  };

  private readonly onPanGrelhaMove = (ev: PointerEvent): void => {
    if (
      this.panGrelhaGrupo == null ||
      ev.pointerId !== this.panGrelhaPointerId ||
      this.panGrelhaAxis !== 'x' ||
      !this.panGrelhaWrap ||
      !this.panGrelhaGrupo
    ) {
      return;
    }

    const dx = ev.clientX - this.panGrelhaStartX;
    this.panGrelhaDistanciaMaxima = Math.max(
      this.panGrelhaDistanciaMaxima,
      Math.abs(dx),
    );

    ev.preventDefault();
    const max = this.maxScrollHorizontalGrelha(
      this.panGrelhaWrap,
      this.panGrelhaCaptureEl,
    );
    const left = Math.min(
      max,
      Math.max(0, this.panGrelhaStartScroll - dx),
    );
    this.aplicarScrollHorizontalGrelha(
      left,
      this.panGrelhaWrap,
      this.panGrelhaGrupo,
    );
  };

  private readonly onPanGrelhaEnd = (ev: PointerEvent): void => {
    if (
      this.panGrelhaGrupo == null ||
      ev.pointerId !== this.panGrelhaPointerId
    ) {
      return;
    }
    this.cancelarPanGrelha();
  };

  private removerPanGrelhaDetectorPassivo(): void {
    this.panGrelhaCaptureEl?.removeEventListener(
      'pointermove',
      this.panGrelhaDetectMove,
    );
  }

  private cancelarPanGrelha(): void {
    if (
      this.panGrelhaAxis === 'x' &&
      this.panGrelhaCaptureEl?.closest('.grid-head') &&
      this.panGrelhaDistanciaMaxima >= PAN_GRELHA_LIMIAR_PX
    ) {
      this.suprimirClickProfCabecalho = true;
    }
    this.panGrelhaDistanciaMaxima = 0;
    this.setProfHeadScrollbarAtivo(false);
    this.removerPanGrelhaDetectorPassivo();
    this.panGrelhaCaptureEl?.removeEventListener(
      'pointermove',
      this.onPanGrelhaMove,
    );
    this.panGrelhaCaptureEl?.removeEventListener(
      'pointerup',
      this.onPanGrelhaEnd,
    );
    this.panGrelhaCaptureEl?.removeEventListener(
      'pointercancel',
      this.onPanGrelhaEnd,
    );
    try {
      if (this.panGrelhaPointerId >= 0) {
        this.panGrelhaCaptureEl?.releasePointerCapture?.(this.panGrelhaPointerId);
      }
    } catch {
      /* ignorar */
    }
    this.panGrelhaGrupo = null;
    this.panGrelhaPointerId = -1;
    this.panGrelhaAxis = null;
    this.panGrelhaWrap = null;
    this.panGrelhaCaptureEl = null;
  }

  private get hostEl(): Element {
    return this.elRef.nativeElement as unknown as Element;
  }

  /** Compacto: indicador horizontal visível durante o arraste e some após um breve delay. */
  private setProfHeadScrollbarAtivo(ativo: boolean): void {
    if (!this.layoutMobile) return;

    if (ativo) {
      if (this.profHeadScrollbarHideTimer != null) {
        clearTimeout(this.profHeadScrollbarHideTimer);
        this.profHeadScrollbarHideTimer = null;
      }
      this.toggleProfHeadScrollbarClass(true);
      return;
    }

    if (this.profHeadScrollbarHideTimer != null) {
      clearTimeout(this.profHeadScrollbarHideTimer);
    }

    this.profHeadScrollbarHideTimer = setTimeout(() => {
      this.profHeadScrollbarHideTimer = null;
      this.toggleProfHeadScrollbarClass(false);
    }, PROF_HEAD_SCROLLBAR_HIDE_MS);
  }

  private toggleProfHeadScrollbarClass(ativo: boolean): void {
    this.hostEl
      .querySelectorAll<HTMLElement>(
        '.hub-mobile-sticky-head .grid-head__scroll-zone',
      )
      .forEach((zone) => {
        zone.classList.toggle('grid-head__scroll-zone--scrollbar-active', ativo);
      });
  }

  private paneHorizontalGrelha(wrap: Element): HTMLElement | null {
    return (
      wrap.querySelector<HTMLElement>('.grid-head .grid-x-pane') ??
      this.hostEl.querySelector<HTMLElement>('.grid-head .grid-x-pane')
    );
  }

  private trilhoHorizontalGrelha(pane: HTMLElement): HTMLElement | null {
    return pane.querySelector<HTMLElement>(
      '.grid-head__prof-track, .week-grid-head__prof-track, .week-grid-head__days-track, .grid-body__cols, .week-grid-body__cols',
    );
  }

  private maxScrollHorizontalGrelha(
    wrap: Element,
    panePreferido?: HTMLElement | null,
  ): number {
    const pane = panePreferido ?? this.paneHorizontalGrelha(wrap);
    if (!pane) return 0;
    const trilho = this.trilhoHorizontalGrelha(pane);
    if (!trilho) return 0;
    return Math.max(0, trilho.scrollWidth - pane.clientWidth);
  }

  private sincronizarIndicadorScrollGrelha(wrap: Element, left: number): void {
    if (!this.layoutMobile) return;
    const pane = this.paneHorizontalGrelha(wrap);
    const trilho = pane ? this.trilhoHorizontalGrelha(pane) : null;
    if (!pane || !trilho || trilho.scrollWidth <= 0) return;

    const max = Math.max(0, trilho.scrollWidth - pane.clientWidth);
    const host = this.hostEl as HTMLElement;
    const thumbW = (pane.clientWidth / trilho.scrollWidth) * 100;
    const thumbL = max > 0 ? (left / max) * (100 - thumbW) : 0;
    host.style.setProperty('--hub-grelha-thumb-w', `${thumbW}%`);
    host.style.setProperty('--hub-grelha-thumb-l', `${thumbL}%`);
  }

  private aplicarScrollHorizontalGrelha(
    left: number,
    wrap: Element,
    grupo: 'dia' | 'semana',
  ): void {
    if (this.gridScrollSyncLock) return;
    this.gridScrollSyncLock = true;

    if (this.layoutMobile) {
      if (grupo === 'dia') {
        this.grelhaScrollXDia = left;
      } else {
        this.grelhaScrollXSemana = left;
      }
      this.sincronizarIndicadorScrollGrelha(wrap, left);
    } else {
      /**
       * Desktop: sincroniza scrollLeft entre panes horizontais (chrome + grid-wrap).
       */
      this.hostEl
        .querySelectorAll<HTMLElement>('.grid-x-pane:not(.grid-x-pane--body-sync)')
        .forEach((pane: HTMLElement) => {
          pane.scrollLeft = left;
        });
      if (grupo === 'dia') {
        this.grelhaScrollXDia = left;
      } else {
        this.grelhaScrollXSemana = left;
        this.sincronizarProxySemanaHScroll(left);
      }
    }

    this.gridScrollSyncLock = false;
    if (grupo === 'semana') {
      this.agendarAtualizarSemanaHScrollDock();
    }
  }

  /** Sincroniza scroll horizontal entre cabeçalho e corpo da grelha. */
  aoScrollHorizontalGrelha(ev: Event, grupo: 'dia' | 'semana'): void {
    if (this.layoutMobile) return;
    const source = ev.target as HTMLElement | null;
    if (!source) return;
    /**
     * No layout compacto, o chrome está fora do grid-wrap; usa fallback para encontrar o wrap.
     */
    const wrap =
      source.closest(grupo === 'semana' ? '.week-grid-wrap' : '.grid-wrap') ??
      this.hostEl.querySelector<Element>(
        grupo === 'semana' ? '.week-grid-wrap' : '.grid-wrap',
      );
    if (!wrap) return;
    this.aplicarScrollHorizontalGrelha(source.scrollLeft, wrap, grupo);
  }

  toggleProfissionalOculto(id: number): void {
    if (this.profOcultos.has(id)) {
      this.profOcultos.delete(id);
    } else {
      this.profOcultos.add(id);
    }
    this.agendarAtualizarSemanaHScrollDock();
  }

  celulas(): CelulaCalendario[] {
    return this.celulasParaMes(this.mesRef);
  }

  celulasMesEsquerdo(): CelulaCalendario[] {
    return this.celulasParaMes(this.mesRef);
  }

  celulasMesDireito(): CelulaCalendario[] {
    const y = this.mesRef.getFullYear();
    const m = this.mesRef.getMonth();
    return this.celulasParaMes(new Date(y, m + 1, 1));
  }

  private celulasParaMes(ref: Date): CelulaCalendario[] {
    const y = ref.getFullYear();
    const m = ref.getMonth();
    const primeiroDow = new Date(y, m, 1).getDay();
    const diasNoMes = new Date(y, m + 1, 0).getDate();
    const diasMesAnterior = new Date(y, m, 0).getDate();
    const out: CelulaCalendario[] = [];

    for (let i = 0; i < primeiroDow; i++) {
      const dia = diasMesAnterior - (primeiroDow - 1 - i);
      const prevM = m === 0 ? 11 : m - 1;
      const prevY = m === 0 ? y - 1 : y;
      out.push({
        dia,
        ymd: this.ymdFromPartes(prevY, prevM, dia),
        foraDoMes: true,
      });
    }

    for (let d = 1; d <= diasNoMes; d++) {
      out.push({
        dia: d,
        ymd: this.ymdFromPartes(y, m, d),
        foraDoMes: false,
      });
    }

    let diaSeguinte = 1;
    while (out.length < MES_GRELHA_CELULAS) {
      const nextM = m === 11 ? 0 : m + 1;
      const nextY = m === 11 ? y + 1 : y;
      out.push({
        dia: diaSeguinte,
        ymd: this.ymdFromPartes(nextY, nextM, diaSeguinte),
        foraDoMes: true,
      });
      diaSeguinte++;
    }

    return out;
  }

  tituloCalEsquerdo(): string {
    const mes = this.mesRef.toLocaleDateString('pt-BR', { month: 'long' });
    const ano = this.mesRef.getFullYear();
    return `Esse mês - ${mes}, ${ano}`;
  }

  tituloCalDireito(): string {
    const ref = new Date(
      this.mesRef.getFullYear(),
      this.mesRef.getMonth() + 1,
      1,
    );
    const mes = ref.toLocaleDateString('pt-BR', { month: 'long' });
    return `${mes} de ${ref.getFullYear()}`;
  }

  isFimDeSemanaYmd(ymd: string): boolean {
    const dow = this.parseYmdLocal(ymd).getDay();
    return dow === 0 || dow === 6;
  }

  calAnoAnterior(): void {
    const y = this.mesRef.getFullYear();
    const m = this.mesRef.getMonth();
    this.mesRef = this.inicioDoMes(new Date(y - 1, m, 1));
    this.atualizarTituloAba();
    this.carregarMes();
  }

  calAnoSeguinte(): void {
    const y = this.mesRef.getFullYear();
    const m = this.mesRef.getMonth();
    this.mesRef = this.inicioDoMes(new Date(y + 1, m, 1));
    this.atualizarTituloAba();
    this.carregarMes();
  }

  irParaOntem(): void {
    const d = this.parseYmdLocal(this.hojeYmd());
    d.setDate(d.getDate() - 1);
    this.selecionarDiaCalendario(toYmd(d));
  }

  irParaHojeCal(): void {
    this.irParaHoje();
    this.fecharPaineisHub();
  }

  irParaAmanha(): void {
    const d = this.parseYmdLocal(this.hojeYmd());
    d.setDate(d.getDate() + 1);
    this.selecionarDiaCalendario(toYmd(d));
  }

  private ymdFromPartes(year: number, month: number, day: number): string {
    return `${year}-${String(month + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
  }

  contagem(ymd: string | null): number {
    if (!ymd) return 0;
    return this.porDia.get(ymd) ?? 0;
  }

  tituloMes(): string {
    return this.mesRef.toLocaleDateString('pt-BR', {
      month: 'long',
      year: 'numeric',
    });
  }

  selecionarDia(ymd: string | null): void {
    if (!ymd) return;
    this.diaYmd = ymd;
    const parts = this.parseYmdLocal(ymd);
    if (
      this.mesRef.getMonth() !== parts.getMonth() ||
      this.mesRef.getFullYear() !== parts.getFullYear()
    ) {
      this.mesRef = this.inicioDoMes(parts);
    }
    /** Na vista semanal a âncora é o dia escolhido (esse dia + 6 à frente). */
    if (this.modoVista === 'semana') {
      this.semanaGridInicioYmd = ymd;
    }
    this.recarregarVistaAtiva();
  }

  mesAnterior(): void {
    const y = this.mesRef.getFullYear();
    const m = this.mesRef.getMonth();
    this.mesRef = this.inicioDoMes(new Date(y, m - 1, 1));
    this.atualizarTituloAba();
    this.carregarMes();
  }

  mesSeguinte(): void {
    const y = this.mesRef.getFullYear();
    const m = this.mesRef.getMonth();
    this.mesRef = this.inicioDoMes(new Date(y, m + 1, 1));
    this.atualizarTituloAba();
    this.carregarMes();
  }

  irMesAtual(): void {
    this.mesRef = this.inicioDoMes(new Date());
    this.atualizarTituloAba();
    this.carregarMes();
  }

  /** Mini-calendário: mês atual e dia selecionado = hoje (grelha + receção). */
  irParaHoje(): void {
    const hoje = new Date();
    this.mesRef = this.inicioDoMes(hoje);
    this.diaYmd = toYmd(hoje);
    if (this.modoVista === 'semana') {
      this.semanaGridInicioYmd = this.diaYmd;
    }
    this.recarregarVistaAtiva();
  }

  get colsCount(): number {
    return Math.max(1, this.profissionaisVisiveis().length);
  }

  hojeYmd(): string {
    return toYmd(new Date());
  }

  /** Vista dia: o título «Hoje» corresponde ao `diaYmd` atual. */
  diaGrelhaEHoje(): boolean {
    return this.diaYmd === this.hojeYmd();
  }

  abrirNovo(profissionalId: number, hora: string, dataYmd?: string): void {
    this.modalContexto = {
      data: dataYmd ?? this.diaYmd,
      profissional_id: profissionalId,
      hora,
      id_atendimento: undefined,
    };
    this.modalAberto = true;
    this.iniciarAberturaDrawer();
  }

  /** Abre o mesmo modal de novo atendimento, sem slot na grelha (hora no formulário). */
  abrirNovoAtendimentoModal(dataYmd?: string): void {
    const vis = this.profissionaisVisiveis();
    const pid = vis[0]?.id ?? this.profissionais[0]?.id ?? 0;
    const data = dataYmd ?? this.diaYmd;
    this.modalContexto = {
      data,
      profissional_id: pid,
      hora: '',
      id_atendimento: undefined,
    };
    this.modalAberto = true;
    this.iniciarAberturaDrawer();
  }

  /** Vista mensal: clique na célula do dia → novo agendamento na data. */
  abrirNovoAgendamentoCelulaMensal(ymd: string): void {
    this.selecionarDia(ymd);
    this.abrirNovoAtendimentoModal(ymd);
  }

  /**
   * `?abrirNovaComanda=1`: replica o botão «Criar comanda»
   * do rodapé do agendamento (segundo drawer).
   */
  private abrirNovaComandaIgualAoBotaoRodapeAgenda(): void {
    this.limparComandaDrawerSemAnimacao();
    this.abrirNovoAtendimentoModal();
    const espera = DRAWER_ANIM_MS + 220;
    if (this.timerAbrirNovaComandaDesdeLista != null) {
      clearTimeout(this.timerAbrirNovaComandaDesdeLista);
    }
    this.timerAbrirNovaComandaDesdeLista = setTimeout(() => {
      this.timerAbrirNovaComandaDesdeLista = null;
      const ag = this.agendaDrawerRef;
      if (ag) {
        ag.abrirComandaRodapeIgualAoBotaoFooter();
      } else {
        this.timerAbrirNovaComandaDesdeLista = setTimeout(() => {
          this.timerAbrirNovaComandaDesdeLista = null;
          this.agendaDrawerRef?.abrirComandaRodapeIgualAoBotaoFooter();
          this.limparQueryAbrirNovaComanda();
        }, 360);
        return;
      }
      this.limparQueryAbrirNovaComanda();
    }, espera);
  }

  private limparQueryAbrirNovaComanda(): void {
    if (this.route.snapshot.queryParamMap.get('abrirNovaComanda') !== '1') {
      return;
    }
    void this.router.navigate([], {
      relativeTo: this.route,
      queryParams: { abrirNovaComanda: null },
      queryParamsHandling: 'merge',
      replaceUrl: true,
    });
  }

  private limparQueryAbrirNovoAgendamento(): void {
    if (this.route.snapshot.queryParamMap.get('abrirNovoAgendamento') !== '1') {
      return;
    }
    void this.router.navigate([], {
      relativeTo: this.route,
      queryParams: { abrirNovoAgendamento: null },
      queryParamsHandling: 'merge',
      replaceUrl: true,
    });
  }

  /** Comanda finalizada e quitada — cartão cinza-azulado e reabertura em modo visualização. */
  blocoComandaFaturada(b: AgendaHubBloco): boolean {
    const l0 = b.linhas[0];
    if (!l0 || !cobrancaFinalizadaItem(l0)) return false;
    if (l0.status_cobranca === 'pago') return true;
    return comandaQuitadaNasCifrasItem(l0, null);
  }

  /** Cartão pode ser arrastado para remarcar horário/profissional. */
  podeArrastarBloco(b: AgendaHubBloco): boolean {
    if (!this.idAtendimentoBloco(b)) return false;
    if (this.blocoComandaFaturada(b)) return false;
    if (this.statusFiltroBloco(b) === 'bloqueado') return false;
    return true;
  }

  cardArrasteEmCurso(b: AgendaHubBloco): boolean {
    return (
      this.cardArrasteAtivo &&
      this.cardArrasteBloco?.trackKey === b.trackKey
    );
  }

  onCardPointerDown(
    ev: PointerEvent,
    bloco: AgendaHubBloco,
    profId: number,
    ymd?: string,
  ): void {
    this.fecharCardHoverTip();
    this.cardHoverSuppressed = true;
    if (!this.podeArrastarBloco(bloco)) return;
    if (ev.button !== 0) return;
    if (this.remarcarModalAberto || this.modalAberto) return;

    const btn = ev.currentTarget as HTMLElement;
    const rect = btn.getBoundingClientRect();
    this.cardArrasteBloco = bloco;
    this.cardArrasteYmd = (ymd ?? this.diaYmd).trim().slice(0, 10);
    this.cardArrasteProfId = profId;
    this.cardArrasteOffsetX = ev.clientX - rect.left;
    this.cardArrasteOffsetY = ev.clientY - rect.top;
    this.cardArrasteStartX = ev.clientX;
    this.cardArrasteStartY = ev.clientY;
    this.cardArrasteGhostTop = rect.top;
    this.cardArrasteGhostLeft = rect.left;
    this.cardArrasteGhostWidth = rect.width;
    this.cardArrasteGhostHeight = rect.height;
    this.cardArrasteGhostCor = this.corFundoCartaoBloco(bloco);
    this.cardArrasteAtivo = false;
    this.cardArrasteSuprimirClick = false;
    this.cardArrastePointerId = ev.pointerId;
    this.cardArrasteCaptureEl = btn;

    btn.setPointerCapture(ev.pointerId);
    document.addEventListener('pointermove', this.onDocPointerMove);
    document.addEventListener('pointerup', this.onDocPointerUp);
    document.addEventListener('pointercancel', this.onDocPointerUp);
  }

  private onCardArrasteMove(ev: PointerEvent): void {
    if (this.cardArrasteBloco == null) return;
    if (
      this.cardArrastePointerId != null &&
      ev.pointerId !== this.cardArrastePointerId
    ) {
      return;
    }

    const dx = ev.clientX - this.cardArrasteStartX;
    const dy = ev.clientY - this.cardArrasteStartY;
    if (
      !this.cardArrasteAtivo &&
      Math.hypot(dx, dy) < ARRASTE_CARD_LIMIAR_PX
    ) {
      return;
    }

    if (!this.cardArrasteAtivo) {
      this.cardArrasteAtivo = true;
      this.cardArrasteSuprimirClick = true;
      document.body.classList.add('agenda-card-dragging');
    }

    this.atualizarGhostArrasteSnap(ev.clientX, ev.clientY);
  }

  private onCardArrasteUp(ev: PointerEvent): void {
    if (this.cardArrasteBloco == null) return;
    if (
      this.cardArrastePointerId != null &&
      ev.pointerId !== this.cardArrastePointerId
    ) {
      return;
    }

    const bloco = this.cardArrasteBloco;
    const profOrigemId = this.cardArrasteProfId;
    const ymdOrigem = this.cardArrasteYmd;
    const arrastou = this.cardArrasteAtivo;
    const dropPreview = this.cardArrasteDropPreview;

    try {
      this.cardArrasteCaptureEl?.releasePointerCapture?.(ev.pointerId);
    } catch {
      /* pointer já libertado */
    }

    this.cancelarArrasteCard();

    if (!arrastou) return;

    const drop =
      dropPreview ?? this.resolverDropNaGrelha(ev.clientX, ev.clientY);
    if (!drop) return;

    const horaOrigem = this.horaBloco(bloco, ymdOrigem);
    if (
      drop.profId === profOrigemId &&
      drop.ymd === ymdOrigem &&
      drop.horaInicio === horaOrigem
    ) {
      return;
    }

    this.abrirModalRemarcar({
      bloco,
      profOrigemId,
      ymdOrigem,
      profDestinoId: drop.profId,
      ymdDestino: drop.ymd,
      horaInicio: drop.horaInicio,
    });
  }

  private cancelarArrasteCard(): void {
    document.removeEventListener('pointermove', this.onDocPointerMove);
    document.removeEventListener('pointerup', this.onDocPointerUp);
    document.removeEventListener('pointercancel', this.onDocPointerUp);
    document.body.classList.remove('agenda-card-dragging');
    this.cardArrasteBloco = null;
    this.cardArrasteProfId = 0;
    this.cardArrasteYmd = '';
    this.cardArrasteAtivo = false;
    this.cardArrastePointerId = null;
    this.cardArrasteCaptureEl = null;
    this.cardArrasteDropPreview = null;
  }

  /** Encaixa o ghost nas faixas de 30 min / coluna sob o ponteiro. */
  private atualizarGhostArrasteSnap(clientX: number, clientY: number): void {
    const bloco = this.cardArrasteBloco;
    if (!bloco) return;

    const col = this.encontrarColunaGrelha(clientX, clientY);
    if (!col) {
      /* Fora da grelha: mantém o último encaixe; se ainda não houve, segue o ponteiro. */
      if (!this.cardArrasteDropPreview) {
        this.cardArrasteGhostTop = clientY - this.cardArrasteOffsetY;
        this.cardArrasteGhostLeft = clientX - this.cardArrasteOffsetX;
      }
      return;
    }

    const rect = col.getBoundingClientRect();
    if (rect.height <= 0) return;

    const profId = Number(col.dataset['profId']);
    const ymd = String(col.dataset['ymd'] ?? '').trim().slice(0, 10);
    if (!Number.isFinite(profId) || profId <= 0) return;
    if (!/^\d{4}-\d{2}-\d{2}$/.test(ymd)) return;

    /* Topo do cartão (preserva o ponto de agarre), depois arredonda à faixa. */
    const topoDesejadoY = clientY - this.cardArrasteOffsetY;
    const pct = (topoDesejadoY - rect.top) / rect.height;
    let mins = GRID_START_MIN + pct * GRID_RANGE;
    mins = Math.round(mins / AGENDA_SLOT_MIN) * AGENDA_SLOT_MIN;
    mins = Math.max(
      GRID_START_MIN,
      Math.min(GRID_LAST_SLOT_START_MIN, mins),
    );

    const topPct = ((mins - GRID_START_MIN) / GRID_RANGE) * 100;
    const padX = 2;

    /* Só encaixa posição; largura/altura ficam as do cartão original (texto não reflow). */
    this.cardArrasteGhostTop = rect.top + (topPct / 100) * rect.height;
    this.cardArrasteGhostLeft = rect.left + padX;

    const hh = Math.floor(mins / 60);
    const mm = mins % 60;
    const horaInicio = `${String(hh).padStart(2, '0')}:${String(mm).padStart(2, '0')}`;
    this.cardArrasteDropPreview = { profId, ymd, horaInicio };
  }

  private encontrarColunaGrelha(
    clientX: number,
    clientY: number,
  ): HTMLElement | null {
    const el = document.elementFromPoint(clientX, clientY);
    if (!el) return null;
    return el.closest('.day-col') as HTMLElement | null;
  }

  private resolverDropNaGrelha(
    clientX: number,
    clientY: number,
  ): { profId: number; ymd: string; horaInicio: string } | null {
    const col = this.encontrarColunaGrelha(clientX, clientY);
    if (!col) return null;

    const profId = Number(col.dataset['profId']);
    const ymd = String(col.dataset['ymd'] ?? '').trim().slice(0, 10);
    if (!Number.isFinite(profId) || profId <= 0) return null;
    if (!/^\d{4}-\d{2}-\d{2}$/.test(ymd)) return null;

    const rect = col.getBoundingClientRect();
    if (rect.height <= 0) return null;
    const pct = (clientY - rect.top) / rect.height;
    let mins = GRID_START_MIN + pct * GRID_RANGE;
    mins = Math.round(mins / AGENDA_SLOT_MIN) * AGENDA_SLOT_MIN;
    mins = Math.max(
      GRID_START_MIN,
      Math.min(GRID_LAST_SLOT_START_MIN, mins),
    );
    const hh = Math.floor(mins / 60);
    const mm = mins % 60;
    const horaInicio = `${String(hh).padStart(2, '0')}:${String(mm).padStart(2, '0')}`;
    return { profId, ymd, horaInicio };
  }

  private abrirModalRemarcar(ctx: {
    bloco: AgendaHubBloco;
    profOrigemId: number;
    ymdOrigem: string;
    profDestinoId: number;
    ymdDestino: string;
    horaInicio: string;
  }): void {
    this.remarcarErro = '';
    this.remarcarSalvando = false;
    this.remarcarCtx = ctx;
    this.remarcarModalAberto = true;
  }

  fecharModalRemarcar(): void {
    if (this.remarcarSalvando) return;
    this.remarcarModalAberto = false;
    this.remarcarCtx = null;
    this.remarcarErro = '';
  }

  confirmarRemarcarAgendamento(): void {
    const ctx = this.remarcarCtx;
    if (!ctx || this.remarcarSalvando) return;
    const idAt = this.idAtendimentoBloco(ctx.bloco);
    if (!idAt) return;

    this.remarcarSalvando = true;
    this.remarcarErro = '';
    this.api
      .remarcarAgendamento({
        id_atendimento: idAt,
        profissional_origem_id: ctx.profOrigemId,
        profissional_destino_id: ctx.profDestinoId,
        data: ctx.ymdDestino,
        hora_inicio: ctx.horaInicio,
      })
      .subscribe({
        next: () => {
          this.remarcarSalvando = false;
          this.remarcarModalAberto = false;
          this.remarcarCtx = null;
          this.recarregarVistaAtiva();
        },
        error: (e: Error) => {
          this.remarcarSalvando = false;
          this.remarcarErro =
            e.message ||
            'Não foi possível atualizar o agendamento. Tente novamente.';
        },
      });
  }

  nomeProfissionalHub(id: number): string {
    const pid = Number(id);
    if (!Number.isFinite(pid) || pid <= 0) return '—';
    return (
      this.profissionais.find((p) => p.id === pid)?.nome?.trim() || '—'
    );
  }

  formatarDataHoraRemarcar(ymd: string, hora: string): string {
    const d = ymd.trim().slice(0, 10);
    if (!/^\d{4}-\d{2}-\d{2}$/.test(d)) return hora;
    const [y, m, day] = d.split('-');
    return `${day}/${m}/${y}, ${hora}h`;
  }

  /** Abre o drawer em modo edição (sem saltar para a receção). */
  abrirDrawerEdicaoBloco(
    b: AgendaHubBloco,
    e: Event,
    opts?: { keepHoverTip?: boolean },
  ): void {
    if (!opts?.keepHoverTip) {
      this.fecharCardHoverTip();
      this.cardHoverSuppressed = true;
    } else {
      this.cardHoverTipSticky = true;
      this.clearCardHoverHideTimer();
      this.clearCardHoverShowTimer();
    }
    if (this.cardArrasteSuprimirClick) {
      this.cardArrasteSuprimirClick = false;
      e.stopPropagation();
      e.preventDefault();
      return;
    }
    e.stopPropagation();
    const id = this.idAtendimentoBloco(b);
    if (!id) return;
    if (this.blocoComandaFaturada(b)) {
      this.abrirComandaVisualizandoBloco(b);
      return;
    }
    const l0 = b.linhas[0];
    const profCol = Number(l0?.profissional_id ?? 0);
    const profId =
      profCol > 0
        ? profCol
        : this.profissionaisVisiveis()[0]?.id ??
          this.profissionais[0]?.id ??
          0;
    const dataBloco =
      (b.linhas[0]?.data || '').trim().slice(0, 10) || this.diaYmd;
    const hora = this.horaBloco(b, dataBloco);
    this.modalContexto = {
      data: dataBloco,
      profissional_id: profId,
      hora: hora || undefined,
      id_atendimento: id,
    };
    this.modalAberto = true;
    this.iniciarAberturaDrawer();
  }

  /** Tip: «Serviço» → drawer «Editando serviço»; tip fica preso até re-hover no cartão. */
  onTipServicoClick(ev: MouseEvent): void {
    ev.preventDefault();
    ev.stopPropagation();
    this.fecharTipStatusMenu(true);
    this.fecharTipCorMenu(true);
    const tip = this.cardHoverTip;
    if (!tip?.bloco) return;
    this.cardHoverTipSticky = true;
    this.clearCardHoverHideTimer();
    this.clearCardHoverShowTimer();
    const btn = ev.currentTarget;
    if (btn instanceof HTMLElement) btn.blur();
    this.abrirDrawerEdicaoServicoDoBloco(tip.bloco, tip.servico);
  }

  /** Resolve o serviço do cartão e abre o drawer de cadastro/edição. */
  private abrirDrawerEdicaoServicoDoBloco(
    bloco: AgendaHubBloco,
    nomeExibido: string,
  ): void {
    const ids: number[] = [];
    for (const l of bloco.linhas) {
      const itens = l.itens_catalogo ?? l.itens ?? [];
      for (const it of itens) {
        if (it.tipo !== 'servico') continue;
        const sid = Number(it.servico_id);
        if (!Number.isFinite(sid) || sid <= 0) continue;
        if (!ids.includes(sid)) ids.push(sid);
      }
    }
    const nomeAlvo = (nomeExibido || '').trim().toLowerCase();

    this.api.listServicos().pipe(take(1)).subscribe({
      next: (lista) => {
        const porNome = (s: Servico): boolean =>
          lerServicoTexto(s, 'nome', 'Nome').trim().toLowerCase() === nomeAlvo;

        let found: Servico | undefined;
        if (ids.length && nomeAlvo) {
          found = lista.find(
            (s) => ids.includes(Number(s.id)) && porNome(s),
          );
        }
        if (!found && ids.length) {
          found = lista.find((s) => ids.includes(Number(s.id)));
        }
        if (!found && nomeAlvo) {
          found = lista.find(porNome);
        }
        if (!found) {
          const ref = (
            bloco.linhas[0]?.servicosRef ||
            bloco.linhas[0]?.descricao ||
            ''
          )
            .trim()
            .toLowerCase();
          if (ref) {
            found = lista.find(
              (s) =>
                lerServicoTexto(s, 'nome', 'Nome').trim().toLowerCase() === ref,
            );
          }
        }
        if (!found) {
          this.toast.showWarning(
            'Não foi possível abrir o serviço deste agendamento.',
          );
          return;
        }
        this.servicoDrawer.abrirEdicao(found);
      },
      error: () => {
        this.toast.showWarning('Não foi possível carregar o serviço.');
      },
    });
  }

  /** Tip: «Ver Comanda #N» → drawer da comanda; tip fica preso até re-hover no cartão. */
  onTipComandaClick(ev: MouseEvent): void {
    ev.preventDefault();
    ev.stopPropagation();
    this.fecharTipStatusMenu(true);
    this.fecharTipCorMenu(true);
    const tip = this.cardHoverTip;
    if (!tip?.bloco) return;
    this.cardHoverTipSticky = true;
    this.clearCardHoverHideTimer();
    this.clearCardHoverShowTimer();
    const btn = ev.currentTarget;
    if (btn instanceof HTMLElement) btn.blur();
    this.abrirComandaVisualizandoBloco(tip.bloco);
  }

  /** Tip: «Excluir» → modal Atenção (mesmo padrão do drawer de agendamento). */
  onTipExcluirClick(ev: MouseEvent): void {
    ev.preventDefault();
    ev.stopPropagation();
    this.fecharTipStatusMenu(true);
    this.fecharTipCorMenu(true);
    const tip = this.cardHoverTip;
    if (!tip?.bloco) return;
    const id = this.idAtendimentoBloco(tip.bloco);
    if (!id || this.excluirTipSalvando) return;
    this.excluirTipErro = '';
    this.excluirTipId = id;
    this.excluirTipModalAberto = true;
    this.fecharCardHoverTip();
  }

  fecharModalExcluirTip(): void {
    if (this.excluirTipSalvando) return;
    this.excluirTipModalAberto = false;
    this.excluirTipId = null;
    this.excluirTipErro = '';
  }

  confirmarExcluirTip(): void {
    const id = this.excluirTipId?.trim();
    if (!id || this.excluirTipSalvando) return;
    this.excluirTipSalvando = true;
    this.excluirTipErro = '';
    this.api.excluirAtendimento(id).subscribe({
      next: () => {
        this.excluirTipSalvando = false;
        this.excluirTipModalAberto = false;
        this.excluirTipId = null;
        this.recarregarVistaAtiva();
      },
      error: (e: Error) => {
        this.excluirTipSalvando = false;
        this.excluirTipErro =
          e.message ||
          'Não foi possível excluir. Verifique a internet e tente de novo.';
      },
    });
  }

  /** Tira o focus do tip (ex.: ao fechar a comanda) para não ficar outline no botão. */
  private blurFocoNoCardTip(): void {
    const ae = document.activeElement;
    if (!(ae instanceof HTMLElement)) return;
    if (ae.closest('.hub-card-tip')) ae.blur();
  }

  private static readonly TIP_FLYOUT_OPEN_DELAY_MS = 220;
  private static readonly TIP_FLYOUT_CLOSE_DELAY_MS = 180;

  onTipStatusEnter(): void {
    if (this.tipStatusSalvando) return;
    if (!CARD_HOVER_TIP_PIN_DEBUG) this.fecharTipCorMenu(true);
    this.clearTipStatusMenuCloseTimer();
    this.clearTipStatusMenuOpenTimer();
    this.cardHoverTipSticky = true;
    this.clearCardHoverHideTimer();
    if (this.tipStatusMenuOpen) return;
    if (CARD_HOVER_TIP_PIN_DEBUG) {
      this.tipStatusMenuOpen = true;
      return;
    }
    this.tipStatusMenuOpenTimer = setTimeout(() => {
      this.tipStatusMenuOpenTimer = null;
      this.tipStatusMenuOpen = true;
    }, AgendaHubComponent.TIP_FLYOUT_OPEN_DELAY_MS);
  }

  onTipStatusLeave(): void {
    if (CARD_HOVER_TIP_PIN_DEBUG) return;
    this.clearTipStatusMenuOpenTimer();
    this.clearTipStatusMenuCloseTimer();
    this.tipStatusMenuCloseTimer = setTimeout(() => {
      this.tipStatusMenuCloseTimer = null;
      this.tipStatusMenuOpen = false;
    }, AgendaHubComponent.TIP_FLYOUT_CLOSE_DELAY_MS);
  }

  private clearTipStatusMenuCloseTimer(): void {
    if (this.tipStatusMenuCloseTimer != null) {
      clearTimeout(this.tipStatusMenuCloseTimer);
      this.tipStatusMenuCloseTimer = null;
    }
  }

  private clearTipStatusMenuOpenTimer(): void {
    if (this.tipStatusMenuOpenTimer != null) {
      clearTimeout(this.tipStatusMenuOpenTimer);
      this.tipStatusMenuOpenTimer = null;
    }
  }

  private fecharTipStatusMenu(_imediato = false): void {
    this.clearTipStatusMenuCloseTimer();
    this.clearTipStatusMenuOpenTimer();
    this.tipStatusMenuOpen = false;
  }

  onTipStatusEscolher(
    status: (typeof AGENDA_STATUS_META)[number],
    ev: MouseEvent,
  ): void {
    ev.preventDefault();
    ev.stopPropagation();
    const tip = this.cardHoverTip;
    const id = tip ? this.idAtendimentoBloco(tip.bloco) : '';
    if (!tip || !id || this.tipStatusSalvando) return;
    if (normalizarAgendaStatusId(tip.bloco.linhas[0]?.agenda_status) === status.id) {
      if (!CARD_HOVER_TIP_PIN_DEBUG) this.fecharTipStatusMenu(true);
      return;
    }
    this.tipStatusSalvando = true;
    this.cardHoverTipSticky = true;
    this.clearCardHoverHideTimer();
    // Optimistic: tip + grelha já refletem a escolha.
    this.aplicarAgendaStatusNasLinhasLocais(id, status.id);
    tip.statusLabel = status.label;
    tip.statusCor = status.cor;
    tip.corLabel = 'Sem cor';
    tip.corHex = '';
    this.api.atualizarAgendaStatus(id, status.id).subscribe({
      next: () => {
        this.tipStatusSalvando = false;
        if (!CARD_HOVER_TIP_PIN_DEBUG) this.fecharTipStatusMenu(true);
        this.toast.show('Agendamento atualizado com sucesso!');
        this.recarregarVistaAtiva();
      },
      error: (e: Error) => {
        this.tipStatusSalvando = false;
        if (!CARD_HOVER_TIP_PIN_DEBUG) this.fecharTipStatusMenu(true);
        this.toast.showWarning(
          this.mensagemErroAgendaTip(e, 'status'),
        );
      },
    });
  }

  onTipCorEnter(): void {
    if (this.tipCorSalvando) return;
    if (!CARD_HOVER_TIP_PIN_DEBUG) this.fecharTipStatusMenu(true);
    this.clearTipCorMenuCloseTimer();
    this.clearTipCorMenuOpenTimer();
    this.cardHoverTipSticky = true;
    this.clearCardHoverHideTimer();
    if (this.tipCorMenuOpen) return;
    if (CARD_HOVER_TIP_PIN_DEBUG) {
      this.tipCorMenuOpen = true;
      return;
    }
    this.tipCorMenuOpenTimer = setTimeout(() => {
      this.tipCorMenuOpenTimer = null;
      this.tipCorMenuOpen = true;
    }, AgendaHubComponent.TIP_FLYOUT_OPEN_DELAY_MS);
  }

  onTipCorLeave(): void {
    if (CARD_HOVER_TIP_PIN_DEBUG) return;
    this.clearTipCorMenuOpenTimer();
    this.clearTipCorMenuCloseTimer();
    this.tipCorMenuCloseTimer = setTimeout(() => {
      this.tipCorMenuCloseTimer = null;
      this.tipCorMenuOpen = false;
    }, AgendaHubComponent.TIP_FLYOUT_CLOSE_DELAY_MS);
  }

  private clearTipCorMenuCloseTimer(): void {
    if (this.tipCorMenuCloseTimer != null) {
      clearTimeout(this.tipCorMenuCloseTimer);
      this.tipCorMenuCloseTimer = null;
    }
  }

  private clearTipCorMenuOpenTimer(): void {
    if (this.tipCorMenuOpenTimer != null) {
      clearTimeout(this.tipCorMenuOpenTimer);
      this.tipCorMenuOpenTimer = null;
    }
  }

  private fecharTipCorMenu(_imediato = false): void {
    this.clearTipCorMenuCloseTimer();
    this.clearTipCorMenuOpenTimer();
    this.tipCorMenuOpen = false;
  }

  onTipCorEscolher(opcao: AgendaCorOpcao, ev: MouseEvent): void {
    ev.preventDefault();
    ev.stopPropagation();
    const tip = this.cardHoverTip;
    const id = tip ? this.idAtendimentoBloco(tip.bloco) : '';
    if (!tip || !id || this.tipCorSalvando) return;
    const hex = (opcao.cor || '').trim() || null;
    const atualHex = String(tip.bloco.linhas[0]?.agenda_cor ?? '').trim() || null;
    if ((hex || null) === (atualHex || null)) {
      if (!CARD_HOVER_TIP_PIN_DEBUG) this.fecharTipCorMenu(true);
      return;
    }
    this.tipCorSalvando = true;
    this.cardHoverTipSticky = true;
    this.clearCardHoverHideTimer();
    this.aplicarAgendaCorNasLinhasLocais(id, hex);
    tip.corLabel = opcao.label;
    tip.corHex = hex || '';
    this.api.atualizarAgendaCor(id, hex).subscribe({
      next: () => {
        this.tipCorSalvando = false;
        if (!CARD_HOVER_TIP_PIN_DEBUG) this.fecharTipCorMenu(true);
        this.toast.show('Agendamento atualizado com sucesso!');
        this.recarregarVistaAtiva();
      },
      error: (e: Error) => {
        this.tipCorSalvando = false;
        if (!CARD_HOVER_TIP_PIN_DEBUG) this.fecharTipCorMenu(true);
        this.toast.showWarning(this.mensagemErroAgendaTip(e, 'cor'));
      },
    });
  }

  onTipCorRemover(ev: MouseEvent): void {
    ev.preventDefault();
    ev.stopPropagation();
    const tip = this.cardHoverTip;
    const id = tip ? this.idAtendimentoBloco(tip.bloco) : '';
    if (!tip || !id || this.tipCorSalvando) return;
    const atualHex = String(tip.bloco.linhas[0]?.agenda_cor ?? '').trim();
    if (!atualHex) {
      if (!CARD_HOVER_TIP_PIN_DEBUG) this.fecharTipCorMenu(true);
      return;
    }
    this.tipCorSalvando = true;
    this.cardHoverTipSticky = true;
    this.clearCardHoverHideTimer();
    this.aplicarAgendaCorNasLinhasLocais(id, null);
    tip.corLabel = 'Sem cor';
    tip.corHex = '';
    this.api.atualizarAgendaCor(id, null).subscribe({
      next: () => {
        this.tipCorSalvando = false;
        if (!CARD_HOVER_TIP_PIN_DEBUG) this.fecharTipCorMenu(true);
        this.toast.show('Agendamento atualizado com sucesso!');
        this.recarregarVistaAtiva();
      },
      error: (e: Error) => {
        this.tipCorSalvando = false;
        if (!CARD_HOVER_TIP_PIN_DEBUG) this.fecharTipCorMenu(true);
        this.toast.showWarning(this.mensagemErroAgendaTip(e, 'cor'));
      },
    });
  }

  private mensagemErroAgendaTip(
    e: Error,
    campo: 'status' | 'cor',
  ): string {
    const msg = String(e?.message ?? '').trim();
    if (/tipo é obrigatório/i.test(msg)) {
      return 'Não foi possível atualizar. Reinicie a API e tente de novo.';
    }
    return (
      msg ||
      (campo === 'status'
        ? 'Não foi possível atualizar o status.'
        : 'Não foi possível atualizar a cor.')
    );
  }

  /** Atualiza `agenda_cor` nas listagens da grelha (fundo do cartão) e no tip. */
  private aplicarAgendaCorNasLinhasLocais(
    idAtendimento: string,
    hex: string | null,
  ): void {
    const id = idAtendimento.trim();
    if (!id) return;
    const patch = (items: AtendimentoListaItem[]) => {
      for (const it of items) {
        if (String(it.id ?? '').trim() === id) {
          it.agenda_cor = hex;
        }
      }
    };
    patch(this.linhasDia);
    patch(this.linhasSemana);
    patch(this.itensMes);
    const tip = this.cardHoverTip;
    if (tip && this.idAtendimentoBloco(tip.bloco) === id) {
      for (const l of tip.bloco.linhas) {
        l.agenda_cor = hex;
      }
    }
  }

  /** Atualiza `agenda_status` e limpa cor nomeada nas listagens + tip. */
  private aplicarAgendaStatusNasLinhasLocais(
    idAtendimento: string,
    statusId: string,
  ): void {
    const id = idAtendimento.trim();
    if (!id) return;
    const patch = (items: AtendimentoListaItem[]) => {
      for (const it of items) {
        if (String(it.id ?? '').trim() === id) {
          it.agenda_status = statusId;
          it.agenda_cor = null;
        }
      }
    };
    patch(this.linhasDia);
    patch(this.linhasSemana);
    patch(this.itensMes);
    const tip = this.cardHoverTip;
    if (tip && this.idAtendimentoBloco(tip.bloco) === id) {
      for (const l of tip.bloco.linhas) {
        l.agenda_status = statusId;
        l.agenda_cor = null;
      }
    }
  }

  /** Salta para outro dia/pedido mantendo o drawer (próximos agendamentos). */
  onNavegarAgendamentoDrawer(ev: { data: string; id_atendimento: string }): void {
    const ymd = String(ev.data || '').trim().slice(0, 10);
    const idAt = String(ev.id_atendimento || '').trim();
    if (!/^\d{4}-\d{2}-\d{2}$/.test(ymd) || !idAt) return;
    this.diaYmd = ymd;
    const ref = new Date(
      parseInt(ymd.slice(0, 4), 10),
      parseInt(ymd.slice(5, 7), 10) - 1,
      parseInt(ymd.slice(8, 10), 10),
    );
    this.mesRef = this.inicioDoMes(ref);
    this.recarregarVistaAtiva();
    const prev = this.modalContexto;
    this.modalContexto = {
      data: ymd,
      profissional_id: prev?.profissional_id ?? 0,
      hora: prev?.hora,
      id_atendimento: idAt,
    };
  }

  /**
   * Bloqueia scroll da página, regista ESC e dispara a animação de entrada
   * no próximo ciclo para o browser aplicar o estado inicial primeiro.
   */
  private iniciarAberturaDrawer(): void {
    this.bloquearScrollPagina();
    this.drawerOpenAnim?.cancel();
    this.drawerOpenAnim = runDrawerOpenAnimation({
      setPanelOpen: (open) => {
        this.drawerPanelOpen = open;
      },
      appRef: this.appRef,
      reflowSelector: '.hub-page .app-drawer, app-agenda-hub .app-drawer',
    });
  }

  private limparEfeitosDrawer(): void {
    this.desbloquearScrollPagina();
    this.blurFocoNoCardGrelha();
  }

  /** Evita outline/focus no cartão após fechar o drawer. */
  private blurFocoNoCardGrelha(): void {
    const ae = document.activeElement;
    if (!(ae instanceof HTMLElement)) return;
    if (ae.classList.contains('day-col__card') || ae.closest('.day-col__card')) {
      ae.blur();
    }
  }

  /**
   * Evita o “salto” do layout ao abrir o drawer: `overflow: hidden` remove a
   * scrollbar e a viewport ganha largura, deslocando o conteúdo de trás.
   * Aqui o scroll é congelado com `position: fixed` + `scrollY` salvo, e
   * compensa-se a largura do scrollbar (quando existir).
   */
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

  /** Abre o drawer da comanda em modo «Visualizando» (campos só leitura + Ver pagamentos). */
  private abrirComandaVisualizandoBloco(b: AgendaHubBloco): void {
    const id = this.idAtendimentoBloco(b);
    if (!id) return;
    const l0 = b.linhas[0];
    const dataYmd = String(l0?.data ?? this.diaYmd).trim().slice(0, 10);
    const clienteId = String(l0?.idCliente ?? '').trim();
    const numero =
      l0?.numeroComanda != null && l0.numeroComanda > 0
        ? l0.numeroComanda
        : 0;
    this.abrirComandaDesdeAgenda(
      {
        acessar: true,
        idAtendimento: id,
        numeroComandaTitulo: numero,
        clienteId,
        cliente: null,
        opcoesClientes: [],
        dataYmd: /^\d{4}-\d{2}-\d{2}$/.test(dataYmd) ? dataYmd : this.diaYmd,
      },
      { standalone: true },
    );
  }

  /** Abre o drawer «Nova comanda» (mesma largura/animação do agendamento). */
  abrirComandaDesdeAgenda(
    payload: ComandaDrawerContextoAgenda,
    opts?: { standalone?: boolean },
  ): void {
    const standalone = opts?.standalone === true;
    if (!standalone && !this.modalAberto) return;
    /** Evita ver o modal de conflito «atrás» da comanda. */
    this.agendaDrawerRef?.fecharAvisoConflitoHorario();
    this.comandaSomenteStandalone = standalone;
    if (standalone) {
      this.bloquearScrollPagina();
    }
    this.comandaDrawerContexto = payload;
    const y = (payload.dataYmd ?? '').trim();
    this.comandaDataYmdParaFaturar =
      /^\d{4}-\d{2}-\d{2}$/.test(y) ? y : null;
    this.comandaPainelAberto = true;
    this.comandaDrawerSettled = false;
    this.comandaDrawerPanelOpen = false;
    queueMicrotask(() => {
      requestAnimationFrame(() => {
        requestAnimationFrame(() => {
          this.comandaDrawerPanelOpen = true;
          this.agendarComandaDrawerSettled();
        });
      });
    });
  }

  /** Marca o painel da comanda como “assentado” após a slide-in. */
  private agendarComandaDrawerSettled(): void {
    if (this.comandaDrawerSettleTimer != null) {
      clearTimeout(this.comandaDrawerSettleTimer);
    }
    this.comandaDrawerSettleTimer = setTimeout(() => {
      this.comandaDrawerSettleTimer = null;
      if (this.comandaPainelAberto && this.comandaDrawerPanelOpen) {
        this.comandaDrawerSettled = true;
      }
    }, DRAWER_ANIM_MS);
  }

  private cancelarComandaDrawerSettled(): void {
    if (this.comandaDrawerSettleTimer != null) {
      clearTimeout(this.comandaDrawerSettleTimer);
      this.comandaDrawerSettleTimer = null;
    }
    this.comandaDrawerSettled = false;
  }

  /** Tira o foco do sub-drawer para não deslocar o scroll da comanda ao fechar. */
  private blurFocoAtivoNoDrawer(): void {
    if (typeof document === 'undefined') return;
    const ae = document.activeElement;
    if (ae instanceof HTMLElement && ae !== document.body) {
      ae.blur();
    }
  }

  fecharComandaDrawer(): void {
    if (!this.comandaPainelAberto) return;
    this.blurFocoNoCardTip();
    this.limparEditComandaSemAnimacao();
    /**
     * O Salvar da comanda (ou testes de desconto) não deve deixar o modal de
     * «Conflito de horários» pendente no drawer de agendamento por baixo.
     */
    this.agendaDrawerRef?.fecharAvisoConflitoHorario();
    if (!this.comandaDrawerPanelOpen) {
      this.cancelarComandaDrawerSettled();
      this.comandaPainelAberto = false;
      this.comandaDrawerContexto = null;
      this.comandaDataYmdParaFaturar = null;
      if (this.comandaSomenteStandalone) {
        this.comandaSomenteStandalone = false;
        if (!this.modalAberto) {
          this.limparEfeitosDrawer();
        }
      }
      return;
    }
    /** Reativa transition para a slide-out. */
    this.cancelarComandaDrawerSettled();
    this.comandaDrawerPanelOpen = false;
    if (this.comandaDrawerCloseTimer != null) {
      clearTimeout(this.comandaDrawerCloseTimer);
    }
    this.comandaDrawerCloseTimer = setTimeout(() => {
      this.comandaDrawerCloseTimer = null;
      this.comandaPainelAberto = false;
      this.comandaDrawerContexto = null;
      this.comandaDataYmdParaFaturar = null;
      this.blurFocoNoCardTip();
      if (this.comandaSomenteStandalone) {
        this.comandaSomenteStandalone = false;
        if (!this.modalAberto) {
          this.limparEfeitosDrawer();
        }
      }
    }, DRAWER_ANIM_MS);
  }

  private limparComandaDrawerSemAnimacao(): void {
    this.limparEditComandaSemAnimacao();
    this.cancelarComandaDrawerSettled();
    this.comandaPainelAberto = false;
    this.comandaDrawerPanelOpen = false;
    this.comandaDrawerContexto = null;
    this.comandaDataYmdParaFaturar = null;
    this.blurFocoNoCardTip();
    if (this.comandaSomenteStandalone) {
      this.comandaSomenteStandalone = false;
      if (!this.modalAberto) {
        this.limparEfeitosDrawer();
      }
    }
    if (this.comandaDrawerCloseTimer != null) {
      clearTimeout(this.comandaDrawerCloseTimer);
      this.comandaDrawerCloseTimer = null;
    }
  }

  fecharModal(): void {
    if (!this.modalAberto || !this.modalContexto) {
      this.limparEfeitosDrawer();
      return;
    }
    if (!this.drawerPanelOpen) {
      this.limparComandaDrawerSemAnimacao();
      this.modalAberto = false;
      this.modalContexto = null;
      this.limparEfeitosDrawer();
      return;
    }
    this.drawerOpenAnim?.cancel();
    this.drawerOpenAnim = null;
    beginDrawerCloseAnimation({
      setPanelOpen: (open) => {
        this.drawerPanelOpen = open;
      },
      appRef: this.appRef,
    });
    this.limparComandaDrawerSemAnimacao();
    if (this.drawerCloseTimer != null) {
      clearTimeout(this.drawerCloseTimer);
    }
    this.drawerCloseTimer = setTimeout(() => {
      this.drawerCloseTimer = null;
      this.modalAberto = false;
      this.modalContexto = null;
      this.desbloquearScrollPagina();
      this.blurFocoNoCardGrelha();
    }, DRAWER_ANIM_MS);
  }

  onSalvoModal(): void {
    this.fecharModal();
    this.recarregarVistaAtiva();
  }

  /** Comanda excluída na API: fecha só o painel e atualiza grelha / mês. */
  onComandaExcluida(): void {
    this.fecharComandaDrawer();
    this.recarregarVistaAtiva();
  }

  /**
   * Botão Editar no drawer da comanda: abre «Editando itens da comanda»
   * (`fluxoSomenteComanda`), não o drawer de agendamento do calendário.
   */
  onEditarAgendamentoDesdeComanda(): void {
    const ctx = this.comandaDrawerContexto;
    const idAt = ctx?.idAtendimento?.trim();
    const ymd = (ctx?.dataYmd ?? '').trim();
    if (!idAt || !/^\d{4}-\d{2}-\d{2}$/.test(ymd)) return;
    this.abrirDrawerEditComanda(idAt, ymd);
  }

  private abrirDrawerEditComanda(idAt: string, ymd: string): void {
    this.editComandaCtx = {
      data: ymd,
      profissional_id: 0,
      id_atendimento: idAt,
    };
    this.editComandaAberto = true;
    this.editComandaPanelOpen = false;
    queueMicrotask(() => {
      requestAnimationFrame(() => {
        requestAnimationFrame(() => {
          this.editComandaPanelOpen = true;
        });
      });
    });
  }

  fecharEditComanda(): void {
    if (!this.editComandaAberto) return;
    this.blurFocoAtivoNoDrawer();
    this.editComandaPanelOpen = false;
    if (this.editComandaCloseTimer != null) {
      clearTimeout(this.editComandaCloseTimer);
    }
    this.editComandaCloseTimer = setTimeout(() => {
      this.editComandaCloseTimer = null;
      this.editComandaAberto = false;
      this.editComandaCtx = null;
    }, DRAWER_ANIM_MS);
  }

  private limparEditComandaSemAnimacao(): void {
    this.editComandaAberto = false;
    this.editComandaPanelOpen = false;
    this.editComandaCtx = null;
    if (this.editComandaCloseTimer != null) {
      clearTimeout(this.editComandaCloseTimer);
      this.editComandaCloseTimer = null;
    }
  }

  /**
   * Após salvar itens: fecha o editor e mantém/atualiza o drawer «Visualizando comanda».
   */
  onSalvoEditComanda(): void {
    const idAt =
      this.editComandaCtx?.id_atendimento?.trim() ??
      this.comandaDrawerContexto?.idAtendimento?.trim() ??
      '';
    const ymdEdit = (this.editComandaCtx?.data ?? '').trim();
    const comandaJaAberta =
      this.comandaPainelAberto && this.comandaDrawerContexto != null;

    if (
      comandaJaAberta &&
      /^\d{4}-\d{2}-\d{2}$/.test(ymdEdit) &&
      this.comandaDrawerContexto &&
      this.comandaDrawerContexto.dataYmd !== ymdEdit
    ) {
      this.comandaDrawerContexto = {
        ...this.comandaDrawerContexto,
        dataYmd: ymdEdit,
      };
      this.comandaDataYmdParaFaturar = ymdEdit;
    }

    this.fecharEditComanda();
    /**
     * O agendamento por baixo ainda tinha as linhas antigas; se o Salvar da
     * comanda voltasse a chamar `agendaDrawerRef.salvar()`, apagava a edição.
     */
    if (idAt) {
      this.agendaDrawerRef?.recarregarEdicaoDoServidor(idAt);
    }
    this.recarregarVistaAtiva();

    if (!idAt || !comandaJaAberta) return;
    setTimeout(() => {
      this.comandaDrawerRef?.recarregarDadosComanda();
    }, 0);
  }

  /**
   * Faturar no editor de itens: fecha a edição e abre o drawer de pagamentos
   * (mesmo fluxo do botão Faturar na comanda), com overlay a escurecer atrás.
   */
  onFaturarDesdeEditComanda(ev: {
    idAtendimento: string;
    dataYmd: string;
    clienteId: string;
    cliente: Cliente | null;
  }): void {
    const id = ev.idAtendimento?.trim();
    if (!id) return;
    this.comandaDataYmdParaFaturar =
      ev.dataYmd || this.comandaDataYmdParaFaturar;
    this.limparEditComandaSemAnimacao();

    if (this.comandaPainelAberto && this.comandaDrawerRef) {
      this.comandaDrawerRef.recarregarDadosComanda();
      queueMicrotask(() => {
        if (this.comandaDrawerRef?.podeFaturar()) {
          this.comandaDrawerRef.abrirFaturar();
          return;
        }
        this.abrirFaturarPorIdAtendimento(id, ev.dataYmd);
      });
      return;
    }
    this.abrirFaturarPorIdAtendimento(id, ev.dataYmd);
  }

  /** Excluir comanda a partir do editor de itens — fecha a pilha como no drawer da comanda. */
  onComandaExcluidaDesdeEdit(): void {
    this.limparEditComandaSemAnimacao();
    this.onComandaExcluida();
  }

  private abrirFaturarPorIdAtendimento(
    idAtendimento: string,
    dataYmd: string | null | undefined,
  ): void {
    const id = idAtendimento.trim();
    if (!id) return;
    this.api
      .listComandaPagamentos(id)
      .pipe(
        take(1),
        catchError(() =>
          of({
            items: [],
            resumo: {
              total_bruto: 0,
              desconto: 0,
              total: 0,
              total_pago: 0,
              saldo: 0,
              status: 'aberto' as const,
              cobranca_status: null,
            },
          }),
        ),
      )
      .subscribe((r) => {
        this.onAbrirFaturarComanda({
          idAtendimento: id,
          resumo: r.resumo,
          dataComandaYmd: dataYmd ?? this.comandaDataYmdParaFaturar,
        });
      });
  }

  /** Gravação: prioriza o editor de itens; senão só fecha a comanda. */
  onSalvarAgendamentoDesdeDrawerComanda(): void {
    if (!this.comandaPainelAberto) return;
    if (this.editComandaAberto && this.editComandaDrawerRef) {
      this.editComandaDrawerRef.salvar();
      return;
    }
    /**
     * Desconto já persistido em `gravarRodape`. Nunca chamar
     * `agendaDrawerRef.salvar()` — isso reabria o modal de conflito de
     * horários no agendamento por baixo e parecia um bug ao sair da comanda.
     */
    this.agendaDrawerRef?.fecharAvisoConflitoHorario();
    this.fecharComandaDrawer();
    this.recarregarVistaAtiva();
  }

  onComandaDataYmdAlterada(ymd: string | null): void {
    this.comandaDataYmdParaFaturar = ymd;
    const ctx = this.comandaDrawerContexto;
    if (!ctx) return;
    const next = (ymd ?? '').trim();
    if (!/^\d{4}-\d{2}-\d{2}$/.test(next) || ctx.dataYmd === next) return;
    this.comandaDrawerContexto = { ...ctx, dataYmd: next };
  }

  /** Abre o drawer de cadastro vazio (botão «Criar cliente» no agendamento). */
  abrirClienteDrawerNovo(): void {
    this.cadastroDrawer.abrirNovo('', {
      onSalvo: (salvo) => {
        this.agendaDrawerRef?.aplicarClienteAposCriacao(salvo);
      },
    });
  }

  /**
   * Links «Informações» da sidebar (cashback, crédito, débitos, aniversário, etc.)
   * no drawer de agendamento ou de comanda.
   */
  onAbrirCadastroClienteSidebarHub(
    payload: AbrirCadastroClientePayload = {},
  ): void {
    const alvo = this.clienteAlvoSidebarCadastroHub();
    if (!alvo) return;
    const { cid, nomeLista } = alvo;

    this.cadastroDrawer.abrirEdicaoPorLinkSidebar(cid, payload, {
      nomeLista,
      callbacks: {
        onClienteCarregado: (c) => {
          const ctxId = this.comandaDrawerContexto?.clienteId?.trim();
          if (
            ctxId === cid &&
            this.comandaDrawerContexto != null &&
            this.comandaDrawerContexto.clienteId === cid
          ) {
            this.comandaDrawerContexto = {
              ...this.comandaDrawerContexto,
              cliente: c,
            };
          }
        },
        onSalvo: (salvo) => {
          const cidSalvo = (salvo.id ?? cid).trim();
          if (
            cidSalvo &&
            this.comandaDrawerContexto?.clienteId?.trim() === cidSalvo
          ) {
            this.comandaDrawerContexto = {
              ...this.comandaDrawerContexto,
              cliente: salvo,
            };
          }
          if (cidSalvo) {
            this.comandaDrawerRef?.recarregarClienteAposSalvarFicha(cidSalvo);
          }
        },
      },
    });
  }

  private clienteAlvoSidebarCadastroHub(): {
    cid: string;
    nomeLista: string;
  } | null {
    const ctx = this.comandaDrawerContexto;
    const cidCtx = ctx?.clienteId?.trim();
    if (cidCtx) {
      return {
        cid: cidCtx,
        nomeLista: String(ctx?.cliente?.nome ?? '').trim(),
      };
    }
    const c = this.agendaDrawerRef?.clienteSelecionado();
    const cidAg = c?.id?.trim();
    if (cidAg) {
      return { cid: cidAg, nomeLista: String(c?.nome ?? '').trim() };
    }
    return null;
  }

  // ----- Sub-drawer Faturar -------------------------------------------------

  onAbrirFaturarComanda(ev: {
    idAtendimento: string;
    resumo: ComandaResumoPagamentos;
    creditoAUsar?: number;
    dataComandaYmd?: string | null;
    modoVerPagamentos?: boolean;
  }): void {
    const nomeCliente =
      this.comandaDrawerContexto?.cliente?.nome?.trim() ?? '';
    this.comandaDataYmdParaFaturar =
      ev.dataComandaYmd ?? this.comandaDataYmdParaFaturar;
    this.faturarCtx = {
      idAtendimento: ev.idAtendimento,
      resumo: ev.resumo,
      creditoAUsar: ev.creditoAUsar,
      nomeCliente,
      modoVerPagamentos: ev.modoVerPagamentos ?? false,
    };
    this.faturarDrawerAberto = true;
    this.faturarDrawerPanelOpen = false;
    queueMicrotask(() => {
      requestAnimationFrame(() => {
        requestAnimationFrame(() => {
          this.faturarDrawerPanelOpen = true;
        });
      });
    });
  }

  fecharFaturarDrawer(opts?: { recarregarComanda?: boolean }): void {
    if (!this.faturarDrawerAberto) return;
    if (this.faturarDrawerRef && !this.faturarDrawerRef.podeFecharDrawer()) {
      return;
    }
    const recarregarComanda = opts?.recarregarComanda !== false;
    this.blurFocoAtivoNoDrawer();
    this.faturarDrawerPanelOpen = false;
    if (this.faturarDrawerCloseTimer != null) {
      clearTimeout(this.faturarDrawerCloseTimer);
    }
    this.faturarDrawerCloseTimer = setTimeout(() => {
      this.faturarDrawerCloseTimer = null;
      this.faturarDrawerAberto = false;
      this.faturarCtx = null;
      if (recarregarComanda) {
        this.comandaDrawerRef?.recarregarAposFaturar();
      }
      this.recarregarVistaAtiva();
      if (this.modalAberto) {
        this.agendaDrawerRef?.atualizarDetecaoComandaAposFaturar();
      }
    }, DRAWER_ANIM_MS);
  }

  /** Após gravar pagamentos: fecha drawers e volta à grelha da agenda. */
  onFaturaComandaSucesso(): void {
    this.fecharFaturarDrawer({ recarregarComanda: false });
    this.limparEditComandaSemAnimacao();
    this.fecharComandaDrawer();
    if (this.modalAberto) {
      this.fecharModal();
    }
  }

  eventosNaColuna(profId: number, ymd?: string): AtendimentoListaItem[] {
    const rows = this.linhasParaGrelha(ymd).filter(
      (a) => Number(a.profissional_id) === profId,
    );
    ordenarLinhasAtendimentoInPlace(rows);
    return rows;
  }

  /** Blocos de um dia na vista mensal (todos os profissionais visíveis). */
  blocosDoDiaMensal(ymd: string): AgendaHubBloco[] {
    const profIds = new Set(this.profissionaisVisiveis().map((p) => p.id));
    const rows = this.itensMes.filter((a) => {
      const d = (a.data || '').trim().slice(0, 10);
      if (d !== ymd) return false;
      const pid = Number(a.profissional_id);
      if (profIds.size && pid && !profIds.has(pid)) return false;
      return true;
    });
    const map = new Map<string, AtendimentoListaItem[]>();
    let legacySeq = 0;
    for (const r of rows) {
      const id = String(r.id || '').trim();
      const pid = Number(r.profissional_id);
      const key = id
        ? `id:${id}:${pid}`
        : `linha:${pid}-${r.linha_id ?? legacySeq++}`;
      if (!map.has(key)) map.set(key, []);
      map.get(key)!.push(r);
    }
    const out: AgendaHubBloco[] = [];
    for (const [trackKey, linhas] of map) {
      ordenarLinhasAtendimentoInPlace(linhas);
      for (const part of particionarLinhasPedidoEmCartoesAgenda(
        linhas,
        ymd,
        trackKey,
      )) {
        out.push({ trackKey: part.trackKey, linhas: part.linhas });
      }
    }
    out.sort((a, b) => {
      const ea = this.extentMinutosBloco(a, ymd);
      const eb = this.extentMinutosBloco(b, ymd);
      return (ea?.start ?? Infinity) - (eb?.start ?? Infinity);
    });
    return out.filter(
      (b) => this.blocoPassaBuscaCliente(b) && this.blocoPassaStatusFiltro(b),
    );
  }

  private linhasParaGrelha(ymd?: string): AtendimentoListaItem[] {
    const dia = (ymd ?? this.diaYmd).trim().slice(0, 10);
    if (this.modoVista === 'semana') {
      return this.linhasSemana.filter(
        (a) => (a.data || '').trim().slice(0, 10) === dia,
      );
    }
    if (this.modoVista === 'mensal') {
      return this.itensMes.filter(
        (a) => (a.data || '').trim().slice(0, 10) === dia,
      );
    }
    return this.linhasDia;
  }

  private recarregarVistaAtiva(): void {
    this.atualizarTituloAba();
    this.carregarMes();
    if (this.modoVista === 'semana') {
      this.carregarSemana();
    } else if (this.modoVista === 'dia') {
      this.carregarDia();
    }
  }

  /**
   * Linhas agrupadas por atendimento (`id`) no mesmo profissional — um bloco visual
   * do início mais cedo ao fim mais tarde (ex.: 3 linhas de 30 min = 1h30 num só cartão).
   * Se o mesmo `id` misturar status ou horários sem continuidade (legado / reuso),
   * parte em cartões distintos.
   */
  blocosNaColuna(profId: number, ymd?: string): AgendaHubBloco[] {
    const rows = this.eventosNaColuna(profId, ymd);
    const dia = (ymd ?? this.diaYmd).trim().slice(0, 10);
    const map = new Map<string, AtendimentoListaItem[]>();
    let legacySeq = 0;
    for (const r of rows) {
      const id = String(r.id || '').trim();
      const key = id
        ? `id:${id}`
        : `linha:${profId}-${r.linha_id ?? legacySeq++}`;
      if (!map.has(key)) map.set(key, []);
      map.get(key)!.push(r);
    }
    const out: AgendaHubBloco[] = [];
    for (const [trackKey, linhas] of map) {
      ordenarLinhasAtendimentoInPlace(linhas);
      for (const part of particionarLinhasPedidoEmCartoesAgenda(
        linhas,
        dia,
        trackKey,
      )) {
        out.push({ trackKey: part.trackKey, linhas: part.linhas });
      }
    }
    out.sort((a, b) => {
      const ea = this.extentMinutosBloco(a);
      const eb = this.extentMinutosBloco(b);
      const sa = ea?.start ?? Infinity;
      const sb = eb?.start ?? Infinity;
      return sa - sb;
    });
    return out.filter(
      (b) => this.blocoPassaBuscaCliente(b) && this.blocoPassaStatusFiltro(b),
    );
  }

  private blocoPassaBuscaCliente(b: AgendaHubBloco): boolean {
    const q = this.buscaCliente.trim().toLowerCase();
    if (!q) return true;
    return this.nomeClienteBloco(b).toLowerCase().includes(q);
  }

  private statusFiltroBloco(b: AgendaHubBloco): HubStatusFiltroId {
    if (this.blocoComandaFaturada(b)) return 'faturado';
    const l0 = b.linhas[0];
    const raw = String(l0?.agenda_status ?? '')
      .trim()
      .toLowerCase()
      .replace(/\s+/g, '_');
    if (raw === 'bloqueado' || raw === 'bloqueio') return 'bloqueado';
    const nome = this.nomeClienteBloco(b).trim().toLowerCase();
    if (!nome || nome === 'bloqueio' || nome === 'bloqueado') {
      return 'bloqueado';
    }
    return normalizarAgendaStatusId(l0?.agenda_status);
  }

  private blocoPassaStatusFiltro(b: AgendaHubBloco): boolean {
    if (this.statusOcultos.size === 0) return true;
    return !this.statusOcultos.has(this.statusFiltroBloco(b));
  }

  private setupLayoutMobile(): void {
    if (typeof window === 'undefined' || !window.matchMedia) return;
    const mq = window.matchMedia(mediaQueryMax('agendaMobile'));
    const apply = (): void => {
      this.layoutMobile = mq.matches;
      if (!mq.matches) {
        this.grelhaScrollXDia = 0;
        this.grelhaScrollXSemana = 0;
      }
      this.agendarAtualizarSemanaHScrollDock();
    };
    apply();
    mq.addEventListener('change', apply);
    this.destroyRef.onDestroy(() => mq.removeEventListener('change', apply));
  }

  private parseYmdLocal(ymd: string): Date {
    const [y, m, d] = ymd.split('-').map(Number);
    return new Date(y!, (m ?? 1) - 1, d ?? 1);
  }

  /**
   * Sobreposição (encaixe) na mesma coluna: o 1.º bloco (lane 0) ocupa 100% da
   * largura; os seguintes ficam por cima, alinhados à direita, mais estreitos.
   */
  blocosLayout(
    profId: number,
    ymd?: string,
  ): Array<{
    bloco: AgendaHubBloco;
    leftPct: number;
    widthPct: number;
    lane: number;
    lanes: number;
    zIndex: number;
  }> {
    const blocos = this.blocosNaColuna(profId, ymd);
    type Ext = { bloco: AgendaHubBloco; start: number; end: number };
    const extents: Ext[] = [];
    for (const b of blocos) {
      const ex = this.extentMinutosBloco(b);
      if (!ex || !(ex.end > ex.start)) continue;
      extents.push({ bloco: b, start: ex.start, end: ex.end });
    }
    if (extents.length === 0) return [];

    extents.sort((a, b) => a.start - b.start || a.end - b.end);

    const laneEnds: number[] = [];
    const laneByBloco = new Map<AgendaHubBloco, number>();

    for (const ev of extents) {
      let lane = -1;
      for (let c = 0; c < laneEnds.length; c++) {
        if (laneEnds[c] <= ev.start) {
          lane = c;
          laneEnds[c] = ev.end;
          break;
        }
      }
      if (lane < 0) {
        lane = laneEnds.length;
        laneEnds.push(ev.end);
      }
      laneByBloco.set(ev.bloco, lane);
    }

    const critPts = new Set<number>();
    for (const e of extents) {
      critPts.add(e.start);
      critPts.add(e.end);
    }
    const critSorted = [...critPts].sort((a, b) => a - b);

    return extents.map((ev) => {
      let maxC = 1;
      for (const t of critSorted) {
        if (t < ev.start || t >= ev.end) continue;
        const cnt = extents.filter((x) => x.start <= t && x.end > t).length;
        if (cnt > maxC) maxC = cnt;
      }
      const lane = laneByBloco.get(ev.bloco) ?? 0;
      if (maxC <= 1) {
        return {
          bloco: ev.bloco,
          leftPct: 0,
          widthPct: 100,
          lane: 0,
          lanes: 1,
          zIndex: 2,
        };
      }
      /** Original: largura total; encaixes: ~62% à direita (cascata se N>2). */
      if (lane === 0) {
        return {
          bloco: ev.bloco,
          leftPct: 0,
          widthPct: 100,
          lane,
          lanes: maxC,
          zIndex: 2,
        };
      }
      const widthPct = Math.max(48, 62 - (lane - 1) * 6);
      const leftPct = 100 - widthPct;
      return {
        bloco: ev.bloco,
        leftPct,
        widthPct,
        lane,
        lanes: maxC,
        zIndex: 2 + lane,
      };
    });
  }

  corGrupo(idAt: string): string {
    let h = 0;
    for (let i = 0; i < idAt.length; i++) {
      h = (h * 31 + idAt.charCodeAt(i)) >>> 0;
    }
    const hue = h % 360;
    return `hsl(${hue} 55% 42%)`;
  }

  /** Fundo do cartão: quitada → `#607D8B`; senão `agenda_cor` / `agenda_status` / hash. */
  corFundoCartaoBloco(b: AgendaHubBloco): string {
    if (this.blocoComandaFaturada(b)) {
      return AGENDA_COR_COMANDA_FATURADA;
    }
    for (const l of b.linhas) {
      const c = String(l.agenda_cor ?? '').trim();
      if (c) return c;
    }
    const st = String(b.linhas[0]?.agenda_status ?? '').trim();
    if (st) {
      const hex = corHexAgendaPorStatus(normalizarAgendaStatusId(st));
      if (hex) return hex;
    }
    return this.corGrupo(this.idAtendimentoBloco(b));
  }

  private hhmmDesdeMinutosDia(m: number): string {
    const mf = Math.floor(m);
    const hh = Math.floor(mf / 60) % 24;
    const mm = mf % 60;
    return `${String(hh).padStart(2, '0')}:${String(mm).padStart(2, '0')}`;
  }

  /** Intervalo exibido no cartão, ex.: `08:30 - 09:10`. */
  intervaloHHmmBloco(b: AgendaHubBloco, ymdCtx?: string): string {
    const ex = this.extentMinutosBloco(b, ymdCtx);
    if (!ex) return '';
    return `${this.hhmmDesdeMinutosDia(ex.start)} - ${this.hhmmDesdeMinutosDia(ex.end)}`;
  }

  /**
   * Duração de uma linha: prioriza catálogo (Regras Mega / Serviços);
   * fallback `fim − inicio`; mínimo 30 min.
   */
  private duracaoMinutosAgendamento(
    ev: AtendimentoListaItem,
    ymdCtx?: string,
  ): number {
    const catalogo = this.duracaoMinutosCatalogoLinha(ev);
    if (catalogo != null && catalogo > 0) return catalogo;

    const iniS = ev.inicio ? String(ev.inicio).trim() : '';
    const fS = ev.fim ? String(ev.fim).trim() : '';
    if (iniS && fS) {
      const d = diffMinutesEntreHorarios(iniS, fS);
      if (d != null && Number.isFinite(d) && d > 0) {
        return d;
      }
    }
    const dia = ymdCtx ?? this.diaYmd;
    const mi = minutosMeiaNoiteEmBrasilia(ev.inicio, dia);
    const mf = minutosMeiaNoiteEmBrasilia(ev.fim, dia);
    if (mi != null && mf != null && mf > mi) {
      return mf - mi;
    }
    return 30;
  }

  /** Minutos no catálogo para a linha; null se não houver regra/serviço. */
  private duracaoMinutosCatalogoLinha(
    l: AtendimentoListaItem,
  ): number | null {
    const t = (l.tipo || '').trim().toLowerCase();
    if (t === 'mega' || t === 'pacote' || isTipoPacoteQueratinaNorm(t)) {
      const pac = (l.pacote || '').trim();
      const et = (l.etapa || '').trim();
      if (!pac || !et) return null;
      const regras = isTipoPacoteQueratinaNorm(t)
        ? this.regrasMegaQueratina
        : this.regrasMega;
      const r = regras.find(
        (x) =>
          String(x.pacote || '').trim() === pac &&
          String(x.etapa || '').trim() === et,
      );
      const n = Number(r?.duracao_minutos);
      if (Number.isFinite(n) && n >= 5) return Math.min(24 * 60, Math.round(n));
      return null;
    }
    if (t === 'serviço' || t === 'servico') {
      return this.duracaoMinutosServicoCatalogo(
        (l.servicosRef || '').trim(),
        (l.tamanho || '').trim(),
      );
    }
    return null;
  }

  private duracaoMinutosServicoCatalogo(
    nomeServico: string,
    tamanho: string,
  ): number | null {
    if (!nomeServico) return null;
    const s = this.servicosCatalogo.find(
      (x) =>
        String(x['servico'] ?? x['Serviço'] ?? x['Servico'] ?? '')
          .trim()
          .toLowerCase() === nomeServico.toLowerCase(),
    );
    if (!s) return null;
    const padrao = (): number | null => {
      const raw =
        s['duracao_minutos'] ??
        s['Duração Minutos'] ??
        s['Duracao Minutos'] ??
        s['duracaoMinutos'];
      const n = Number(raw);
      if (Number.isFinite(n) && n >= 5 && n <= 24 * 60) return Math.round(n);
      return null;
    };
    const tipo = String(s['Tipo'] ?? s['tipo'] ?? '')
      .trim()
      .toLowerCase();
    if (tipo === 'fixo' || !tipo) return padrao();
    const tam = (tamanho || 'Curto').trim();
    const keyMap: Record<string, string> = {
      Curto: 'duracao_curto',
      Médio: 'duracao_medio',
      'M/L': 'duracao_m_l',
      Longo: 'duracao_longo',
    };
    const key = keyMap[tam] ?? 'duracao_curto';
    const n = Number(s[key]);
    if (Number.isFinite(n) && n >= 5 && n <= 24 * 60) return Math.round(n);
    return padrao();
  }

  /**
   * Primeiro horário (minutos) do pedido Mega/Pacote no dia — igual em todas as
   * colunas para alinhar cartões quando há profissionais diferentes nas etapas.
   */
  private inicioGlobalMinutosMegaPacote(
    idAt: string,
    ymdCtx?: string,
  ): number | null {
    const id = String(idAt || '').trim();
    if (!id) return null;
    const dia = ymdCtx ?? this.diaYmd;
    const linhasPedido = this.linhasParaGrelha(dia).filter(
      (r) => String(r.id || '').trim() === id,
    );
    const hhmm = horaInicialMenorDasLinhasAtendimento(linhasPedido, dia);
    if (hhmm) {
      const [hhS, mmS] = hhmm.split(':');
      const mins = parseInt(hhS, 10) * 60 + parseInt(mmS, 10);
      if (Number.isFinite(mins) && mins >= 0) return mins;
    }
    let best: number | null = null;
    for (const r of linhasPedido) {
      const t = (r.tipo || '').trim().toLowerCase();
      if (t !== 'mega' && t !== 'pacote' && !isTipoPacoteQueratinaNorm(t)) continue;
      if (!(r.etapa || '').trim()) continue;
      const ini = r.inicio ? String(r.inicio).trim() : '';
      if (!ini) continue;
      const mi = minutosMeiaNoiteEmBrasilia(ini, dia);
      if (mi == null || !Number.isFinite(mi)) continue;
      if (best == null || mi < best) best = mi;
    }
    return best;
  }

  /** Todas as linhas do mesmo `id_atendimento` no dia (horário pode estar noutra coluna/tipo). */
  private linhasPedidoDoBloco(
    b: AgendaHubBloco,
    ymdCtx?: string,
  ): AtendimentoListaItem[] {
    const idAt = String(b.linhas[0]?.id || '').trim();
    if (!idAt) return b.linhas;
    const dia = ymdCtx ?? this.diaYmd;
    return this.linhasParaGrelha(dia).filter(
      (r) => String(r.id || '').trim() === idAt,
    );
  }

  private minutosInicioPreferencialBloco(
    b: AgendaHubBloco,
    ymdCtx?: string,
  ): number | null {
    const dia = ymdCtx ?? this.diaYmd;
    const hhmm = horaInicialMenorDasLinhasAtendimento(
      this.linhasPedidoDoBloco(b, dia),
      dia,
    );
    if (!hhmm) return null;
    const [hhS, mmS] = hhmm.split(':');
    const mins = parseInt(hhS, 10) * 60 + parseInt(mmS, 10);
    return Number.isFinite(mins) && mins >= 0 ? mins : null;
  }

  /**
   * Minutos que a linha contribui para a **altura** do card.
   * Ignora cabeça Mega/Pacote sem etapa e linhas sem `inicio` (não ocupam grelha).
   */
  private duracaoContribuinteLinhaParaAltura(
    l: AtendimentoListaItem,
    ymdCtx?: string,
  ): number {
    const t = (l.tipo || '').trim().toLowerCase();
    if (
      (t === 'mega' || t === 'pacote' || isTipoPacoteQueratinaNorm(t)) &&
      !(l.etapa || '').trim()
    ) {
      return 0;
    }
    const ini = l.inicio ? String(l.inicio).trim() : '';
    if (!ini) return 0;
    return this.duracaoMinutosAgendamento(l, ymdCtx);
  }

  /**
   * Soma das durações das linhas **deste** card (etapas + serviços + etc.).
   * É o que define a altura na grelha — não o span wall-clock (evita buracos
   * quando um Serviço ficou com horário antigo após trocar profissional).
   */
  private duracaoSomaLinhasParaAlturaBloco(
    b: AgendaHubBloco,
    ymdCtx?: string,
  ): number {
    const dia = ymdCtx ?? this.diaYmd;
    let sum = 0;
    for (const l of b.linhas) {
      sum += this.duracaoContribuinteLinhaParaAltura(l, dia);
    }
    return sum;
  }

  private duracaoTotalBlocoMinutos(
    b: AgendaHubBloco,
    ymdCtx?: string,
  ): number {
    const sum = this.duracaoSomaLinhasParaAlturaBloco(b, ymdCtx);
    return sum > 0 ? sum : AGENDA_SLOT_MIN;
  }

  private blocoEMegaOuPacoteComEtapas(b: AgendaHubBloco): boolean {
    return b.linhas.some((l) => {
      const t = (l.tipo || '').trim().toLowerCase();
      return (
        (t === 'mega' || t === 'pacote' || isTipoPacoteQueratinaNorm(t)) &&
        (l.etapa || '').trim().length > 0
      );
    });
  }

  /** Mais cedo `inicio` entre as linhas **deste** card (não o pedido inteiro). */
  private inicioMinutosLinhasDoBloco(
    b: AgendaHubBloco,
    ymdCtx?: string,
  ): number | null {
    const dia = ymdCtx ?? this.diaYmd;
    let best: number | null = null;
    for (const l of b.linhas) {
      if (this.duracaoContribuinteLinhaParaAltura(l, dia) <= 0) continue;
      const mi = minutosMeiaNoiteEmBrasilia(l.inicio, dia);
      if (mi == null || !Number.isFinite(mi)) continue;
      if (best == null || mi < best) best = mi;
    }
    return best;
  }

  /**
   * Início / fim em minutos desde 00:00 (dia da grelha) para o bloco inteiro.
   *
   * Mega/Pacote multi-profissional: **topo** = 1.º horário global do pedido
   * (alinha colunas). **Altura** = soma das durações das linhas **deste** card
   * (etapas deste profissional + Serviços/etc. no mesmo card).
   *
   * Sem Mega: topo = início mais cedo das linhas do card; altura = mesma soma
   * (não usa max(fim)−min(inicio), que abriria “buraco” entre horários).
   */
  private extentMinutosBloco(
    b: AgendaHubBloco,
    ymdCtx?: string,
  ): { start: number; end: number } | null {
    const dia = ymdCtx ?? this.diaYmd;
    const idAt = String(b.linhas[0]?.id || '').trim();
    const globalStart =
      idAt && this.blocoEMegaOuPacoteComEtapas(b)
        ? this.inicioGlobalMinutosMegaPacote(idAt, dia)
        : null;

    const sumDur = this.duracaoSomaLinhasParaAlturaBloco(b, dia);
    const durEfetiva = Math.max(
      AGENDA_SLOT_MIN,
      sumDur > 0 ? sumDur : AGENDA_SLOT_MIN,
    );

    if (globalStart != null && Number.isFinite(globalStart)) {
      const end = Math.min(GRID_END_MIN, globalStart + durEfetiva);
      if (end <= globalStart) return null;
      return { start: globalStart, end };
    }

    const startLocal = this.inicioMinutosLinhasDoBloco(b, dia);
    if (startLocal != null && Number.isFinite(startLocal)) {
      const end = Math.min(GRID_END_MIN, startLocal + durEfetiva);
      if (end <= startLocal) return null;
      return { start: startLocal, end };
    }

    const fallbackStart = this.minutosInicioPreferencialBloco(b, dia);
    if (fallbackStart == null || !Number.isFinite(fallbackStart)) {
      return null;
    }
    const end = Math.min(GRID_END_MIN, fallbackStart + durEfetiva);
    if (end <= fallbackStart) return null;
    return { start: fallbackStart, end };
  }

  topPctBloco(b: AgendaHubBloco, ymdCtx?: string): number {
    const ex = this.extentMinutosBloco(b, ymdCtx);
    if (!ex) return 0;
    const t = Math.max(
      GRID_START_MIN,
      Math.min(GRID_LAST_SLOT_START_MIN, ex.start),
    );
    return ((t - GRID_START_MIN) / GRID_RANGE) * 100;
  }

  /**
   * Altura em %: uma unidade a mais que os slots cobertos pelo horário (ex.: 90 min → 4/31),
   * para alinhar o cartão aos traços da grelha (início, meios e fim do intervalo).
   */
  alturaPctBloco(b: AgendaHubBloco, ymdCtx?: string): number {
    const ex = this.extentMinutosBloco(b, ymdCtx);
    if (!ex) {
      /* Mesma regra `slots + 1` com duração mínima de 1 slot (30 min). */
      return (2 / AGENDA_SLOT_COUNT) * 100;
    }
    const startVis = Math.max(
      GRID_START_MIN,
      Math.min(GRID_LAST_SLOT_START_MIN, ex.start),
    );
    const endVis = Math.min(GRID_END_MIN, Math.max(ex.end, startVis + 30));
    let dur = Math.max(AGENDA_SLOT_MIN, endVis - startVis);
    dur = Math.min(dur, GRID_RANGE);
    const top = this.topPctBloco(b, ymdCtx);
    const slots = dur / AGENDA_SLOT_MIN;
    const faixasVis = Math.min(AGENDA_SLOT_COUNT, slots + 1);
    const hPct = (faixasVis / AGENDA_SLOT_COUNT) * 100;
    return Math.min(hPct, Math.max(0, 100 - top));
  }

  horaBloco(b: AgendaHubBloco, ymdCtx?: string): string {
    const ex = this.extentMinutosBloco(b, ymdCtx);
    if (!ex) return '';
    const mf = Math.floor(ex.start);
    const hh = Math.floor(mf / 60) % 24;
    const mm = mf % 60;
    return `${String(hh).padStart(2, '0')}:${String(mm).padStart(2, '0')}`;
  }

  nomeClienteBloco(b: AgendaHubBloco): string {
    return (b.linhas[0]?.nomeCliente || '').trim() || '—';
  }

  /**
   * Uma entrada por linha de atendimento (sem duplicar texto igual).
   * Mega/Pacote/Queratina: só etapas **desta coluna** (`b.linhas`) — profissionais
   * diferentes no mesmo pedido não podem misturar etapas no card.
   * Cabelo do mesmo pedido/profissional (ex.: sem horário no cluster) entra como
   * suplemento para o detalhe `Cor: …` aparecer sem vazar etapas de outros.
   */
  itensResumoBloco(b: AgendaHubBloco): string[] {
    const out: string[] = [];
    const seen = new Set<string>();
    const idsNoCard = new Set(
      b.linhas
        .map((l) => l.linha_id)
        .filter((id): id is number => id != null && Number.isFinite(id)),
    );
    const pidsNoCard = new Set(
      b.linhas
        .map((l) => Number(l.profissional_id))
        .filter((n) => Number.isFinite(n) && n > 0),
    );
    const pushLinha = (l: AtendimentoListaItem): void => {
      const txt = linhaResumoAtendimentoLista(l).trim();
      if (!txt || seen.has(txt)) return;
      seen.add(txt);
      out.push(txt);
    };
    for (const l of b.linhas) pushLinha(l);
    for (const l of this.linhasPedidoDoBloco(b)) {
      const lid = l.linha_id;
      if (lid != null && Number.isFinite(lid) && idsNoCard.has(lid)) continue;
      const t = (l.tipo || '').trim().toLowerCase();
      if (t !== 'cabelo') continue;
      const pid = Number(l.profissional_id);
      if (pid > 0 && pidsNoCard.size > 0 && !pidsNoCard.has(pid)) continue;
      pushLinha(l);
    }
    return out;
  }

  /** Texto plano para aria-label / leitores. */
  rotuloBloco(b: AgendaHubBloco): string {
    const hora = this.intervaloHHmmBloco(b) || this.horaBloco(b);
    const nome = this.nomeClienteBloco(b);
    const itens = this.itensResumoBloco(b);
    const partes: string[] = [];
    if (hora) partes.push(hora);
    partes.push(nome);
    if (itens.length) partes.push(itens.join('; '));
    return partes.join(' · ');
  }

  idAtendimentoBloco(b: AgendaHubBloco): string {
    return String(b.linhas[0]?.id || '').trim();
  }

  onCardHoverEnter(
    ev: MouseEvent,
    bloco: AgendaHubBloco,
    ymdCtx?: string,
  ): void {
    if (this.layoutMobile || this.cardArrasteAtivo || this.cardHoverSuppressed) {
      return;
    }
    // Tip sticky: re-hover no cartão de origem fecha o tip.
    if (
      this.cardHoverTipSticky &&
      this.cardHoverTip?.trackKey === bloco.trackKey
    ) {
      this.cardHoverTipSticky = false;
      this.fecharCardHoverTip();
      return;
    }
    const slot = (ev.currentTarget as HTMLElement | null) ?? null;
    if (!slot) return;
    this.clearCardHoverHideTimer();
    this.clearCardHoverShowTimer();
    const delay = CARD_HOVER_TIP_PIN_DEBUG ? 0 : CARD_HOVER_TIP_DELAY_MS;
    this.cardHoverShowTimer = setTimeout(() => {
      this.cardHoverShowTimer = null;
      if (this.cardArrasteAtivo || this.cardHoverSuppressed) return;
      void this.abrirCardHoverTip(bloco, slot, ymdCtx);
    }, delay);
  }

  onCardHoverLeave(): void {
    if (CARD_HOVER_TIP_PIN_DEBUG || this.cardHoverTipSticky) return;
    this.clearCardHoverShowTimer();
    this.cardHoverSuppressed = false;
    this.scheduleCardHoverHide();
  }

  onCardHoverTipEnter(): void {
    this.clearCardHoverHideTimer();
  }

  onCardHoverTipLeave(): void {
    if (CARD_HOVER_TIP_PIN_DEBUG || this.cardHoverTipSticky) return;
    this.scheduleCardHoverHide();
  }

  private scheduleCardHoverHide(): void {
    if (
      CARD_HOVER_TIP_PIN_DEBUG ||
      this.cardHoverTipSticky ||
      this.tipStatusMenuOpen ||
      this.tipCorMenuOpen
    ) {
      return;
    }
    this.clearCardHoverHideTimer();
    this.cardHoverHideTimer = setTimeout(() => {
      this.cardHoverHideTimer = null;
      this.iniciarFadeOutCardHoverTip();
    }, 120);
  }

  private clearCardHoverShowTimer(): void {
    if (this.cardHoverShowTimer != null) {
      clearTimeout(this.cardHoverShowTimer);
      this.cardHoverShowTimer = null;
    }
  }

  private clearCardHoverHideTimer(): void {
    if (this.cardHoverHideTimer != null) {
      clearTimeout(this.cardHoverHideTimer);
      this.cardHoverHideTimer = null;
    }
  }

  private clearCardHoverFadeTimer(): void {
    if (this.cardHoverFadeTimer != null) {
      clearTimeout(this.cardHoverFadeTimer);
      this.cardHoverFadeTimer = null;
    }
  }

  private iniciarFadeOutCardHoverTip(): void {
    if (!this.cardHoverTip) return;
    this.cardHoverTipVisible = false;
    this.clearCardHoverFadeTimer();
    this.cardHoverFadeTimer = setTimeout(() => {
      this.cardHoverFadeTimer = null;
      this.cardHoverTip = null;
    }, CARD_HOVER_TIP_FADE_MS);
  }

  fecharCardHoverTip(): void {
    this.clearCardHoverShowTimer();
    this.clearCardHoverHideTimer();
    this.clearCardHoverFadeTimer();
    this.fecharTipStatusMenu(true);
    this.fecharTipCorMenu(true);
    this.cardHoverTipVisible = false;
    this.cardHoverTip = null;
    this.cardHoverTipSticky = false;
    this.cardHoverSuppressed = false;
  }

  private async abrirCardHoverTip(
    bloco: AgendaHubBloco,
    slotEl: HTMLElement,
    ymdCtx?: string,
  ): Promise<void> {
    const card =
      (slotEl.querySelector('.day-col__card') as HTMLElement | null) ?? slotEl;
    const rect = card.getBoundingClientRect();
    const tipW = CARD_HOVER_TIP_W_PX;
    const tipH = CARD_HOVER_TIP_H_PX;
    const gap = CARD_HOVER_TIP_GAP_PX;
    const cardCenterX = rect.left + rect.width / 2;

    let left = cardCenterX - tipW / 2;
    left = Math.max(12, Math.min(left, window.innerWidth - tipW - 12));

    let placement: 'below' | 'above' = 'below';
    let top = rect.bottom + gap;
    if (top + tipH > window.innerHeight - 12) {
      placement = 'above';
      top = Math.max(12, rect.top - tipH - gap);
    }

    const arrowLeft = Math.max(
      16,
      Math.min(cardCenterX - left, tipW - 16),
    );

    const linha = bloco.linhas[0];
    const cid = String(linha?.idCliente ?? '').trim();
    let cliente: Cliente | null = this.clienteTipCache.get(cid) ?? null;
    if (cid && !cliente) {
      try {
        cliente = await new Promise<Cliente | null>((resolve) => {
          this.api.getCliente(cid).subscribe({
            next: (c) => resolve(c),
            error: () => resolve(null),
          });
        });
        if (cliente) this.clienteTipCache.set(cid, cliente);
      } catch {
        cliente = null;
      }
    }

    const statusId = normalizarAgendaStatusId(linha?.agenda_status);
    const statusMeta =
      AGENDA_STATUS_META.find((s) => s.id === statusId) ?? AGENDA_STATUS_META[0];
    const tipCor = this.resolverTipCorExibicao(linha?.agenda_cor);
    const ymd =
      String(ymdCtx ?? linha?.data ?? this.diaYmd).trim() || this.diaYmd;
    const intervalo = this.intervaloHHmmBloco(bloco, ymd) || this.horaBloco(bloco, ymd);
    const itens = this.itensResumoBloco(bloco);

    this.clearCardHoverFadeTimer();
    this.cardHoverTipSticky = false;
    this.cardHoverTipVisible = false;
    this.cardHoverTip = {
      trackKey: bloco.trackKey,
      bloco,
      ymdCtx: ymd,
      left,
      top,
      arrowLeft,
      placement,
      nome: this.nomeClienteBloco(bloco),
      telefone: telefoneClienteWhatsappExibicao(cliente),
      fotoUrl: (cliente?.fotoUrl ?? '').trim(),
      intervalo,
      dataLabel: this.formatarDataHoraCardTip(ymd, intervalo),
      servico: itens[0] ?? '—',
      statusLabel: statusMeta.label,
      statusCor: statusMeta.cor,
      corLabel: tipCor.label,
      corHex: tipCor.hex,
      numeroComanda:
        linha?.numeroComanda != null &&
        Number.isFinite(linha.numeroComanda) &&
        linha.numeroComanda > 0
          ? linha.numeroComanda
          : 0,
    };
    // Próximo frame: dispara a transição de fade-in.
    requestAnimationFrame(() => {
      requestAnimationFrame(() => {
        if (this.cardHoverTip?.trackKey === bloco.trackKey) {
          this.cardHoverTipVisible = true;
          if (CARD_HOVER_TIP_PIN_DEBUG) {
            this.tipStatusMenuOpen = false;
            this.tipCorMenuOpen = true;
          }
        }
      });
    });
  }

  /**
   * Cor nomeada do agendamento (`agenda_cor`); sem hex → «Sem cor».
   */
  private resolverTipCorExibicao(agendaCor: string | null | undefined): {
    label: string;
    hex: string;
  } {
    const corHex = String(agendaCor ?? '').trim();
    if (!corHex) return { label: 'Sem cor', hex: '' };
    const corId = resolverAgendaCorIdPorHex(corHex);
    const corOpt = listarOpcoesCorAgenda().find((o) => o.id === corId);
    if (!corOpt || corOpt.id === AGENDA_COR_PADRAO_ID) {
      return { label: 'Sem cor', hex: '' };
    }
    return {
      label: corOpt.label.trim() || 'Sem cor',
      hex: (corOpt.cor || corHex).trim(),
    };
  }

  /** Cor do texto da linha Cor no tip. */
  tipCorTexto(tip: AgendaCardHoverTip): string {
    return tip.corHex.trim() || TIP_SEM_COR_TEXTO;
  }

  private formatarDataHoraCardTip(ymd: string, intervalo: string): string {
    const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(ymd.trim());
    const hora = (intervalo.split('-')[0] ?? '').trim() || '—';
    if (!m) return `${dataDdMmBarraAaaa(ymd)} ${hora}`.trim();
    const d = new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]));
    const dataFmt = new Intl.DateTimeFormat('pt-BR', {
      weekday: 'long',
      day: 'numeric',
      month: 'long',
      year: 'numeric',
    }).format(d);
    return `${dataFmt} ${hora}`;
  }

  private gerarSlots(): string[] {
    const out: string[] = [];
    for (let m = GRID_START_MIN; m < GRID_END_MIN; m += 30) {
      const h = Math.floor(m / 60);
      const mm = m % 60;
      out.push(
        `${String(h).padStart(2, '0')}:${String(mm).padStart(2, '0')}`,
      );
    }
    return out;
  }

  slotTopPct(hora: string): number {
    const [hs, ms] = hora.split(':');
    const m = parseInt(hs, 10) * 60 + parseInt(ms, 10);
    return ((m - GRID_START_MIN) / GRID_RANGE) * 100;
  }

  slotAlturaPct(): number {
    return 100 / Math.max(1, this.slotsHoras.length);
  }

  /** Atualizado a cada minuto — posiciona o traço vermelho da hora atual na grelha. */
  agoraGrelhaTick = 0;

  indicadorHoraAtualVisivel(): boolean {
    if (this.modoVista === 'dia') {
      return this.diaYmd === this.hojeYmd();
    }
    if (this.modoVista === 'semana') {
      return this.diasFaixaSemanal().some((d) => d.hoje);
    }
    return false;
  }

  indicadorHoraAtualTopPct(): number | null {
    void this.agoraGrelhaTick;
    const agora = new Date();
    const min = agora.getHours() * 60 + agora.getMinutes();
    if (min < GRID_START_MIN || min >= GRID_END_MIN) return null;
    return ((min - GRID_START_MIN) / GRID_RANGE) * 100;
  }

  private setupRelogioGrelha(): void {
    const tick = (): void => {
      this.agoraGrelhaTick = Date.now();
    };
    tick();
    const id = setInterval(tick, 60_000);
    this.destroyRef.onDestroy(() => clearInterval(id));
  }

  private inicioDoMes(d: Date): Date {
    return new Date(d.getFullYear(), d.getMonth(), 1);
  }

  /**
   * Mini-calendário: só conta pedidos que teriam cartão na grelha (com horário no dia).
   * Conta cartões visuais (status/horário distintos do mesmo id contam separado).
   */
  private contagemAgendamentosVisiveisNaGrelhaPorDia(
    items: AtendimentoListaItem[],
  ): Map<string, number> {
    const buckets = new Map<string, AtendimentoListaItem[]>();
    let legacySeq = 0;
    for (const a of items) {
      const ymd = (a.data || '').slice(0, 10);
      if (!/^\d{4}-\d{2}-\d{2}$/.test(ymd)) continue;
      const idAt = String(a.id || '').trim();
      const grupKey = idAt
        ? `id:${idAt}`
        : `linha:${a.linha_id ?? legacySeq++}`;
      const bucketKey = `${ymd}\u0001${grupKey}`;
      const arr = buckets.get(bucketKey) ?? [];
      arr.push(a);
      buckets.set(bucketKey, arr);
    }
    const porDiaSets = new Map<string, Set<string>>();
    for (const [bucketKey, linhas] of buckets) {
      const sep = bucketKey.indexOf('\u0001');
      const ymd = bucketKey.slice(0, sep);
      const grupKey = bucketKey.slice(sep + 1);
      if (!pedidoTemPosicaoNaGrelhaAgenda(linhas, ymd)) continue;
      for (const part of particionarLinhasPedidoEmCartoesAgenda(
        linhas,
        ymd,
        grupKey,
      )) {
        if (!pedidoTemPosicaoNaGrelhaAgenda(part.linhas, ymd)) continue;
        if (!porDiaSets.has(ymd)) porDiaSets.set(ymd, new Set());
        porDiaSets.get(ymd)!.add(part.trackKey);
      }
    }
    const out = new Map<string, number>();
    for (const [ymd, set] of porDiaSets) {
      out.set(ymd, set.size);
    }
    return out;
  }

  private carregarMes(): void {
    this.carregandoMes = true;
    this.erro = '';
    const y = this.mesRef.getFullYear();
    const m = this.mesRef.getMonth();
    const inicio = new Date(y, m, 1);
    const fim = new Date(y, m + 1, 0);
    const di = toYmd(inicio);
    const df = toYmd(fim);
    this.api.listAgendamentos(di, df).subscribe({
      next: (items) => {
        this.itensMes = items;
        this.porDia = this.contagemAgendamentosVisiveisNaGrelhaPorDia(items);
        this.carregandoMes = false;
      },
      error: (e: Error) => {
        this.erro =
          e.message ||
          'Não foi possível carregar o mês na mini-agenda.';
        this.carregandoMes = false;
      },
    });
  }

  private carregarSemana(): void {
    this.carregandoSemana = true;
    const di = this.semanaGridInicioYmd;
    const df = this.fimFaixaSemanalYmd(di);
    this.api.listAgendamentos(di, df).subscribe({
      next: (items) => {
        this.linhasSemana = items;
        this.carregandoSemana = false;
        this.sincronizarTipAposRecarregar();
        this.agendarAtualizarSemanaHScrollDock();
      },
      error: (e: Error) => {
        this.erro =
          e.message ||
          'Não foi possível carregar a semana na grelha.';
        this.linhasSemana = [];
        this.carregandoSemana = false;
        this.agendarAtualizarSemanaHScrollDock();
      },
    });
  }

  private carregarDia(): void {
    this.carregandoDia = true;
    const d = this.diaYmd;
    this.api.listAgendamentos(d, d).subscribe({
      next: (items) => {
        this.linhasDia = items;
        this.carregandoDia = false;
        this.sincronizarTipAposRecarregar();
      },
      error: (e: Error) => {
        this.erro =
          e.message ||
          'Não foi possível carregar os atendimentos do dia.';
        this.linhasDia = [];
        this.carregandoDia = false;
      },
    });
  }

  /** Mantém o tip apontando para o bloco fresco da grelha após reload. */
  private sincronizarTipAposRecarregar(): void {
    const tip = this.cardHoverTip;
    if (!tip) return;
    const id = this.idAtendimentoBloco(tip.bloco);
    if (!id) return;
    const ymd = tip.ymdCtx || this.diaYmd;
    for (const p of this.profissionaisVisiveis()) {
      for (const b of this.blocosNaColuna(p.id, ymd)) {
        if (this.idAtendimentoBloco(b) === id) {
          tip.bloco = b;
          const l0 = b.linhas[0];
          const statusId = normalizarAgendaStatusId(l0?.agenda_status);
          const statusMeta =
            AGENDA_STATUS_META.find((s) => s.id === statusId) ??
            AGENDA_STATUS_META[0];
          tip.statusLabel = statusMeta.label;
          tip.statusCor = statusMeta.cor;
          const tipCor = this.resolverTipCorExibicao(l0?.agenda_cor);
          tip.corLabel = tipCor.label;
          tip.corHex = tipCor.hex;
          tip.numeroComanda =
            l0?.numeroComanda != null &&
            Number.isFinite(l0.numeroComanda) &&
            l0.numeroComanda > 0
              ? l0.numeroComanda
              : 0;
          return;
        }
      }
    }
  }
}
