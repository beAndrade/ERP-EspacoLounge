import {
  Component,
  DestroyRef,
  inject,
  LOCALE_ID,
  OnDestroy,
  OnInit,
  ViewChild,
} from '@angular/core';
import { FormsModule } from '@angular/forms';
import { ActivatedRoute, Router } from '@angular/router';
import { filter } from 'rxjs/operators';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import {
  AtendimentoListaItem,
  ProfissionalListaItem,
} from '../../../../core/models/api.models';
import { SheetsApiService } from '../../../../core/services/sheets-api.service';
import { SessaoUsuarioService } from '../../../../core/services/sessao-usuario.service';
import { minutosMeiaNoiteEmBrasilia } from '../../../../core/utils/brasilia-time';
import { diffMinutesEntreHorarios } from '../../../../core/utils/sql-local-datetime';
import {
  horaInicialMenorDasLinhasAtendimento,
  linhaResumoAtendimentoLista,
  ordenarLinhasAtendimentoInPlace,
  pedidoTemPosicaoNaGrelhaAgenda,
  toYmd,
} from '../../../../core/utils/atendimento-display';
import {
  AGENDA_COR_COMANDA_FATURADA,
  corHexAgendaPorStatus,
  normalizarAgendaStatusId,
} from '../../../../core/utils/agenda-status-card';
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

type CelulaCalendario = { dia: number | null; ymd: string | null };

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
/** Último slot de 30 min a começar na grelha (23:00). */
const GRID_LAST_SLOT_START_MIN = GRID_END_MIN - 30;

/** Duração da animação do drawer (ms); manter igual a `--drawer-slide-duration` no SCSS. */
const DRAWER_ANIM_MS = 430;

/** Um cartão na grelha = mesmo `id` + mesmo profissional (várias linhas = um bloco). */
type AgendaHubBloco = {
  trackKey: string;
  linhas: AtendimentoListaItem[];
};

@Component({
  selector: 'app-agenda-hub',
  standalone: true,
  imports: [
    FormsModule,
    AgendaNovoComponent,
    NovaComandaDrawerComponent,
    FaturarDrawerComponent,
  ],
  providers: [{ provide: LOCALE_ID, useValue: 'pt-BR' }],
  templateUrl: './agenda-hub.component.html',
  styleUrl: './agenda-hub.component.scss',
})
export class AgendaHubComponent implements OnInit, OnDestroy {
  private readonly api = inject(SheetsApiService);
  private readonly router = inject(Router);
  private readonly route = inject(ActivatedRoute);
  private readonly destroyRef = inject(DestroyRef);
  private readonly cadastroDrawer = inject(ClienteCadastroDrawerService);
  readonly sessao = inject(SessaoUsuarioService);

  @ViewChild(AgendaNovoComponent)
  private agendaDrawerRef?: AgendaNovoComponent;

  /** Após `?abrirNovaComanda=1`, quando um fluxo quiser já abrir o drawer de comanda. */
  private timerAbrirNovaComandaDesdeLista: ReturnType<typeof setTimeout> | null =
    null;

  mesRef = this.inicioDoMes(new Date());
  diaYmd = toYmd(new Date());
  carregandoMes = false;
  carregandoDia = false;
  erro = '';
  porDia = new Map<string, number>();
  itensMes: AtendimentoListaItem[] = [];
  linhasDia: AtendimentoListaItem[] = [];
  profissionais: ProfissionalListaItem[] = [];
  /** Profissionais ocultos na grelha (vazio = todos visíveis). */
  profOcultos = new Set<number>();

  /** Mobile: dia único ou faixa semanal (mesma grelha por dia selecionado). */
  modoVista: 'dia' | 'semana' = 'dia';
  profissionalMobileId: number | null = null;
  buscaCliente = '';
  layoutMobile = false;

  painelCalendarioAberto = false;
  painelProfissionaisAberto = false;

  slotsHoras: string[] = [];
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

  @ViewChild(NovaComandaDrawerComponent)
  private comandaDrawerRef?: NovaComandaDrawerComponent;

  private drawerCloseTimer: ReturnType<typeof setTimeout> | null = null;
  private comandaDrawerCloseTimer: ReturnType<typeof setTimeout> | null = null;
  private faturarDrawerCloseTimer: ReturnType<typeof setTimeout> | null = null;
  private bodyScrollPreDrawer = 0;
  private pageScrollLockAtivo = false;

