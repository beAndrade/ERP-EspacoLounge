import {
  ApplicationRef,
  Component,
  HostListener,
  inject,
  LOCALE_ID,
  OnDestroy,
  OnInit,
  ViewChild,
} from '@angular/core';
import { ActivatedRoute, Router } from '@angular/router';
import { CurrencyPipe, registerLocaleData } from '@angular/common';
import localePt from '@angular/common/locales/pt';
import { FormsModule } from '@angular/forms';
import { catchError, forkJoin, of } from 'rxjs';
import { SheetsApiService } from '../../../../core/services/sheets-api.service';
import {
  AtendimentoListaItem,
  Cliente,
} from '../../../../core/models/api.models';
import type { ComandaResumoPagamentos } from '../../../../core/models/api.models';
import { NovaComandaDrawerComponent } from '../../../agenda/pages/hub/nova-comanda-drawer.component';
import { FaturarDrawerComponent } from '../../../agenda/pages/hub/faturar-drawer.component';
import type { ComandaDrawerContextoAgenda } from '../../../../shared/comanda-drawer/comanda-drawer.types';
import { AgendaNovoComponent } from '../../../agenda/pages/novo/agenda-novo.component';
import type { SaasSelectOption } from '../../../../shared/components/saas-select/saas-select.component';
import {
  dataDdMmBarraAaaa,
  ordenarLinhasAtendimentoInPlace,
  parseFiltroDataDdMm,
  toYmd,
  valorMonetarioParaNumero,
} from '../../../../core/utils/atendimento-display';
import {
  ClienteCadastroDrawerService,
  type AbrirCadastroClientePayload,
} from '../../../../shared/cliente-cadastro-drawer/cliente-cadastro-drawer.service';
import {
  AgendaNovoGlobalService,
  type AgendaNovoGlobalModo,
} from '../../../../shared/agenda-novo-global/agenda-novo-global.service';
import {
  pagamentoColunaFromGrupo,
  statusComandaColunaFromItem,
  type PagamentoColuna,
  type StatusComandaColuna,
} from '../../../../core/utils/comanda-status.util';
import { UiTipTriggerComponent } from '../../../../shared/ui-tip-trigger/ui-tip-trigger.component';
import { tooltipOrdenacaoProximoClique } from '../../../../shared/table-sort-tip.util';
import { ClienteDrawerPeriodoFiltroComponent } from '../../../../shared/cliente-drawer-periodo-filtro/cliente-drawer-periodo-filtro.component';
import {
  mapFormasParaMetodosComanda,
  METODOS_COMANDA_FALLBACK,
} from '../../../../core/utils/fin-formas-pagamento.util';
import { TableEmptyComponent } from '../../../../shared/table-empty/table-empty.component';
import {
  primeiroDiaMesYmdFiltro,
  ultimoDiaMesYmdFiltro,
  ymdToDdMmYyyyFiltro,
} from '../../../financeiro/pages/transacoes/fin-transacoes-filtro.util';
import { FlipDropdownPanelDirective } from '../../../../shared/flip-dropdown-panel/flip-dropdown-panel.directive';

registerLocaleData(localePt);

/** Um grupo por ID de atendimento (mesma lógica que `atendimentos`). */
interface ComandaGrupo {
  id: string;
  data: string;
  nomeCliente: string;
  linhas: AtendimentoListaItem[];
  /** Número global da comanda (#N), espelho de `atendimentos_pedido.numero_comanda`. */
  numeroComanda: number | null;
  valorSubtotal: number | null;
  descontoValor: number | null;
  valorTotal: number | null;
}

type FiltroStatusComandaId = StatusComandaColuna;
type FiltroPagamentoColunaId = PagamentoColuna;

export type ComandaColunaId =
  | 'data'
  | 'status'
  | 'valor'
  | 'pagamento'
  | 'forma_pagamento'
  | 'observacao';

type ComandaColunaOpcao = { id: ComandaColunaId; label: string };

const COMANDAS_COLUNAS_STORAGE_KEY = 'espacolounge.comandas.colunas-visiveis';

const COMANDAS_COLUNAS_IMPLEMENTADAS = new Set<ComandaColunaId>([
  'data',
  'status',
  'valor',
  'pagamento',
  'forma_pagamento',
  'observacao',
]);

/** Padrão: sem Forma de pagamento nem Observação (ficam no fim do menu, off). */
const COMANDAS_COLUNAS_PADRAO: ComandaColunaId[] = [
  'data',
  'status',
  'valor',
  'pagamento',
];

import {
  DRAWER_ANIM_MS,
  beginDrawerCloseAnimation,
  runDrawerOpenAnimation,
} from '../../../../shared/drawer-panel-anim';

const RESUMO_PAGAMENTOS_VAZIO: ComandaResumoPagamentos = {
  total_bruto: 0,
  desconto: 0,
  total: 0,
  total_pago: 0,
  saldo: 0,
  status: 'aberto',
  cobranca_status: null,
};