  private readonly onDrawerKeydown = (ev: KeyboardEvent): void => {
    if (ev.key !== 'Escape' && ev.key !== 'Esc') return;
    if (this.algumPainelHubAberto()) {
      ev.preventDefault();
      this.fecharPaineisHub();
      return;
    }
    if (
      !this.modalAberto &&
      !this.comandaPainelAberto &&
      !this.faturarDrawerAberto
    ) {
      return;
    }
    ev.preventDefault();
    if (this.faturarDrawerAberto && this.faturarDrawerPanelOpen) {
      this.fecharFaturarDrawer();
      return;
    }
    if (this.comandaPainelAberto && this.comandaDrawerPanelOpen) {
      this.fecharComandaDrawer();
      return;
    }
    this.fecharModal();
  };

  ngOnInit(): void {
    this.slotsHoras = this.gerarSlots();
    this.setupLayoutMobile();
    window.addEventListener('keydown', this.onDrawerKeydown);
    this.destroyRef.onDestroy(() => {
      window.removeEventListener('keydown', this.onDrawerKeydown);
    });
    this.api.listProfissionais(false, 'agenda').subscribe({
      next: (items) => {
        this.profissionais = items ?? [];
      },
      error: () => {
        this.profissionais = [];
      },
    });
    this.carregarMes();
    this.carregarDia();
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

  ngOnDestroy(): void {
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
    if (this.faturarDrawerCloseTimer != null) {
      clearTimeout(this.faturarDrawerCloseTimer);
      this.faturarDrawerCloseTimer = null;
    }
    this.limparEfeitosDrawer();
  }

  profissionaisVisiveis(): ProfissionalListaItem[] {
    const all = this.profissionais.filter((p) => !this.profOcultos.has(p.id));
    if (!this.layoutMobile) return all;
    const pid = this.profissionalAtivoMobile();
    if (pid == null) return all.length ? [all[0]] : [];
    const found = all.find((p) => p.id === pid);
    return found ? [found] : all.length ? [all[0]] : [];
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

  selecionarModoVista(modo: 'dia' | 'semana'): void {
    this.modoVista = modo;
  }

  /**
   * Rótulo central do header conforme distância a «hoje»:
   * 0 → Hoje; +1 → Amanhã; +2 → nome do dia (ex. Sábado);
   * +3+ / -2- → «07 jun, 2026 (dom)»; -1 → Ontem.
   */
  rotuloNavegacaoDia(): string {
    const diff = this.diffDiasDesdeHoje(this.diaYmd);
    if (diff === 0) return 'Hoje';
    if (diff === 1) return 'Amanhã';
    if (diff === -1) return 'Ontem';
    if (diff === 2) return this.nomeDiaSemanaLongo(this.diaYmd);
    return this.formatarDiaCabecalhoCompleto(this.diaYmd);
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

  diasFaixaSemana(): Array<{
    ymd: string;
    label: string;
    diaNum: number;
    selecionado: boolean;
    hoje: boolean;
    contagem: number;
  }> {
    const anchor = this.parseYmdLocal(this.diaYmd);
    const dow = anchor.getDay();
    const mondayOffset = dow === 0 ? -6 : 1 - dow;
    const monday = new Date(anchor);
    monday.setDate(anchor.getDate() + mondayOffset);
    const labels = ['Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sáb', 'Dom'];
    const out: Array<{
      ymd: string;
      label: string;
      diaNum: number;
      selecionado: boolean;
      hoje: boolean;
      contagem: number;
    }> = [];
    for (let i = 0; i < 7; i++) {
      const d = new Date(monday);
      d.setDate(monday.getDate() + i);
      const ymd = toYmd(d);
      out.push({
        ymd,
        label: labels[i]!,
        diaNum: d.getDate(),
        selecionado: ymd === this.diaYmd,
        hoje: ymd === this.hojeYmd(),
        contagem: this.contagem(ymd),
      });
    }
    return out;
  }

  diaAnterior(): void {
    const d = this.parseYmdLocal(this.diaYmd);
    d.setDate(d.getDate() - 1);
    this.selecionarDia(toYmd(d));
  }

  diaSeguinte(): void {
    const d = this.parseYmdLocal(this.diaYmd);
    d.setDate(d.getDate() + 1);
    this.selecionarDia(toYmd(d));
  }

  limparBuscaCliente(): void {
    this.buscaCliente = '';
  }

  algumPainelHubAberto(): boolean {
    return this.painelCalendarioAberto || this.painelProfissionaisAberto;
  }

  fecharPaineisHub(): void {
    this.painelCalendarioAberto = false;
    this.painelProfissionaisAberto = false;
  }

  togglePainelCalendario(): void {
    const abrir = !this.painelCalendarioAberto;
    this.fecharPaineisHub();
    this.painelCalendarioAberto = abrir;
  }

  togglePainelProfissionais(): void {
    const abrir = !this.painelProfissionaisAberto;
    this.fecharPaineisHub();
    this.painelProfissionaisAberto = abrir;
  }

  /** Escolha de dia no painel Calendário: atualiza grelha e fecha o painel. */
  selecionarDiaCalendario(ymd: string | null): void {
    this.selecionarDia(ymd);
    this.fecharPaineisHub();
  }

  toggleProfissionalOculto(id: number): void {
    if (this.profOcultos.has(id)) {
      this.profOcultos.delete(id);
    } else {
      this.profOcultos.add(id);
    }
  }

  celulas(): CelulaCalendario[] {
    const y = this.mesRef.getFullYear();
    const m = this.mesRef.getMonth();
    const primeiroDow = new Date(y, m, 1).getDay();
    const diasNoMes = new Date(y, m + 1, 0).getDate();
    const out: CelulaCalendario[] = [];
    for (let i = 0; i < primeiroDow; i++) {
      out.push({ dia: null, ymd: null });
    }
    for (let d = 1; d <= diasNoMes; d++) {
      const ymd = `${y}-${String(m + 1).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
      out.push({ dia: d, ymd });
    }
    while (out.length % 7 !== 0) {
      out.push({ dia: null, ymd: null });
    }
    return out;
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
      this.carregarMes();
    }
    this.carregarDia();
  }

  mesAnterior(): void {
    const y = this.mesRef.getFullYear();
    const m = this.mesRef.getMonth();
    this.mesRef = this.inicioDoMes(new Date(y, m - 1, 1));
    this.carregarMes();
  }

  mesSeguinte(): void {
    const y = this.mesRef.getFullYear();
    const m = this.mesRef.getMonth();
    this.mesRef = this.inicioDoMes(new Date(y, m + 1, 1));
    this.carregarMes();
  }

  irMesAtual(): void {
    this.mesRef = this.inicioDoMes(new Date());
    this.carregarMes();
  }

  /** Mini-calendário: mês atual e dia selecionado = hoje (grelha + receção). */
  irParaHoje(): void {
    const hoje = new Date();
    this.mesRef = this.inicioDoMes(hoje);
    this.diaYmd = toYmd(hoje);
    this.carregarMes();
    this.carregarDia();
  }

  get colsCount(): number {
    return Math.max(1, this.profissionaisVisiveis().length);
  }

  hojeYmd(): string {
    return toYmd(new Date());
  }

  abrirNovo(profissionalId: number, hora: string): void {
    this.modalContexto = {
      data: this.diaYmd,
      profissional_id: profissionalId,
      hora,
      id_atendimento: undefined,
    };
    this.modalAberto = true;
    this.iniciarAberturaDrawer();
  }

  /** Abre o mesmo modal de novo atendimento, sem slot na grelha (hora no formulário). */
  abrirNovoAtendimentoModal(): void {
    const vis = this.profissionaisVisiveis();
    const pid = vis[0]?.id ?? this.profissionais[0]?.id ?? 0;
    this.modalContexto = {
      data: this.diaYmd,
      profissional_id: pid,
      hora: '',
      id_atendimento: undefined,
    };
    this.modalAberto = true;
    this.iniciarAberturaDrawer();
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
    this.timerAbrirNovaComandaDesdeLista = window.setTimeout(() => {
      this.timerAbrirNovaComandaDesdeLista = null;
      const ag = this.agendaDrawerRef;
      if (ag) {
        ag.abrirComandaRodapeIgualAoBotaoFooter();
      } else {
        this.timerAbrirNovaComandaDesdeLista = window.setTimeout(() => {
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

  /** Abre o drawer em modo edição (sem saltar para a receção). */
  abrirDrawerEdicaoBloco(b: AgendaHubBloco, e: Event): void {
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
    const hora = this.horaBloco(b);
    this.modalContexto = {
      data: this.diaYmd,
      profissional_id: profId,
      hora: hora || undefined,
      id_atendimento: id,
    };
    this.modalAberto = true;
    this.iniciarAberturaDrawer();
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
    this.carregarMes();
    this.carregarDia();
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
    this.drawerPanelOpen = false;
    queueMicrotask(() => {
      requestAnimationFrame(() => {
        requestAnimationFrame(() => {
          this.drawerPanelOpen = true;
        });
      });
    });
  }

  private limparEfeitosDrawer(): void {
    this.desbloquearScrollPagina();
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
    this.comandaSomenteStandalone = standalone;
    if (standalone) {
      this.bloquearScrollPagina();
    }
    this.comandaDrawerContexto = payload;
    const y = (payload.dataYmd ?? '').trim();
    this.comandaDataYmdParaFaturar =
      /^\d{4}-\d{2}-\d{2}$/.test(y) ? y : null;
    this.comandaPainelAberto = true;
    this.comandaDrawerPanelOpen = false;
    queueMicrotask(() => {
      requestAnimationFrame(() => {
        requestAnimationFrame(() => {
          this.comandaDrawerPanelOpen = true;
        });
      });
    });
  }

  fecharComandaDrawer(): void {
    if (!this.comandaPainelAberto) return;
    if (!this.comandaDrawerPanelOpen) {
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
    this.comandaDrawerPanelOpen = false;
    if (this.comandaDrawerCloseTimer != null) {
      clearTimeout(this.comandaDrawerCloseTimer);
    }
    this.comandaDrawerCloseTimer = setTimeout(() => {
      this.comandaDrawerCloseTimer = null;
      this.comandaPainelAberto = false;
      this.comandaDrawerContexto = null;
      this.comandaDataYmdParaFaturar = null;
      if (this.comandaSomenteStandalone) {
        this.comandaSomenteStandalone = false;
        if (!this.modalAberto) {
          this.limparEfeitosDrawer();
        }
      }
    }, DRAWER_ANIM_MS);
  }

  private limparComandaDrawerSemAnimacao(): void {
    this.comandaPainelAberto = false;
    this.comandaDrawerPanelOpen = false;
    this.comandaDrawerContexto = null;
    this.comandaDataYmdParaFaturar = null;
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
    this.limparComandaDrawerSemAnimacao();
    if (!this.drawerPanelOpen) {
      this.modalAberto = false;
      this.modalContexto = null;
      this.limparEfeitosDrawer();
      return;
    }
    this.drawerPanelOpen = false;
    if (this.drawerCloseTimer != null) {
      clearTimeout(this.drawerCloseTimer);
    }
    this.drawerCloseTimer = setTimeout(() => {
      this.drawerCloseTimer = null;
      this.modalAberto = false;
      this.modalContexto = null;
      this.desbloquearScrollPagina();
    }, DRAWER_ANIM_MS);
  }

  onSalvoModal(): void {
    this.fecharModal();
    this.carregarMes();
    this.carregarDia();
  }

  /** Comanda excluída na API: fecha só o painel e atualiza grelha / mês. */
  onComandaExcluida(): void {
    this.fecharComandaDrawer();
    this.carregarMes();
    this.carregarDia();
  }

  /**
   * Botão Editar dentro do drawer da comanda no hub.
   * O drawer de agendamento já está aberto por baixo: basta fechar a comanda
   * para que o utilizador volte ao agendamento (modo edição) que carregou-a.
   */
  onEditarAgendamentoDesdeComanda(): void {
    if (!this.comandaPainelAberto) return;
    this.fecharComandaDrawer();
  }

  /** Gravação do agendamento com o formulário já aberto por baixo da comanda. */
  onSalvarAgendamentoDesdeDrawerComanda(): void {
    if (!this.comandaPainelAberto) return;
    this.agendaDrawerRef?.salvar();
  }

  onComandaDataYmdAlterada(ymd: string | null): void {
    this.comandaDataYmdParaFaturar = ymd;
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
    const recarregarComanda = opts?.recarregarComanda !== false;
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
      this.carregarMes();
      this.carregarDia();
    }, DRAWER_ANIM_MS);
  }

  /** Após gravar pagamentos: fecha drawers e volta à grelha da agenda. */
  onFaturaComandaSucesso(): void {
    this.fecharFaturarDrawer({ recarregarComanda: false });
    this.fecharComandaDrawer();
    if (this.modalAberto) {
      this.fecharModal();
    }
  }

  eventosNaColuna(profId: number): AtendimentoListaItem[] {
    const rows = this.linhasDia.filter(
      (a) => Number(a.profissional_id) === profId,
    );
    ordenarLinhasAtendimentoInPlace(rows);
    return rows;
  }

  /**
   * Linhas agrupadas por atendimento (`id`) no mesmo profissional — um bloco visual
   * do início mais cedo ao fim mais tarde (ex.: 3 linhas de 30 min = 1h30 num só cartão).
   */
  blocosNaColuna(profId: number): AgendaHubBloco[] {
    const rows = this.eventosNaColuna(profId);
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
      out.push({ trackKey, linhas });
    }
    out.sort((a, b) => {
      const ea = this.extentMinutosBloco(a);
      const eb = this.extentMinutosBloco(b);
      const sa = ea?.start ?? Infinity;
      const sb = eb?.start ?? Infinity;
      return sa - sb;
    });
    return out.filter((b) => this.blocoPassaBuscaCliente(b));
  }

  private blocoPassaBuscaCliente(b: AgendaHubBloco): boolean {
    const q = this.buscaCliente.trim().toLowerCase();
    if (!q) return true;
    return this.nomeClienteBloco(b).toLowerCase().includes(q);
  }

  private setupLayoutMobile(): void {
    if (typeof window === 'undefined' || !window.matchMedia) return;
    const mq = window.matchMedia('(max-width: 768px)');
    const apply = (): void => {
      this.layoutMobile = mq.matches;
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
   * Cartões na mesma coluna (profissional) que se sobrepõem no tempo passam a
   * dividir a largura (ex.: 2 → 50% cada), em vez de empilhar e tapar o de baixo.
   */
  blocosLayout(profId: number): Array<{
    bloco: AgendaHubBloco;
    leftPct: number;
    widthPct: number;
  }> {
    const blocos = this.blocosNaColuna(profId);
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
      const widthPct = 100 / maxC;
      const leftPct = (lane / maxC) * 100;
      return { bloco: ev.bloco, leftPct, widthPct };
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
  intervaloHHmmBloco(b: AgendaHubBloco): string {
    const ex = this.extentMinutosBloco(b);
    if (!ex) return '';
    return `${this.hhmmDesdeMinutosDia(ex.start)} - ${this.hhmmDesdeMinutosDia(ex.end)}`;
  }

  /**
   * Duração de uma linha: primeiro `diffMinutesEntreHorarios` (funciona com ISO legado);
   * depois `fim − inicio` no dia da grelha; fallback 30 min.
   */
  private duracaoMinutosAgendamento(ev: AtendimentoListaItem): number {
    const iniS = ev.inicio ? String(ev.inicio).trim() : '';
    const fS = ev.fim ? String(ev.fim).trim() : '';
    if (iniS && fS) {
      const d = diffMinutesEntreHorarios(iniS, fS);
      if (d != null && Number.isFinite(d) && d > 0) {
        return d;
      }
    }
    const dia = this.diaYmd;
    const mi = minutosMeiaNoiteEmBrasilia(ev.inicio, dia);
    const mf = minutosMeiaNoiteEmBrasilia(ev.fim, dia);
    if (mi != null && mf != null && mf > mi) {
      return mf - mi;
    }
    return 30;
  }

  /**
   * Primeiro horário (minutos) do pedido Mega/Pacote no dia — igual em todas as
   * colunas para alinhar cartões quando há profissionais diferentes nas etapas.
   */
  private inicioGlobalMinutosMegaPacote(idAt: string): number | null {
    const id = String(idAt || '').trim();
    if (!id) return null;
    const dia = this.diaYmd;
    const linhasPedido = this.linhasDia.filter(
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
      if (t !== 'mega' && t !== 'pacote') continue;
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
  private linhasPedidoDoBloco(b: AgendaHubBloco): AtendimentoListaItem[] {
    const idAt = String(b.linhas[0]?.id || '').trim();
    if (!idAt) return b.linhas;
    return this.linhasDia.filter((r) => String(r.id || '').trim() === idAt);
  }

  private minutosInicioPreferencialBloco(b: AgendaHubBloco): number | null {
    const hhmm = horaInicialMenorDasLinhasAtendimento(
      this.linhasPedidoDoBloco(b),
      this.diaYmd,
    );
    if (!hhmm) return null;
    const [hhS, mmS] = hhmm.split(':');
    const mins = parseInt(hhS, 10) * 60 + parseInt(mmS, 10);
    return Number.isFinite(mins) && mins >= 0 ? mins : null;
  }

  private duracaoTotalBlocoMinutos(b: AgendaHubBloco): number {
    if (this.blocoEMegaOuPacoteComEtapas(b)) {
      const sum = this.duracaoSomaEtapasMegaPacoteNoBloco(b);
      if (sum > 0) return sum;
    }
    let sum = 0;
    for (const l of b.linhas) {
      sum += this.duracaoMinutosAgendamento(l);
    }
    return sum > 0 ? sum : AGENDA_SLOT_MIN;
  }

  private blocoEMegaOuPacoteComEtapas(b: AgendaHubBloco): boolean {
    return b.linhas.some((l) => {
      const t = (l.tipo || '').trim().toLowerCase();
      return (
        (t === 'mega' || t === 'pacote') && (l.etapa || '').trim().length > 0
      );
    });
  }

  /**
   * Soma as durações só das **etapas** (ignora cabeça Pacote/Mega sem etapa).
   * A cabeça tem `inicio`/`fim` nulos e `duracaoMinutosAgendamento` devolvia 30 min
   * por defeito — inflacionava mal (ex.: 30+60=90 em vez de 60+60=120).
   */
  private duracaoSomaEtapasMegaPacoteNoBloco(b: AgendaHubBloco): number {
    let sum = 0;
    for (const l of b.linhas) {
      const t = (l.tipo || '').trim().toLowerCase();
      if (t !== 'mega' && t !== 'pacote') continue;
      if (!(l.etapa || '').trim()) continue;
      const ini = l.inicio ? String(l.inicio).trim() : '';
      if (!ini) continue;
      sum += this.duracaoMinutosAgendamento(l);
    }
    return sum;
  }

  /**
   * Início / fim em minutos desde 00:00 (dia da grelha) para o bloco inteiro.
   *
   * Mega/Pacote com vários profissionais: **topo** = horário inicial global do
   * pedido; **altura** = soma das durações das etapas **deste** profissional
   * (ex.: 120 min → até 12:00; outra com 60 min → até 11:00), não o último
   * `fim` absoluto na coluna (que pode ser 12:00 só por encadeamento na API).
   */
  private extentMinutosBloco(
    b: AgendaHubBloco,
  ): { start: number; end: number } | null {
    const dia = this.diaYmd;
    const idAt = String(b.linhas[0]?.id || '').trim();
    const globalStart =
      idAt && this.blocoEMegaOuPacoteComEtapas(b)
        ? this.inicioGlobalMinutosMegaPacote(idAt)
        : null;

    if (globalStart != null && Number.isFinite(globalStart)) {
      const sumDur = this.duracaoSomaEtapasMegaPacoteNoBloco(b);
      const durEfetiva = Math.max(
        AGENDA_SLOT_MIN,
        sumDur > 0 ? sumDur : AGENDA_SLOT_MIN,
      );
      const end = Math.min(GRID_END_MIN, globalStart + durEfetiva);
      if (end <= globalStart) return null;
      return { start: globalStart, end };
    }

    let startMin = Infinity;
    let endMax = -Infinity;
    for (const l of b.linhas) {
      const mi = minutosMeiaNoiteEmBrasilia(l.inicio, dia);
      if (mi == null) continue;
      const iniS = l.inicio ? String(l.inicio).trim() : '';
      const fS = l.fim ? String(l.fim).trim() : '';
      /**
       * Preferir duração = fim − inicio (strings completas). Assim o cartão
       * ocupa o intervalo real (ex.: 90 min) mesmo quando `fim` não passa no
       * mesmo critério de “mesmo dia” que `minutosMeiaNoiteEmBrasilia(fim)`.
       */
      const diffM =
        iniS && fS ? diffMinutesEntreHorarios(iniS, fS) : null;
      let endLine: number;
      if (diffM != null && Number.isFinite(diffM) && diffM > 0) {
        endLine = mi + diffM;
      } else {
        const mf = minutosMeiaNoiteEmBrasilia(l.fim, dia);
        const d = this.duracaoMinutosAgendamento(l);
        endLine = mf != null && mf > mi ? mf : mi + d;
      }
      endLine = Math.min(endLine, GRID_END_MIN);
      startMin = Math.min(startMin, mi);
      endMax = Math.max(endMax, endLine);
    }
    if (
      Number.isFinite(startMin) &&
      Number.isFinite(endMax) &&
      endMax > startMin
    ) {
      return { start: startMin, end: endMax };
    }

    const fallbackStart = this.minutosInicioPreferencialBloco(b);
    if (fallbackStart == null || !Number.isFinite(fallbackStart)) {
      return null;
    }
    const durEfetiva = Math.max(
      AGENDA_SLOT_MIN,
      this.duracaoTotalBlocoMinutos(b),
    );
    const end = Math.min(GRID_END_MIN, fallbackStart + durEfetiva);
    if (end <= fallbackStart) return null;
    return { start: fallbackStart, end };
  }

  topPctBloco(b: AgendaHubBloco): number {
    const ex = this.extentMinutosBloco(b);
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
  alturaPctBloco(b: AgendaHubBloco): number {
    const ex = this.extentMinutosBloco(b);
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
    const top = this.topPctBloco(b);
    const slots = dur / AGENDA_SLOT_MIN;
    const faixasVis = Math.min(AGENDA_SLOT_COUNT, slots + 1);
    const hPct = (faixasVis / AGENDA_SLOT_COUNT) * 100;
    return Math.min(hPct, Math.max(0, 100 - top));
  }

  horaBloco(b: AgendaHubBloco): string {
    const ex = this.extentMinutosBloco(b);
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
   * Mega/Pacote com etapas: primeiro o título (`Mega •` / `Pacote •`), depois só os nomes das etapas.
   */
  itensResumoBloco(b: AgendaHubBloco): string[] {
    const linhas = b.linhas;
    const soMegaOuPacote = linhas.every((l) => {
      const t = (l.tipo || '').trim().toLowerCase();
      return t === 'mega' || t === 'pacote';
    });
    const comEtapaMegaPac = linhas.filter((l) => {
      const t = (l.tipo || '').trim().toLowerCase();
      return (
        (t === 'pacote' || t === 'mega') && (l.etapa || '').trim().length > 0
      );
    });
    if (soMegaOuPacote && comEtapaMegaPac.length > 0) {
      const t0 = (comEtapaMegaPac[0].tipo || '').trim().toLowerCase();
      let pacNome = (comEtapaMegaPac[0].pacote || '').trim();
      if (!pacNome) {
        pacNome = (
          linhas.find((x) => (x.pacote || '').trim())?.pacote || ''
        ).trim();
      }
      const out: string[] = [];
      const seen = new Set<string>();
      if (pacNome) {
        const titulo =
          t0 === 'mega' ? `Mega • ${pacNome}` : `Pacote • ${pacNome}`;
        out.push(titulo);
        seen.add(titulo);
      }
      for (const l of comEtapaMegaPac) {
        const et = (l.etapa || '').trim();
        if (!et || seen.has(et)) continue;
        seen.add(et);
        out.push(et);
      }
      if (out.length) return out;
    }
    const out: string[] = [];
    const seen = new Set<string>();
    for (const l of linhas) {
      const txt = linhaResumoAtendimentoLista(l).trim();
      if (!txt || seen.has(txt)) continue;
      seen.add(txt);
      out.push(txt);
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

  private inicioDoMes(d: Date): Date {
    return new Date(d.getFullYear(), d.getMonth(), 1);
  }

  /**
   * Mini-calendário: só conta pedidos que teriam cartão na grelha (com horário no dia).
   */
  private contagemAgendamentosVisiveisNaGrelhaPorDia(
    items: AtendimentoListaItem[],
  ): Map<string, number> {
    const buckets = new Map<string, AtendimentoListaItem[]>();
    for (const a of items) {
      const ymd = (a.data || '').slice(0, 10);
      if (!/^\d{4}-\d{2}-\d{2}$/.test(ymd)) continue;
      const idAt = String(a.id || '').trim();
      const grupKey = idAt
        ? `id:${idAt}`
        : `nome:${(a.nomeCliente || '').trim().toLowerCase()}`;
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
      if (!porDiaSets.has(ymd)) porDiaSets.set(ymd, new Set());
      porDiaSets.get(ymd)!.add(grupKey);
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

  private carregarDia(): void {
    this.carregandoDia = true;
    const d = this.diaYmd;
    this.api.listAgendamentos(d, d).subscribe({
      next: (items) => {
        this.linhasDia = items;
        this.carregandoDia = false;
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
}