function formataMoeda(n: number): string {
  return new Intl.NumberFormat('pt-BR', {
    style: 'currency',
    currency: 'BRL',
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(Number.isFinite(n) ? n : 0);
}

@Component({
  selector: 'app-comandas',
  standalone: true,
  imports: [
    FlipDropdownPanelDirective,
    TableEmptyComponent,
    FormsModule,
    CurrencyPipe,
    NovaComandaDrawerComponent,
    FaturarDrawerComponent,
    AgendaNovoComponent,
    UiTipTriggerComponent,
    ClienteDrawerPeriodoFiltroComponent,
  ],
  providers: [{ provide: LOCALE_ID, useValue: 'pt-BR' }],
  templateUrl: './comandas.component.html',
  styleUrl: './comandas.component.scss',
})
export class ComandasComponent implements OnInit, OnDestroy {
  private readonly api = inject(SheetsApiService);
  private readonly route = inject(ActivatedRoute);
  private readonly router = inject(Router);
  private readonly cadastroDrawer = inject(ClienteCadastroDrawerService);
  private readonly agendaNovoGlobal = inject(AgendaNovoGlobalService);
  private readonly appRef = inject(ApplicationRef);

  /** Menu Novo → Comanda: mesmo drawer do botão Novo da lista. */
  private readonly onAgendaNovoAtalho = (
    modo: AgendaNovoGlobalModo,
  ): boolean => {
    if (modo !== 'comanda') return false;
    this.abrirNovoAgendamentoDrawer();
    return true;
  };

  /** `?comanda=id_atendimento` — abre o drawer após carregar a lista. */
  private comandaQueryAbrir: string | null = null;
  private comandaQueryEmAbertura = false;

  readonly dataDdMmBarraAaaa = dataDdMmBarraAaaa;

  carregando = false;
  erro = '';
  grupos: ComandaGrupo[] = [];

  dataInicio = ymdToDdMmYyyyFiltro(primeiroDiaMesYmdFiltro());
  dataFim = ymdToDdMmYyyyFiltro(ultimoDiaMesYmdFiltro());
  periodoInicioYmd = primeiroDiaMesYmdFiltro();
  periodoFimYmd = ultimoDiaMesYmdFiltro();
  filtrosAbertos = false;
  buscaAberta = false;
  busca = '';

  /** Pulse único ao clicar (CSS); azul = Buscar, amarelo = Filtrar. */
  pulsoToolbarBusca = false;
  pulsoToolbarFiltro = false;
  private tPulsoBusca = 0;
  private tPulsoFiltro = 0;
  private readonly duracaoPulsoToolbarMs = 680;

  pagina = 1;
  itensPorPagina = 20;
  readonly opcoesItensPorPagina = [10, 20, 40, 50, 100];
  /** Select nativo não estiliza o painel; menu custom igual ao layout de referência. */
  perPageMenuAberto = false;

  /** Soft-delete ainda não listado na API — «Excluídas» deixa a lista vazia por enquanto. */
  filtroExcluidas = false;
  filtroNaoExcluidas = true;

  readonly filtrosStatusComanda: Array<{
    id: FiltroStatusComandaId;
    label: string;
    badge: string;
  }> = [
    { id: 'pendente', label: 'Pendente', badge: 'badge--warn' },
    { id: 'finalizado', label: 'Finalizado', badge: 'badge--finalizado' },
  ];
  readonly filtrosPagamentoColuna: Array<{
    id: FiltroPagamentoColunaId;
    label: string;
    badge: string;
  }> = [
    { id: 'pago', label: 'Pago', badge: 'badge--ok' },
    {
      id: 'a_receber_cartao',
      label: 'A receber (cartão)',
      badge: 'badge--receber',
    },
    { id: 'em_aberto', label: 'Em aberto', badge: 'badge--warn' },
    { id: 'atrasado', label: 'Atrasado', badge: 'badge--atraso' },
  ];
  filtroStatusComandaSelecionados = new Set<FiltroStatusComandaId>();
  filtroPagamentoColunaSelecionados = new Set<FiltroPagamentoColunaId>();

  private formasOpcoes: Array<{
    value: string;
    rotulo: string;
  }> = METODOS_COMANDA_FALLBACK.map((o) => ({
    value: o.value,
    rotulo: o.rotulo,
  }));
  /** Vazio = nenhuma marcada (sem filtro). Itens = filtrar por esses códigos. */
  private filtroFormas = new Set<string>();
  private opcoesFormaCarregadas = false;
  selecionados = new Set<string>();

  /** Coluna activa e direcção (padrão Ticket descendente — mais recente primeiro). */
  ordenacaoColuna: 'ticket' | 'data' | 'cliente' = 'ticket';
  ordenacaoDir: 'asc' | 'desc' = 'desc';

  colunasMenuAberto = false;
  colunasMenuMontado = false;
  private colunasMenuAnimTimer: ReturnType<typeof setTimeout> | null = null;
  private readonly colunasMenuAnimMs = 200;
  readonly colunasOpcoes: ComandaColunaOpcao[] = [
    { id: 'data', label: 'Data' },
    { id: 'status', label: 'Status' },
    { id: 'valor', label: 'Valor' },
    { id: 'pagamento', label: 'Pagamento' },
    { id: 'forma_pagamento', label: 'Forma de pagamento' },
    { id: 'observacao', label: 'Observação' },
  ];
  colunasVisiveis = new Set<ComandaColunaId>(COMANDAS_COLUNAS_PADRAO);

  excluindoIdAt: string | null = null;
  excluirMassaModalAberto = false;
  excluindoEmMassa = false;
  excluirItemModalAberto = false;
  excluindoItemModal = false;
  grupoPendenteExclusao: ComandaGrupo | null = null;
  get mostrarAcoesEmMassa(): boolean {
    return this.selecionados.size > 0;
  }
  get quantidadeSelecionadaExclusao(): number {
    return this.idsAtSelecionadosParaExclusao().length;
  }

  comandaPainelAberto = false;
  comandaDrawerPanelOpen = false;
  comandaDrawerContexto: ComandaDrawerContextoAgenda | null = null;

  /** Drawer «Novo agendamento» (toolbar «Novo» na lista de comandas). */
  novoAgendamentoAberto = false;
  novoAgendamentoPanelOpen = false;
  novoAgendamentoCtx: {
    data: string;
    profissional_id: number;
    hora?: string;
    id_atendimento?: string;
  } | null = null;

  /** Drawer de edição do agendamento (aberto a partir do botão Editar na comanda). */
  editAgendamentoAberto = false;
  editAgendamentoPanelOpen = false;
  editAgendamentoCtx: {
    data: string;
    profissional_id: number;
    hora?: string;
    id_atendimento?: string;
  } | null = null;
  /** ViewChild do drawer de comanda para chamar `recarregarAposFaturar`. */
  @ViewChild(NovaComandaDrawerComponent)
  comandaDrawerRef?: NovaComandaDrawerComponent;

  @ViewChild(AgendaNovoComponent)
  private agendaEditComandaRef?: AgendaNovoComponent;

  @ViewChild(FaturarDrawerComponent)
  private faturarDrawerRef?: FaturarDrawerComponent;

  /** Sub-drawer Faturar (pagamentos da comanda). */
  faturarDrawerAberto = false;
  faturarDrawerPanelOpen = false;
  faturarCtx: {
    idAtendimento: string;
    resumo: ComandaResumoPagamentos;
    creditoAUsar?: number;
    nomeCliente: string;
    modoVerPagamentos?: boolean;
  } | null = null;
  comandaDataYmdParaFaturar: string | null = null;

  private comandaDrawerCloseTimer: ReturnType<typeof setTimeout> | null = null;
  private novoAgendamentoCloseTimer: ReturnType<typeof setTimeout> | null = null;
  private editAgendamentoCloseTimer: ReturnType<typeof setTimeout> | null = null;
  private faturarDrawerCloseTimer: ReturnType<typeof setTimeout> | null = null;
  private bodyScrollPreDrawer = 0;
  private pageScrollLockAtivo = false;
  private clientesCatalogo: Cliente[] = [];

  ngOnInit(): void {
    this.carregarColunasSalvas();
    this.agendaNovoGlobal.registerPageHandler(this.onAgendaNovoAtalho);
    this.carregando = true;
    this.carregarOpcoesFormasPagamento();
    this.route.queryParamMap.subscribe((params) => {
      const id = (params.get('comanda') ?? '').trim();
      this.comandaQueryAbrir = id || null;
      this.tentarAbrirComandaPorQuery();
      if (params.get('abrirNovaComanda') === '1') {
        queueMicrotask(() => this.abrirNovaComandaDesdeAtalho());
      }
    });

    const di = parseFiltroDataDdMm(this.dataInicio.trim()) ?? undefined;
    const df = parseFiltroDataDdMm(this.dataFim.trim()) ?? undefined;
    forkJoin({
      ags: this.api.listAgendamentos(di, df),
      clientes: this.api.listClientes(),
    }).subscribe({
      next: ({ ags, clientes }) => {
        this.grupos = this.agruparPorIdAtendimento(ags);
        this.clientesCatalogo = clientes ?? [];
        this.sincronizarFormasComGrupos();
        this.selecionados.clear();
        this.pagina = 1;
        this.carregando = false;
        this.tentarAbrirComandaPorQuery();
      },
      error: () => {
        this.carregar();
      },
    });
  }

  ngOnDestroy(): void {
    this.agendaNovoGlobal.unregisterPageHandler(this.onAgendaNovoAtalho);
    window.clearTimeout(this.tPulsoBusca);
    window.clearTimeout(this.tPulsoFiltro);
    if (this.comandaDrawerCloseTimer != null) {
      clearTimeout(this.comandaDrawerCloseTimer);
      this.comandaDrawerCloseTimer = null;
    }
    if (this.editAgendamentoCloseTimer != null) {
      clearTimeout(this.editAgendamentoCloseTimer);
      this.editAgendamentoCloseTimer = null;
    }
    if (this.faturarDrawerCloseTimer != null) {
      clearTimeout(this.faturarDrawerCloseTimer);
      this.faturarDrawerCloseTimer = null;
    }
    this.clearColunasMenuAnimTimer();
    this.desbloquearScrollPagina();
  }

  private dispararPulsoToolbar(which: 'busca' | 'filtro'): void {
    if (which === 'busca') {
      window.clearTimeout(this.tPulsoBusca);
      this.pulsoToolbarBusca = false;
      queueMicrotask(() => {
        this.pulsoToolbarBusca = true;
        this.tPulsoBusca = window.setTimeout(() => {
          this.pulsoToolbarBusca = false;
        }, this.duracaoPulsoToolbarMs);
      });
    } else {
      window.clearTimeout(this.tPulsoFiltro);
      this.pulsoToolbarFiltro = false;
      queueMicrotask(() => {
        this.pulsoToolbarFiltro = true;
        this.tPulsoFiltro = window.setTimeout(() => {
          this.pulsoToolbarFiltro = false;
        }, this.duracaoPulsoToolbarMs);
      });
    }
  }

  @HostListener('document:click', ['$event'])
  fecharMenuPorClickFora(ev: MouseEvent): void {
    const t = ev.target as HTMLElement | null;

    if (
      (this.colunasMenuAberto || this.colunasMenuMontado) &&
      !t?.closest?.('.comandas-th-acoes-wrap')
    ) {
      this.fecharColunasMenu();
    }

    if (this.buscaAberta && !t?.closest?.('.list-head__busca-wrap')) {
      this.fecharPainelBusca();
    }

    if (
      this.perPageMenuAberto &&
      !t?.closest?.('.list-footer__per-page') &&
      !t?.closest?.('.comandas-footer__per-page-dropdown')
    ) {
      this.perPageMenuAberto = false;
    }
  }

  @HostListener('document:keydown.escape', ['$event'])
  fecharBuscaAoEscape(ev: KeyboardEvent): void {
    if (ev.defaultPrevented) return;
    if (this.colunasMenuAberto || this.colunasMenuMontado) {
      ev.preventDefault();
      this.fecharColunasMenu();
      return;
    }
    if (this.excluirItemModalAberto) {
      ev.preventDefault();
      ev.stopImmediatePropagation();
      if (!this.excluindoItemModal) {
        this.fecharModalExcluirItem();
      }
      return;
    }
    if (this.excluirMassaModalAberto) {
      ev.preventDefault();
      ev.stopImmediatePropagation();
      if (!this.excluindoEmMassa) {
        this.fecharModalExcluirEmMassa();
      }
      return;
    }
    if (this.cadastroDrawer.isAberto) {
      // ESC da ficha/pilha: app-cliente-cadastro-drawer-host (um nível por vez).
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
    if (this.editAgendamentoAberto) {
      ev.preventDefault();
      ev.stopImmediatePropagation();
      if (this.agendaEditComandaRef?.tratarEscapeInterno()) return;
      this.fecharEditAgendamento();
      return;
    }
    if (this.comandaPainelAberto) {
      ev.preventDefault();
      ev.stopImmediatePropagation();
      this.fecharComandaDrawer();
      return;
    }
    if (this.novoAgendamentoAberto) {
      ev.preventDefault();
      ev.stopImmediatePropagation();
      this.fecharNovoAgendamento();
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

  /** Fecha apenas o painel de busca (sem pulse): clique fora ou Escape. */
  fecharPainelBusca(): void {
    this.buscaAberta = false;
  }

  get buscaPlaceholder(): string {
    return this.buscaAberta
      ? 'Procure por ticket, cliente, número ou valor...'
      : '';
  }

  onBuscaWrapClick(): void {
    if (!this.buscaAberta) {
      this.abrirPainelBusca();
    }
  }

  private abrirPainelBusca(): void {
    this.dispararPulsoToolbar('busca');
    this.buscaAberta = true;
    queueMicrotask(() => {
      document.getElementById('comandas-busca-input')?.focus();
    });
  }

  /** Alterna aberto/fechado (pulso apenas ao abrir). */
  toggleBusca(): void {
    if (this.buscaAberta) {
      this.fecharPainelBusca();
    } else {
      this.abrirPainelBusca();
    }
  }

  carregar(): void {
    this.carregando = true;
    this.erro = '';
    const diTxt = this.dataInicio.trim();
    const dfTxt = this.dataFim.trim();
    const semFiltroData = !diTxt && !dfTxt;
    const di = diTxt ? parseFiltroDataDdMm(diTxt) : null;
    const df = dfTxt ? parseFiltroDataDdMm(dfTxt) : null;
    if (!semFiltroData && (!diTxt || !dfTxt)) {
      this.carregando = false;
      this.erro = 'Preencha as duas datas ou deixe ambas vazias.';
      return;
    }
    if (!semFiltroData && (!di || !df)) {
      this.carregando = false;
      this.erro = 'Use o formato dia-mês-ano nas duas datas (ex.: 09-04-2026). Também aceita barras.';
      return;
    }
    if (!semFiltroData && di != null && df != null && di > df) {
      this.carregando = false;
      this.erro = 'A data “De” não pode ser depois da data “Até”.';
      return;
    }
    this.api.listAgendamentos(di ?? undefined, df ?? undefined).subscribe({
      next: (items) => {
        this.grupos = this.agruparPorIdAtendimento(items);
        this.sincronizarFormasComGrupos();
        this.selecionados.clear();
        // Mantém a página atual ao recarregar (ex.: fechar drawer de comanda);
        // só ajusta se a lista encolher e a página deixar de existir.
        this.pagina = Math.min(this.pagina, this.totalPaginas());
        this.carregando = false;
        this.tentarAbrirComandaPorQuery();
      },
      error: (e: Error) => {
        this.erro =
          e.message ||
          'Não foi possível carregar as comandas. Tente novamente.';
        this.carregando = false;
      },
    });
  }

  toggleFiltros(ev?: Event): void {
    ev?.stopPropagation();
    this.dispararPulsoToolbar('filtro');
    this.filtrosAbertos = !this.filtrosAbertos;
    if (this.filtrosAbertos) this.carregarOpcoesFormasPagamento();
  }

  onPeriodoFiltroAlterado(): void {
    this.syncDdMmFromPeriodoYmd();
    this.carregar();
  }

  private syncDdMmFromPeriodoYmd(): void {
    this.dataInicio = this.periodoInicioYmd
      ? ymdToDdMmYyyyFiltro(this.periodoInicioYmd)
      : '';
    this.dataFim = this.periodoFimYmd
      ? ymdToDdMmYyyyFiltro(this.periodoFimYmd)
      : '';
  }

  private carregarOpcoesFormasPagamento(): void {
    if (this.opcoesFormaCarregadas) {
      this.sincronizarFormasComGrupos();
      return;
    }
    this.api.listFinFormasPagamentoOpcoes().pipe(catchError(() => of([]))).subscribe({
      next: (formas) => {
        const mapped = mapFormasParaMetodosComanda(formas);
        this.formasOpcoes =
          mapped.length > 0
            ? mapped.map((o) => ({ value: o.value, rotulo: o.rotulo }))
            : METODOS_COMANDA_FALLBACK.map((o) => ({
                value: o.value,
                rotulo: o.rotulo,
              }));
        this.opcoesFormaCarregadas = true;
        this.filtroFormas = new Set();
        this.sincronizarFormasComGrupos();
      },
    });
  }

  private sincronizarFormasComGrupos(): void {
    const byValue = new Map(this.formasOpcoes.map((o) => [o.value, o]));
    for (const g of this.grupos) {
      const codigo = this.codigoMetodoGrupo(g);
      if (!codigo || byValue.has(codigo)) continue;
      const raw = this.formaPagamentoRawGrupo(g);
      byValue.set(codigo, {
        value: codigo,
        rotulo: raw || codigo,
      });
    }
    this.formasOpcoes = [...byValue.values()].sort((a, b) =>
      a.rotulo.localeCompare(b.rotulo, 'pt-BR'),
    );
  }

  formasPagamentoFiltro(): Array<{ value: string; rotulo: string }> {
    return this.formasOpcoes;
  }

  formaPagamentoMarcada(codigo: string): boolean {
    return this.filtroFormas.has(codigo);
  }

  todasFormasSelecionadas(): boolean {
    const todas = this.formasOpcoes;
    return todas.length > 0 && this.filtroFormas.size >= todas.length;
  }

  toggleTodasFormas(ev: Event): void {
    const checked = (ev.target as HTMLInputElement).checked;
    this.filtroFormas = checked
      ? new Set(this.formasOpcoes.map((o) => o.value))
      : new Set();
    this.pagina = 1;
  }

  toggleFiltroFormaPagamento(codigo: string, ev: Event): void {
    const checked = (ev.target as HTMLInputElement).checked;
    if (checked) this.filtroFormas.add(codigo);
    else this.filtroFormas.delete(codigo);
    this.pagina = 1;
  }

  todasPagamentoSelecionadas(): boolean {
    return (
      this.filtroPagamentoColunaSelecionados.size >=
      this.filtrosPagamentoColuna.length
    );
  }

  toggleTodasPagamento(ev: Event): void {
    const checked = (ev.target as HTMLInputElement).checked;
    this.filtroPagamentoColunaSelecionados = checked
      ? new Set(this.filtrosPagamentoColuna.map((f) => f.id))
      : new Set();
    this.pagina = 1;
  }

  private formaPagamentoRawGrupo(g: ComandaGrupo): string {
    return (
      g.linhas.map((l) => (l.pagamentoMetodo ?? '').trim()).find(Boolean) ?? ''
    );
  }

  /** Normaliza `pagamentoMetodo` (código ou rótulo) para o `codigo_interno`. */
  private codigoMetodoGrupo(g: ComandaGrupo): string {
    const raw = this.formaPagamentoRawGrupo(g);
    if (!raw) return 'pendente';
    const lower = raw.toLocaleLowerCase('pt-BR');
    const byValue = this.formasOpcoes.find(
      (o) => o.value === raw || o.value === lower,
    );
    if (byValue) return byValue.value;
    const byRotulo = this.formasOpcoes.find(
      (o) => o.rotulo.toLocaleLowerCase('pt-BR') === lower,
    );
    if (byRotulo) return byRotulo.value;
    const slug = lower
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .replace(/[^a-z0-9]+/g, '_')
      .replace(/^_|_$/g, '');
    const bySlug = this.formasOpcoes.find((o) => o.value === slug);
    if (bySlug) return bySlug.value;
    return slug || raw;
  }

  colunaVisivel(id: ComandaColunaId): boolean {
    return this.colunasVisiveis.has(id);
  }

  totalColunasTabela(): number {
    let n = 0;
    for (const id of this.colunasVisiveis) {
      if (COMANDAS_COLUNAS_IMPLEMENTADAS.has(id)) n += 1;
    }
    // checkbox + ticket + cliente + menu
    return 4 + n;
  }

  toggleColunasMenu(ev: Event): void {
    ev.stopPropagation();
    if (this.colunasMenuAberto) this.fecharColunasMenu();
    else this.abrirColunasMenu();
  }

  abrirColunasMenu(): void {
    this.clearColunasMenuAnimTimer();
    this.colunasMenuMontado = true;
    requestAnimationFrame(() => {
      requestAnimationFrame(() => {
        this.colunasMenuAberto = true;
      });
    });
  }

  fecharColunasMenu(): void {
    if (!this.colunasMenuMontado) return;
    this.colunasMenuAberto = false;
    this.clearColunasMenuAnimTimer();
    this.colunasMenuAnimTimer = setTimeout(() => {
      this.colunasMenuMontado = false;
      this.colunasMenuAnimTimer = null;
    }, this.colunasMenuAnimMs);
  }

  private clearColunasMenuAnimTimer(): void {
    if (this.colunasMenuAnimTimer != null) {
      clearTimeout(this.colunasMenuAnimTimer);
      this.colunasMenuAnimTimer = null;
    }
  }

  toggleColuna(id: ComandaColunaId, ev: Event): void {
    const checked = (ev.target as HTMLInputElement).checked;
    if (checked) this.colunasVisiveis.add(id);
    else this.colunasVisiveis.delete(id);
    this.colunasVisiveis = new Set(this.colunasVisiveis);
    this.salvarColunas();
    this.fecharColunasMenu();
  }

  restaurarColunasPadrao(): void {
    this.colunasVisiveis = new Set(COMANDAS_COLUNAS_PADRAO);
    this.salvarColunas();
  }

  private carregarColunasSalvas(): void {
    try {
      const raw = localStorage.getItem(COMANDAS_COLUNAS_STORAGE_KEY);
      if (!raw) return;
      const parsed = JSON.parse(raw) as unknown;
      if (!Array.isArray(parsed)) return;
      const valid = new Set(this.colunasOpcoes.map((c) => c.id));
      const next = parsed.filter(
        (x): x is ComandaColunaId =>
          typeof x === 'string' && valid.has(x as ComandaColunaId),
      );
      if (next.length > 0) this.colunasVisiveis = new Set(next);
    } catch {
      /* ignore */
    }
  }

  private salvarColunas(): void {
    try {
      localStorage.setItem(
        COMANDAS_COLUNAS_STORAGE_KEY,
        JSON.stringify([...this.colunasVisiveis]),
      );
    } catch {
      /* ignore */
    }
  }

  /** Rótulo amigável da forma (Pix, Dinheiro…); vazio → «—». */
  rotuloFormaPagamentoGrupo(g: ComandaGrupo): string {
    const codigo = this.codigoMetodoGrupo(g);
    if (!codigo || codigo === 'pendente') {
      const raw = this.formaPagamentoRawGrupo(g);
      return raw || '—';
    }
    const op = this.formasOpcoes.find((o) => o.value === codigo);
    return (op?.rotulo ?? this.formaPagamentoRawGrupo(g)) || '—';
  }

  /** Observação da comanda (`descricaoManual` nas linhas). */
  observacaoGrupo(g: ComandaGrupo): string {
    return (
      g.linhas
        .map((l) => String(l.descricaoManual ?? '').trim())
        .find(Boolean) ?? ''
    );
  }

  toggleFiltroExcluidas(ev: Event): void {
    const checked = (ev.target as HTMLInputElement).checked;
    if (!checked && !this.filtroNaoExcluidas) {
      (ev.target as HTMLInputElement).checked = true;
      return;
    }
    this.filtroExcluidas = checked;
    this.pagina = 1;
  }

  toggleFiltroNaoExcluidas(ev: Event): void {
    const checked = (ev.target as HTMLInputElement).checked;
    if (!checked && !this.filtroExcluidas) {
      (ev.target as HTMLInputElement).checked = true;
      return;
    }
    this.filtroNaoExcluidas = checked;
    this.pagina = 1;
  }

  onAcoesEmMassaClick(): void {
    if (this.quantidadeSelecionadaExclusao <= 0 || this.excluindoEmMassa) return;
    this.excluirMassaModalAberto = true;
  }

  fecharModalExcluirEmMassa(): void {
    if (this.excluindoEmMassa) return;
    this.excluirMassaModalAberto = false;
  }

  confirmarExcluirEmMassa(): void {
    const ids = this.idsAtSelecionadosParaExclusao();
    if (!ids.length || this.excluindoEmMassa) {
      this.excluirMassaModalAberto = false;
      return;
    }
    const bloqueadas = ids.filter((id) => {
      const g = this.grupos.find((x) => this.idAtendimento(x) === id);
      return g != null && this.comandaBloqueadaParaExclusao(g);
    });
    if (bloqueadas.length > 0) {
      this.erro =
        bloqueadas.length === ids.length
          ? this.motivoExclusaoBloqueadaComanda()
          : `${bloqueadas.length} comanda(s) têm pagamentos e não podem ser excluídas. Remova os pagamentos antes ou desmarque-as.`;
      this.excluirMassaModalAberto = false;
      return;
    }
    this.excluindoEmMassa = true;
    this.erro = '';
    forkJoin(ids.map((id) => this.api.excluirAtendimento(id))).subscribe({
      next: () => {
        this.excluindoEmMassa = false;
        this.excluirMassaModalAberto = false;
        this.selecionados.clear();
        this.carregar();
      },
      error: (e: Error) => {
        this.excluindoEmMassa = false;
        this.erro = e.message || 'Não foi possível excluir as comandas selecionadas.';
      },
    });
  }

  private idsAtSelecionadosParaExclusao(): string[] {
    const ids: string[] = [];
    for (const g of this.grupos) {
      if (!this.selecionados.has(g.id)) continue;
      const idAt = this.idAtendimento(g);
      if (!idAt) continue;
      ids.push(idAt);
    }
    return ids;
  }

  /** Toolbar «Novo»: abre o drawer de novo agendamento (mesmo fluxo da agenda). */
  abrirNovoAgendamentoDrawer(): void {
    this.fecharPainelBusca();
    if (this.cadastroDrawer.isAberto) {
      this.cadastroDrawer.fechar();
    }
    this.novoAgendamentoCtx = {
      data: toYmd(new Date()),
      profissional_id: 0,
      hora: '',
      id_atendimento: undefined,
    };
    this.abrirDrawerComAnimacao(
      () => {
        this.novoAgendamentoAberto = true;
      },
      (open) => {
        this.novoAgendamentoPanelOpen = open;
      },
    );
  }

  /**
   * Atalho sidebar «Novo → Comanda» (`?abrirNovaComanda=1`):
   * mesmo drawer «Nova comanda» do botão Novo da lista.
   */
  private abrirNovaComandaDesdeAtalho(): void {
    if (this.route.snapshot.queryParamMap.get('abrirNovaComanda') !== '1') {
      return;
    }
    if (!this.novoAgendamentoAberto) {
      this.abrirNovoAgendamentoDrawer();
    }
    void this.router.navigate([], {
      relativeTo: this.route,
      queryParams: { abrirNovaComanda: null },
      queryParamsHandling: 'merge',
      replaceUrl: true,
    });
  }

  fecharNovoAgendamento(): void {
    if (!this.novoAgendamentoAberto) return;
    beginDrawerCloseAnimation({
      setPanelOpen: (open) => {
        this.novoAgendamentoPanelOpen = open;
      },
      appRef: this.appRef,
    });
    if (this.novoAgendamentoCloseTimer != null) {
      clearTimeout(this.novoAgendamentoCloseTimer);
    }
    this.novoAgendamentoCloseTimer = setTimeout(() => {
      this.novoAgendamentoCloseTimer = null;
      this.novoAgendamentoAberto = false;
      this.novoAgendamentoCtx = null;
      this.desbloquearScrollSeNenhumDrawerAberto();
    }, DRAWER_ANIM_MS);
  }

  onSalvoNovoAgendamento(): void {
    this.fecharNovoAgendamento();
    this.pagina = 1;
    this.carregar();
  }

  /** Drawer «Nova comanda»: gravou e abre Faturar por cima (sem nova-comanda intermédio). */
  onFaturarDesdeNovoComanda(ev: {
    idAtendimento: string;
    dataYmd: string;
    clienteId: string;
    cliente: Cliente | null;
  }): void {
    this.abrirFaturarComResumoApi(ev.idAtendimento, ev.dataYmd, ev.cliente?.nome ?? '');
  }

  /** Edição de itens com comanda aberta por baixo. */
  onFaturarDesdeEditComanda(ev: {
    idAtendimento: string;
    dataYmd: string;
    clienteId: string;
    cliente: Cliente | null;
  }): void {
    this.abrirFaturarComResumoApi(ev.idAtendimento, ev.dataYmd, ev.cliente?.nome ?? '');
  }

  private abrirFaturarComResumoApi(
    idAtendimento: string,
    dataYmd: string,
    nomeCliente: string,
  ): void {
    const id = (idAtendimento ?? '').trim();
    const ymd = (dataYmd ?? '').trim();
    if (!id) return;
    this.comandaDataYmdParaFaturar =
      /^\d{4}-\d{2}-\d{2}$/.test(ymd) ? ymd : null;
    this.api
      .listComandaPagamentos(id)
      .pipe(
        catchError(() =>
          of({ items: [], resumo: RESUMO_PAGAMENTOS_VAZIO }),
        ),
      )
      .subscribe((r) => {
        this.faturarCtx = {
          idAtendimento: id,
          resumo: r.resumo ?? RESUMO_PAGAMENTOS_VAZIO,
          nomeCliente: nomeCliente.trim(),
        };
        this.abrirDrawerComAnimacao(
          () => {
            this.faturarDrawerAberto = true;
          },
          (open) => {
            this.faturarDrawerPanelOpen = open;
          },
        );
      });
  }

  /** «Criar comanda» no rodapé do agendamento: abre o drawer da comanda por cima. */
  abrirComandaDesdeAgendamento(payload: ComandaDrawerContextoAgenda): void {
    this.comandaDrawerContexto = payload;
    const y = (payload.dataYmd ?? '').trim();
    this.comandaDataYmdParaFaturar =
      /^\d{4}-\d{2}-\d{2}$/.test(y) ? y : null;
    this.abrirDrawerComAnimacao(() => {
      this.comandaPainelAberto = true;
    }, (open) => {
      this.comandaDrawerPanelOpen = open;
    });
  }

  private desbloquearScrollSeNenhumDrawerAberto(): void {
    if (
      this.comandaPainelAberto ||
      this.cadastroDrawer.isAberto ||
      this.faturarDrawerAberto ||
      this.editAgendamentoAberto ||
      this.novoAgendamentoAberto
    ) {
      return;
    }
    this.desbloquearScrollPagina();
  }

  ariaLabelComandaDrawer(): string {
    return this.comandaDrawerContexto?.idAtendimento?.trim()
      ? 'Editando comanda'
      : 'Nova comanda';
  }

  /** Abre o drawer de cadastro vazio (botão «Criar cliente» no agendamento). */
  abrirClienteDrawerNovo(): void {
    this.cadastroDrawer.abrirNovo('', {
      onSalvo: (salvo) => {
        this.atualizarGruposECatalogo();
        const cid = (salvo.id ?? '').trim();
        if (cid) {
          const ix = this.clientesCatalogo.findIndex((c) => c.id === cid);
          if (ix >= 0) {
            const next = [...this.clientesCatalogo];
            next[ix] = salvo;
            this.clientesCatalogo = next;
          } else {
            this.clientesCatalogo = [...this.clientesCatalogo, salvo];
          }
          this.comandaDrawerRef?.recarregarClienteAposSalvarFicha(cid);
        }
        this.agendaEditComandaRef?.aplicarClienteAposCriacao(salvo);
      },
    });
  }

  private atualizarGruposECatalogo(): void {
    const diTxt = this.dataInicio.trim();
    const dfTxt = this.dataFim.trim();
    const semFiltroData = !diTxt && !dfTxt;
    const di = diTxt ? parseFiltroDataDdMm(diTxt) : null;
    const df = dfTxt ? parseFiltroDataDdMm(dfTxt) : null;
    if (
      (!semFiltroData && (!diTxt || !dfTxt || !di || !df)) ||
      (!semFiltroData && di != null && df != null && di > df)
    ) {
      this.carregar();
      this.api.listClientes().subscribe({
        next: (items) => {
          this.clientesCatalogo = items ?? [];
        },
        error: () => {},
      });
      return;
    }
    forkJoin({
      ags: this.api.listAgendamentos(di ?? undefined, df ?? undefined),
      clientes: this.api.listClientes(),
    }).subscribe({
      next: ({ ags, clientes }) => {
        this.grupos = this.agruparPorIdAtendimento(ags);
        this.clientesCatalogo = clientes ?? [];
        this.sincronizarFormasComGrupos();
      },
      error: () => {
        this.carregar();
      },
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

  /** Reuso padrão para abertura animada dos drawers laterais. */
  private abrirDrawerComAnimacao(
    marcarDrawerAberto: () => void,
    setPanelOpen: (open: boolean) => void,
  ): void {
    marcarDrawerAberto();
    this.bloquearScrollPagina();
    runDrawerOpenAnimation({
      setPanelOpen,
      appRef: this.appRef,
    });
  }

  /** Enter / botão direito: fecha o teclado; a lista já filtra em tempo real. */
  onBuscaSubmit(): void {
    const el = document.getElementById('comandas-busca-input');
    if (el instanceof HTMLInputElement) {
      el.blur();
    }
  }

  onBuscaEnter(ev: Event): void {
    ev.preventDefault();
    this.onBuscaSubmit();
  }

  gruposFiltrados(): ComandaGrupo[] {
    const q = this.busca.trim().toLowerCase();
    const qDigits = q.replace(/[^\d]/g, '');
    let list = this.grupos;
    // Lista da API só traz ativas; «Excluídas» sozinha → vazio até haver soft-delete.
    if (!this.filtroNaoExcluidas) {
      list = [];
    }
    if (q) {
      list = list.filter((g) => {
        const nome = (g.nomeCliente || '').toLowerCase();
        const idAt = (g.linhas[0]?.id || '').toLowerCase();
        const ticket = this.rotuloTicket(g).toLowerCase();
        const valor = this.valorExibicao(g);
        const valorBr =
          valor != null
            ? valor.toLocaleString('pt-BR', {
                minimumFractionDigits: 2,
                maximumFractionDigits: 2,
              })
            : '';
        const valorDigits = valorBr.replace(/[^\d]/g, '');
        const valorRaw = valor != null ? String(valor) : '';
        return (
          nome.includes(q) ||
          idAt.includes(q) ||
          ticket.includes(q) ||
          valorBr.toLowerCase().includes(q) ||
          valorRaw.includes(q) ||
          (qDigits.length > 0 && valorDigits.includes(qDigits))
        );
      });
    }
    if (this.filtroStatusComandaSelecionados.size > 0) {
      list = list.filter((g) =>
        this.filtroStatusComandaSelecionados.has(
          statusComandaColunaFromItem(g.linhas[0]),
        ),
      );
    }
    if (this.filtroPagamentoColunaSelecionados.size > 0) {
      list = list.filter((g) =>
        this.filtroPagamentoColunaSelecionados.has(
          this.pagamentoColunaGrupo(g),
        ),
      );
    }
    if (this.filtroFormas.size > 0) {
      list = list.filter((g) =>
        this.filtroFormas.has(this.codigoMetodoGrupo(g)),
      );
    }
    return list.slice().sort((a, b) => this.compararGruposComanda(a, b));
  }

  totalFiltrado(): number {
    return this.gruposFiltrados().length;
  }

  gruposPagina(): ComandaGrupo[] {
    const all = this.gruposFiltrados();
    const start = (this.pagina - 1) * this.itensPorPagina;
    return all.slice(start, start + this.itensPorPagina);
  }

  totalPaginas(): number {
    const n = this.totalFiltrado();
    return Math.max(1, Math.ceil(n / this.itensPorPagina));
  }

  aoMudarItensPorPagina(): void {
    this.pagina = 1;
  }

  togglePerPageMenu(ev: Event): void {
    ev.stopPropagation();
    if (this.carregando) return;
    this.perPageMenuAberto = !this.perPageMenuAberto;
  }

  selecionarItensPorPagina(n: number, ev: Event): void {
    ev.stopPropagation();
    this.itensPorPagina = n;
    this.perPageMenuAberto = false;
    this.aoMudarItensPorPagina();
  }

  paginaAnterior(): void {
    if (this.pagina > 1) this.pagina--;
  }

  paginaSeguinte(): void {
    if (this.pagina < this.totalPaginas()) this.pagina++;
  }

  private prioridadeOrdenacaoStatus(g: ComandaGrupo): number {
    const st = statusComandaColunaFromItem(g.linhas[0]);
    if (st === 'pendente') return 0;
    const pc = this.pagamentoColunaGrupo(g);
    if (pc === 'atrasado') return 1;
    if (pc === 'em_aberto') return 2;
    return 3;
  }

  onOrdenarColuna(
    col: typeof this.ordenacaoColuna,
    event: MouseEvent,
  ): void {
    if (this.ordenacaoColuna === col) {
      this.ordenacaoDir = this.ordenacaoDir === 'asc' ? 'desc' : 'asc';
    } else {
      this.ordenacaoColuna = col;
      this.ordenacaoDir = 'asc';
    }
    this.pagina = 1;
    (event.currentTarget as HTMLButtonElement | null)?.blur();
  }

  tooltipOrdenacao(col: typeof this.ordenacaoColuna): string {
    return tooltipOrdenacaoProximoClique(
      this.ordenacaoColuna,
      this.ordenacaoDir,
      col,
    );
  }

  /**
   * Ordena pela coluna activa (Ticket / Data / Cliente).
   * Desempate: prioridade de status, depois as restantes chaves.
   */
  private compararGruposComanda(a: ComandaGrupo, b: ComandaGrupo): number {
    const dir = this.ordenacaoDir === 'asc' ? 1 : -1;
    const primaria = this.compararOrdenacaoPrimaria(a, b) * dir;
    if (primaria !== 0) return primaria;
    const pa = this.prioridadeOrdenacaoStatus(a);
    const pb = this.prioridadeOrdenacaoStatus(b);
    if (pa !== pb) return pa - pb;
    const cData = b.data.localeCompare(a.data);
    if (cData !== 0) return cData;
    const cTicket = (b.numeroComanda ?? 0) - (a.numeroComanda ?? 0);
    if (cTicket !== 0) return cTicket;
    return a.nomeCliente.localeCompare(b.nomeCliente, 'pt-BR', {
      sensitivity: 'base',
    });
  }

  private compararOrdenacaoPrimaria(a: ComandaGrupo, b: ComandaGrupo): number {
    switch (this.ordenacaoColuna) {
      case 'ticket':
        return (a.numeroComanda ?? 0) - (b.numeroComanda ?? 0);
      case 'data':
        return a.data.localeCompare(b.data);
      case 'cliente':
        return a.nomeCliente.localeCompare(b.nomeCliente, 'pt-BR', {
          sensitivity: 'base',
        });
      default:
        return 0;
    }
  }

  private readonly epsMoeda = 0.005;

  /**
   * Total a pagar (com desconto). Prefere `total` da API; se vier bruto sem desconto,
   * usa `valorTotal` calculado na lista.
   */
  private totalDevidoComanda(g: ComandaGrupo): number {
    const l0 = g.linhas[0];
    const apiTotal = Number(l0?.total);
    const calculado = g.valorTotal;
    if (Number.isFinite(apiTotal) && apiTotal >= 0) {
      if (
        calculado != null &&
        Number.isFinite(calculado) &&
        calculado >= 0
      ) {
        return Math.min(apiTotal, calculado);
      }
      return apiTotal;
    }
    if (calculado != null && Number.isFinite(calculado) && calculado >= 0) {
      return calculado;
    }
    const bruto = Number(l0?.total_bruto);
    if (Number.isFinite(bruto) && bruto > 0) {
      const desc =
        g.descontoValor ??
        valorMonetarioParaNumero(l0?.desconto) ??
        Number(l0?.desconto_num) ??
        0;
      return Math.max(0, Math.round((bruto - desc) * 100) / 100);
    }
    return g.valorSubtotal ?? 0;
  }

  /** Quitada em caixa (sem linha «pendente» em dívida). */
  comandaQuitadaNasCifras(g: ComandaGrupo): boolean {
    if (this.comandaPagamentoPendenteDivida(g)) return false;
    const l0 = g.linhas[0];
    if (l0?.status_cobranca === 'pago') return true;
    const pago = Number(l0?.total_pago ?? 0);
    const saldo = Number(l0?.saldo);
    if (Number.isFinite(saldo) && saldo <= this.epsMoeda && pago > this.epsMoeda) {
      return true;
    }
    const total = this.totalDevidoComanda(g);
    if (
      Number.isFinite(total) &&
      total > 0 &&
      Number.isFinite(pago) &&
      pago + this.epsMoeda >= total
    ) {
      return true;
    }
    const bruto = Number(l0?.total_bruto);
    const desc = this.valorDescontoComandaParaTooltip(g);
    if (
      Number.isFinite(bruto) &&
      bruto > this.epsMoeda &&
      desc != null &&
      desc > this.epsMoeda &&
      Number.isFinite(pago) &&
      pago + this.epsMoeda >= bruto - desc
    ) {
      return true;
    }
    if (Number.isFinite(saldo) && saldo <= this.epsMoeda) return true;
    return false;
  }

  /** `pagamento_status` = pendente quando existe parcela «Pendente» na comanda (dívida). */
  private comandaPagamentoPendenteDivida(g: ComandaGrupo): boolean {
    const ps = String(g.linhas[0]?.pagamentoStatus ?? '').trim().toLowerCase();
    return ps === 'pendente';
  }

  rotuloStatus(g: ComandaGrupo): string {
    return statusComandaColunaFromItem(g.linhas[0]) === 'finalizado'
      ? 'Finalizado'
      : 'Pendente';
  }

  /** Cobrança faturada (`cobranca_status` finalizada) — drawer só leitura. */
  comandaCobrancaFinalizada(g: ComandaGrupo): boolean {
    return statusComandaColunaFromItem(g.linhas[0]) === 'finalizado';
  }

  rotuloMenuAbrirComanda(g: ComandaGrupo): string {
    return this.comandaCobrancaFinalizada(g) ? 'Ver comanda' : 'Editar comanda';
  }

  classeBadgeStatus(g: ComandaGrupo): string {
    return statusComandaColunaFromItem(g.linhas[0]) === 'finalizado'
      ? 'badge--finalizado'
      : 'badge--warn';
  }

  private pagamentoColunaGrupo(g: ComandaGrupo): PagamentoColuna {
    return pagamentoColunaFromGrupo(g, {
      jaQuitadaNasCifras: this.comandaQuitadaNasCifras(g),
    });
  }

  rotuloPagamento(g: ComandaGrupo): string {
    const pc = this.pagamentoColunaGrupo(g);
    if (pc === 'pago') return 'Pago';
    if (pc === 'a_receber_cartao') return 'A receber (cartão)';
    if (pc === 'em_aberto') return 'Em aberto';
    return 'Atrasado';
  }

  classeBadgePagamento(g: ComandaGrupo): string {
    const pc = this.pagamentoColunaGrupo(g);
    if (pc === 'pago') return 'badge--ok';
    if (pc === 'a_receber_cartao') return 'badge--receber';
    if (pc === 'em_aberto') return 'badge--warn';
    return 'badge--atraso';
  }

  toggleFiltroStatusComanda(id: FiltroStatusComandaId): void {
    if (this.filtroStatusComandaSelecionados.has(id)) {
      this.filtroStatusComandaSelecionados.delete(id);
    } else {
      this.filtroStatusComandaSelecionados.add(id);
    }
    this.pagina = 1;
  }

  toggleFiltroPagamentoColuna(id: FiltroPagamentoColunaId): void {
    if (this.filtroPagamentoColunaSelecionados.has(id)) {
      this.filtroPagamentoColunaSelecionados.delete(id);
    } else {
      this.filtroPagamentoColunaSelecionados.add(id);
    }
    this.pagina = 1;
  }

  filtroStatusComandaAtivo(id: FiltroStatusComandaId): boolean {
    return this.filtroStatusComandaSelecionados.has(id);
  }

  filtroPagamentoColunaAtivo(id: FiltroPagamentoColunaId): boolean {
    return this.filtroPagamentoColunaSelecionados.has(id);
  }

  valorExibicao(g: ComandaGrupo): number | null {
    if (this.mostrarIconeDescontoComanda(g)) {
      const bruto = Number(g.linhas[0]?.total_bruto);
      if (Number.isFinite(bruto) && bruto > 0) return bruto;
      if (g.valorSubtotal != null) return g.valorSubtotal;
    }
    const apiTotal = Number(g.linhas[0]?.total);
    if (Number.isFinite(apiTotal) && apiTotal >= 0) return apiTotal;
    return g.valorTotal;
  }

  /** Valor do desconto da comanda (resumo API ou soma da primeira linha). */
  valorDescontoComandaParaTooltip(g: ComandaGrupo): number | null {
    const l0 = g.linhas[0];
    const dn = l0?.desconto_num;
    if (typeof dn === 'number' && Number.isFinite(dn) && dn > this.epsMoeda) {
      return dn;
    }
    if (g.descontoValor != null && g.descontoValor > this.epsMoeda) {
      return g.descontoValor;
    }
    return null;
  }

  /** Ícone de desconto só após faturar (`cobranca_status` = finalizada). */
  mostrarIconeDescontoComanda(g: ComandaGrupo): boolean {
    const cs = String(g.linhas[0]?.cobrancaStatus ?? '').trim().toLowerCase();
    if (cs !== 'finalizada') return false;
    return this.valorDescontoComandaParaTooltip(g) != null;
  }

  textoTooltipDescontoComanda(g: ComandaGrupo): string {
    const v = this.valorDescontoComandaParaTooltip(g);
    if (v == null) return '';
    return `Desconto de ${formataMoeda(v)}`;
  }

  rotuloTicket(g: ComandaGrupo): string {
    const n = g.numeroComanda;
    if (typeof n === 'number' && Number.isFinite(n) && n > 0) {
      return `#${n}`;
    }
    /**
     * Fallback visual: sequência local da listagem (nunca mostrar o id textual bruto).
     * O valor canónico vem de `numero_comanda` da API.
     */
    const idx = this.grupos.findIndex((x) => x.id === g.id);
    return idx >= 0 ? `#${idx + 1}` : '#—';
  }

  private maiorNumeroComandaNosGruposCarregados(): number {
    let m = 0;
    for (const g of this.grupos) {
      const n = g.numeroComanda;
      if (typeof n === 'number' && Number.isFinite(n) && n > m) m = n;
    }
    return m;
  }

  idCliente(g: ComandaGrupo): string | null {
    const id = g.linhas[0]?.idCliente?.trim();
    return id || null;
  }

  idAtendimento(g: ComandaGrupo): string | null {
    const id = g.linhas[0]?.id?.trim();
    return id || null;
  }

  /**
   * Menu da linha: abre o drawer da comanda.
   * Finalizada → visualização (campos readonly + «Ver pagamentos»).
   * Pendente → edição da comanda.
   */
  abrirComandaDoMenu(g: ComandaGrupo, ev: Event): void {
    ev.preventDefault();
    ev.stopPropagation();
    this.abrirDrawerComandaPorGrupo(g);
  }

  /** Abre o drawer de edição do agendamento desta comanda (ex.: a partir do drawer). */
  editarAgendamento(g: ComandaGrupo, ev: Event): void {
    ev.stopPropagation();
    const idAt = this.idAtendimento(g);
    const ymd = (g.data || '').slice(0, 10);
    if (!idAt || !/^\d{4}-\d{2}-\d{2}$/.test(ymd)) return;
    this.abrirDrawerEditAgendamento(idAt, ymd);
  }

  abrirDrawerComanda(g: ComandaGrupo, ev: Event): void {
    ev.preventDefault();
    ev.stopPropagation();
    this.abrirDrawerComandaPorGrupo(g);
  }

  private limparQueryComanda(): void {
    void this.router.navigate([], {
      queryParams: { comanda: null },
      queryParamsHandling: 'merge',
      replaceUrl: true,
    });
  }

  /** Abre comanda a partir de `?comanda=` (ex.: link «Visualizar» na ficha do cliente). */
  private tentarAbrirComandaPorQuery(): void {
    const idAt = this.comandaQueryAbrir?.trim();
    if (!idAt || this.carregando || this.comandaQueryEmAbertura) return;

    const local = this.grupos.find((gr) => this.idAtendimento(gr) === idAt);
    if (local) {
      this.comandaQueryAbrir = null;
      this.limparQueryComanda();
      this.abrirDrawerComandaPorGrupo(local);
      return;
    }

    this.comandaQueryEmAbertura = true;
    this.api.listAgendamentos(undefined, undefined, idAt).subscribe({
      next: (items) => {
        this.comandaQueryEmAbertura = false;
        if (this.comandaQueryAbrir !== idAt) return;
        const extra = this.agruparPorIdAtendimento(items);
        const g = extra.find((gr) => this.idAtendimento(gr) === idAt);
        if (!g) {
          this.comandaQueryAbrir = null;
          this.limparQueryComanda();
          return;
        }
        const ix = this.grupos.findIndex((gr) => this.idAtendimento(gr) === idAt);
        if (ix >= 0) {
          this.grupos[ix] = g;
        } else {
          this.grupos.push(g);
        }
        this.grupos = [...this.grupos].sort((a, b) =>
          this.compararGruposComanda(a, b),
        );
        this.pagina = 1;
        this.comandaQueryAbrir = null;
        this.limparQueryComanda();
        this.abrirDrawerComandaPorGrupo(g);
      },
      error: () => {
        this.comandaQueryEmAbertura = false;
        if (this.comandaQueryAbrir === idAt) {
          this.comandaQueryAbrir = null;
          this.limparQueryComanda();
        }
      },
    });
  }

  /** Abre o drawer «Visualizando comanda» para o grupo indicado. */
  private abrirDrawerComandaPorGrupo(g: ComandaGrupo): void {
    this.fecharPainelBusca();
    const idAt = this.idAtendimento(g);
    const cid = this.idCliente(g) ?? '';
    if (!idAt || !cid) return;
    const cliente = this.clientesCatalogo.find((c) => c.id === cid) ?? null;
    const nPed = g.linhas[0]?.numeroComanda;
    const numero =
      typeof nPed === 'number' && Number.isFinite(nPed) && nPed > 0
        ? nPed
        : Number(this.rotuloTicket(g).replace(/\D/g, '')) || 1;
    this.comandaDrawerContexto = {
      acessar: true,
      idAtendimento: idAt,
      numeroComandaTitulo: numero,
      clienteId: cid,
      cliente,
      opcoesClientes: this.opcoesClientes(),
      dataYmd: g.data,
      linhasSnapshot: [],
    };
    const y = (g.data || '').slice(0, 10);
    this.comandaDataYmdParaFaturar =
      /^\d{4}-\d{2}-\d{2}$/.test(y) ? y : null;
    this.abrirDrawerComAnimacao(() => {
      this.comandaPainelAberto = true;
    }, (open) => {
      this.comandaDrawerPanelOpen = open;
    });
  }

  abrirDrawerCliente(g: ComandaGrupo, ev: Event): void {
    ev.preventDefault();
    ev.stopPropagation();
    if (this.comandaPainelAberto) {
      this.comandaPainelAberto = false;
      this.comandaDrawerPanelOpen = false;
      this.comandaDrawerContexto = null;
      this.comandaDataYmdParaFaturar = null;
      if (this.comandaDrawerCloseTimer != null) {
        clearTimeout(this.comandaDrawerCloseTimer);
        this.comandaDrawerCloseTimer = null;
      }
    }
    const cid = this.idCliente(g);
    if (!cid) return;
    this.cadastroDrawer.abrirEdicao(cid, {
      nomeLista: g.nomeCliente?.trim() ?? '',
      callbacks: {
        onSalvo: (salvo) => {
          const nomeNovo = String(salvo?.nome ?? '').trim();
          const cidSalvo = String(salvo?.id ?? cid).trim();
          if (cidSalvo && nomeNovo) {
            this.grupos = this.grupos.map((g) =>
              this.idCliente(g) === cidSalvo
                ? { ...g, nomeCliente: nomeNovo }
                : g,
            );
          }
          this.atualizarGruposECatalogo();
        },
      },
    });
  }

  /**
   * Cliente actual para links da sidebar: comanda aberta, edição ou nova comanda.
   */
  private clienteAlvoSidebarCadastro(): {
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
    const ag = this.agendaNovoDrawerAtivo();
    const c = ag?.clienteSelecionado();
    const cidAg = c?.id?.trim();
    if (cidAg) {
      return { cid: cidAg, nomeLista: String(c?.nome ?? '').trim() };
    }
    return null;
  }

  /** `app-agenda-novo` visível (nova comanda ou edição de itens). */
  private agendaNovoDrawerAtivo(): AgendaNovoComponent | undefined {
    if (this.editAgendamentoAberto || this.novoAgendamentoAberto) {
      return this.agendaEditComandaRef;
    }
    return undefined;
  }

  onAbrirCadastroClienteDaComandaSidebar(
    payload: AbrirCadastroClientePayload = {},
  ): void {
    const alvo = this.clienteAlvoSidebarCadastro();
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
          const ix = this.clientesCatalogo.findIndex((cl) => cl.id === cid);
          if (ix >= 0) {
            const next = [...this.clientesCatalogo];
            next[ix] = c;
            this.clientesCatalogo = next;
          }
        },
        onSalvo: (salvo) => {
          this.atualizarGruposECatalogo();
          const cidSalvo = (salvo.id ?? cid).trim();
          const nomeNovo = String(salvo?.nome ?? '').trim();
          if (cidSalvo && nomeNovo) {
            this.grupos = this.grupos.map((g) =>
              this.idCliente(g) === cidSalvo
                ? { ...g, nomeCliente: nomeNovo }
                : g,
            );
          }
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

  fecharComandaDrawer(): void {
    this.fecharComandaDrawerSemRecarregar();
  }

  private fecharComandaDrawerSemRecarregar(): void {
    if (!this.comandaPainelAberto) return;
    this.comandaDrawerPanelOpen = false;
    if (this.faturarDrawerAberto) {
      this.fecharFaturarDrawerSemRecarregar();
    }
    if (this.editAgendamentoAberto) {
      this.editAgendamentoPanelOpen = false;
      if (this.editAgendamentoCloseTimer != null) {
        clearTimeout(this.editAgendamentoCloseTimer);
      }
      this.editAgendamentoCloseTimer = setTimeout(() => {
        this.editAgendamentoCloseTimer = null;
        this.editAgendamentoAberto = false;
        this.editAgendamentoCtx = null;
      }, DRAWER_ANIM_MS);
    }
    if (this.comandaDrawerCloseTimer != null) {
      clearTimeout(this.comandaDrawerCloseTimer);
    }
    this.comandaDrawerCloseTimer = setTimeout(() => {
      this.comandaDrawerCloseTimer = null;
      this.comandaPainelAberto = false;
      this.comandaDrawerContexto = null;
      this.comandaDataYmdParaFaturar = null;
      this.desbloquearScrollSeNenhumDrawerAberto();
    }, DRAWER_ANIM_MS);
  }

  onComandaExcluida(): void {
    this.fecharComandaDrawer();
    this.carregar();
  }

  // ----- Drawer de edição do agendamento (a partir do botão Editar) ---------

  /**
   * Abre o drawer já existente `app-agenda-novo` em modo modal/edição com o
   * `id_atendimento` da comanda actual. Mantém a comanda aberta por baixo;
   * ao salvar/cancelar volta ao drawer da comanda recarregada.
   */
  /**
   * Rodapé «Salvar» no drawer da comanda: com o editor de agendamento aberto,
   * grava o formulário; caso contrário fecha o drawer e volta à lista de comandas.
   */
  onSalvarDesdeDrawerComanda(): void {
    if (this.editAgendamentoAberto && this.agendaEditComandaRef) {
      this.agendaEditComandaRef.salvar();
      return;
    }
    if (this.novoAgendamentoAberto) {
      this.fecharNovoAgendamento();
    }
    this.fecharComandaDrawer();
    void this.router.navigate(['/comandas']).then(() => this.carregar());
  }

  onEditarAgendamentoDesdeComanda(): void {
    const ctx = this.comandaDrawerContexto;
    const idAt = ctx?.idAtendimento?.trim();
    const ymd = (ctx?.dataYmd ?? '').trim();
    if (!idAt || !/^\d{4}-\d{2}-\d{2}$/.test(ymd)) return;
    this.abrirDrawerEditAgendamento(idAt, ymd);
  }

  private abrirDrawerEditAgendamento(idAt: string, ymd: string): void {
    if (this.novoAgendamentoAberto) {
      this.fecharNovoAgendamento();
    }
    this.editAgendamentoCtx = {
      data: ymd,
      profissional_id: 0,
      id_atendimento: idAt,
    };
    this.abrirDrawerComAnimacao(
      () => {
        this.editAgendamentoAberto = true;
      },
      (open) => {
        this.editAgendamentoPanelOpen = open;
      },
    );
  }

  fecharEditAgendamento(): void {
    if (!this.editAgendamentoAberto) return;
    this.editAgendamentoPanelOpen = false;
    if (this.editAgendamentoCloseTimer != null) {
      clearTimeout(this.editAgendamentoCloseTimer);
    }
    this.editAgendamentoCloseTimer = setTimeout(() => {
      this.editAgendamentoCloseTimer = null;
      this.editAgendamentoAberto = false;
      this.editAgendamentoCtx = null;
    }, DRAWER_ANIM_MS);
  }

  /**
   * Após salvar edição: fecha o editor e volta ao drawer «Visualizando comanda»
   * (mantém ou reabre a comanda; actualiza itens e resumo).
   */
  onSalvoEditAgendamento(): void {
    const idAt =
      this.editAgendamentoCtx?.id_atendimento?.trim() ??
      this.comandaDrawerContexto?.idAtendimento?.trim() ??
      '';
    const ymdEdit = (this.editAgendamentoCtx?.data ?? '').trim();
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

    this.fecharEditAgendamento();
    this.carregar();

    if (!idAt) return;

    if (comandaJaAberta) {
      setTimeout(() => {
        this.comandaDrawerRef?.recarregarDadosComanda();
      }, 0);
      return;
    }

    const g = this.grupos.find((gr) => this.idAtendimento(gr) === idAt);
    if (!g) return;
    setTimeout(() => {
      this.abrirDrawerComandaPorGrupo(g);
    }, DRAWER_ANIM_MS);
  }

  onComandaDataYmdAlterada(ymd: string | null): void {
    this.comandaDataYmdParaFaturar = ymd;
    const ctx = this.comandaDrawerContexto;
    if (!ctx) return;
    const next = (ymd ?? '').trim();
    if (!/^\d{4}-\d{2}-\d{2}$/.test(next) || ctx.dataYmd === next) return;
    this.comandaDrawerContexto = { ...ctx, dataYmd: next };
  }

  // ----- Sub-drawer Faturar -------------------------------------------------

  onAbrirFaturarComanda(ev: {
    idAtendimento: string;
    resumo: ComandaResumoPagamentos;
    creditoAUsar?: number;
    dataComandaYmd?: string | null;
    modoVerPagamentos?: boolean;
  }): void {
    const ctx = this.comandaDrawerContexto;
    const nomeCliente = ctx?.cliente?.nome ?? '';
    this.comandaDataYmdParaFaturar =
      ev.dataComandaYmd ?? this.comandaDataYmdParaFaturar;
    this.faturarCtx = {
      idAtendimento: ev.idAtendimento,
      resumo: ev.resumo,
      creditoAUsar: ev.creditoAUsar,
      nomeCliente,
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
    this.fecharFaturarDrawerSemRecarregar(() => {
      this.comandaDrawerRef?.recarregarAposFaturar();
      this.carregar();
    });
  }

  private fecharFaturarDrawerSemRecarregar(aposAnimacao?: () => void): void {
    if (!this.faturarDrawerAberto) return;
    this.faturarDrawerPanelOpen = false;
    if (this.faturarDrawerCloseTimer != null) {
      clearTimeout(this.faturarDrawerCloseTimer);
    }
    this.faturarDrawerCloseTimer = setTimeout(() => {
      this.faturarDrawerCloseTimer = null;
      this.faturarDrawerAberto = false;
      this.faturarCtx = null;
      this.desbloquearScrollSeNenhumDrawerAberto();
      aposAnimacao?.();
    }, DRAWER_ANIM_MS);
  }

  /** Após «Faturar»: fecha drawers, volta à lista e actualiza badges (Status / Pagamento). */
  onFaturaComandaSucesso(): void {
    const modoVer = this.faturarCtx?.modoVerPagamentos ?? false;
    this.fecharFaturarDrawerSemRecarregar(() => {
      if (modoVer) {
        this.comandaDrawerRef?.recarregarAposFaturar();
        this.carregar();
      }
    });
    if (modoVer) {
      return;
    }
    if (this.novoAgendamentoAberto) {
      this.fecharNovoAgendamento();
    }
    this.fecharComandaDrawerSemRecarregar();
    void this.router.navigate(['/comandas']).then(() => this.carregar());
  }

  private opcoesClientes(): SaasSelectOption[] {
    return this.clientesCatalogo.map((c) => ({
      value: c.id,
      label: c.nome.trim() || '—',
    }));
  }

  /** Quitada ou com qualquer valor já recebido — não excluir (opção A). */
  comandaBloqueadaParaExclusao(g: ComandaGrupo): boolean {
    const l0 = g.linhas[0];
    const pago = Number(l0?.total_pago ?? 0);
    if (Number.isFinite(pago) && pago > this.epsMoeda) return true;
    const st = String(l0?.status_cobranca ?? '')
      .trim()
      .toLowerCase();
    return st === 'pago' || st === 'parcial';
  }

  motivoExclusaoBloqueadaComanda(): string {
    return 'Esta comanda tem pagamentos. Remova-os em «Ver pagamentos» antes de excluir.';
  }

  excluir(g: ComandaGrupo, ev: Event): void {
    ev.stopPropagation();
    if (!this.idAtendimento(g) || this.excluindoItemModal) return;
    if (this.comandaBloqueadaParaExclusao(g)) {
      this.erro = this.motivoExclusaoBloqueadaComanda();
      return;
    }
    this.grupoPendenteExclusao = g;
    this.excluirItemModalAberto = true;
  }

  fecharModalExcluirItem(): void {
    if (this.excluindoItemModal) return;
    this.excluirItemModalAberto = false;
    this.grupoPendenteExclusao = null;
  }

  confirmarExcluirItem(): void {
    const g = this.grupoPendenteExclusao;
    const idAt = g ? this.idAtendimento(g) : null;
    if (!idAt || this.excluindoItemModal) {
      this.excluirItemModalAberto = false;
      this.grupoPendenteExclusao = null;
      return;
    }
    this.excluindoIdAt = idAt;
    this.excluindoItemModal = true;
    this.erro = '';
    this.api.excluirAtendimento(idAt).subscribe({
      next: () => {
        this.excluindoIdAt = null;
        this.excluindoItemModal = false;
        this.excluirItemModalAberto = false;
        this.grupoPendenteExclusao = null;
        this.carregar();
      },
      error: (e: Error) => {
        this.excluindoIdAt = null;
        this.excluindoItemModal = false;
        this.excluirItemModalAberto = false;
        this.grupoPendenteExclusao = null;
        this.erro =
          e.message || 'Não foi possível excluir. Tente novamente.';
        this.carregar();
      },
    });
  }

  estaSelecionado(g: ComandaGrupo): boolean {
    return this.selecionados.has(g.id);
  }

  toggleSelecionar(g: ComandaGrupo, ev: Event): void {
    ev.stopPropagation();
    if (this.selecionados.has(g.id)) this.selecionados.delete(g.id);
    else this.selecionados.add(g.id);
    this.selecionados = new Set(this.selecionados);
  }

  toggleSelecionarTodos(ev: Event): void {
    const alvo = ev.target as HTMLInputElement;
    const pag = this.gruposPagina();
    if (alvo.checked) {
      for (const g of pag) this.selecionados.add(g.id);
    } else {
      for (const g of pag) this.selecionados.delete(g.id);
    }
    this.selecionados = new Set(this.selecionados);
  }

  todosDaPaginaSelecionados(): boolean {
    const pag = this.gruposPagina();
    return pag.length > 0 && pag.every((g) => this.selecionados.has(g.id));
  }

  private agruparPorIdAtendimento(
    items: AtendimentoListaItem[],
  ): ComandaGrupo[] {
    const map = new Map<string, AtendimentoListaItem[]>();
    let legacyIdx = 0;
    for (const a of items) {
      const ymd = (a.data || '').slice(0, 10);
      const idAt = String(a.id || '').trim();
      const nome = (a.nomeCliente || '').trim().toLowerCase();
      const key = idAt ? `id:${idAt}` : `${ymd}\u0001legacy:${nome}:${legacyIdx++}`;
      if (!map.has(key)) map.set(key, []);
      map.get(key)!.push(a);
    }

    const grupos: ComandaGrupo[] = [];
    for (const [key, linhas] of map) {
      ordenarLinhasAtendimentoInPlace(linhas);
      const metodoGrupo =
        linhas.map((l) => (l.pagamentoMetodo ?? '').trim()).find(Boolean) ?? '';
      if (metodoGrupo) {
        for (const l of linhas) {
          if (!(l.pagamentoMetodo ?? '').trim()) {
            l.pagamentoMetodo = metodoGrupo;
          }
        }
      }
      const nomeCliente = linhas[0].nomeCliente?.trim() || '';
      const data = (linhas[0].data || '').slice(0, 10);
      let sum = 0;
      let temValor = false;
      for (const l of linhas) {
        const v = valorMonetarioParaNumero(l.valor);
        if (v !== null) {
          sum += v;
          temValor = true;
        }
      }
      const subtotal = temValor ? sum : null;
      const dn = linhas[0]?.desconto_num;
      const descontoApi =
        typeof dn === 'number' && Number.isFinite(dn) && dn > 0 ? dn : null;
      const descontoN = valorMonetarioParaNumero(linhas[0]?.desconto);
      const descontoValor =
        descontoApi ??
        (descontoN !== null && descontoN > 0 ? descontoN : null);
      const apiTotal = Number(linhas[0]?.total);
      let valorTotal = subtotal;
      if (Number.isFinite(apiTotal) && apiTotal >= 0) {
        valorTotal = apiTotal;
      } else if (subtotal !== null && descontoValor !== null) {
        valorTotal = Math.max(
          0,
          Math.round((subtotal - descontoValor) * 100) / 100,
        );
      }
      const n0 = linhas[0]?.numeroComanda;
      const numeroComanda =
        typeof n0 === 'number' && Number.isFinite(n0) && n0 > 0 ? n0 : null;
      grupos.push({
        id: key,
        data,
        nomeCliente,
        linhas,
        numeroComanda,
        valorSubtotal: subtotal,
        descontoValor,
        valorTotal,
      });
    }

    return grupos.sort((a, b) => this.compararGruposComanda(a, b));
  }
}

