import {
  Component,
  DestroyRef,
  ElementRef,
  HostListener,
  inject,
  LOCALE_ID,
  OnDestroy,
  OnInit,
} from '@angular/core';
import { CurrencyPipe } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { forkJoin } from 'rxjs';
import { SheetsApiService } from '../../../../core/services/sheets-api.service';
import { AppShellUiService } from '../../../../core/services/app-shell-ui.service';
import { Cliente } from '../../../../core/models/api.models';
import { ClienteCadastroDrawerService } from '../../../../shared/cliente-cadastro-drawer/cliente-cadastro-drawer.service';
import { ClienteAvatarComponent } from '../../../../shared/cliente-avatar/cliente-avatar.component';
import { AppToastService } from '../../../../shared/app-toast/app-toast.service';
import { formatarCpfBr } from '../../../../core/utils/br-document-masks';
import { parseFiltroDataDdMm } from '../../../../core/utils/atendimento-display';
import {
  totaisDebitosPorClienteId,
  type TotaisDebitosCliente,
} from '../../../../core/utils/comanda-status.util';
import { UI_TIP_SHOW_DELAY_MS } from '../../../../shared/ui-tip-trigger/ui-tip-delay';
import { UiTipTriggerComponent } from '../../../../shared/ui-tip-trigger/ui-tip-trigger.component';
import { ClienteDrawerPeriodoFiltroComponent } from '../../../../shared/cliente-drawer-periodo-filtro/cliente-drawer-periodo-filtro.component';
import { ymdValido } from '../../../../shared/cliente-drawer-periodo-filtro/cliente-periodo-filtro.util';
import { TableEmptyComponent } from '../../../../shared/table-empty/table-empty.component';
import { FlipDropdownPanelDirective } from '../../../../shared/flip-dropdown-panel/flip-dropdown-panel.directive';
import { mediaQueryMin } from '../../../../styles/breakpoints';

const CLIENTES_BOTTOM_NAV_OWNER = 'clientes';
type OrdenacaoNome = 'asc' | 'desc';

export type ClienteColunaId =
  | 'email'
  | 'celular'
  | 'nascimento'
  | 'creditos'
  | 'cashback'
  | 'cpf'
  | 'rg'
  | 'hashtags'
  | 'cidade'
  | 'debitos'
  | 'pacotes_em_aberto'
  | 'ultima_avaliacao'
  | 'observacoes';

type ClienteColunaOpcao = { id: ClienteColunaId; label: string };

const CLIENTES_COLUNAS_STORAGE_KEY = 'espacolounge.clientes.colunas-visiveis';

/** Colunas já renderizadas na tabela (as demais só aparecem no menu por enquanto). */
const CLIENTES_COLUNAS_IMPLEMENTADAS = new Set<ClienteColunaId>([
  'email',
  'celular',
  'nascimento',
  'creditos',
  'cashback',
  'cpf',
  'rg',
  'cidade',
  'debitos',
]);

/** Pesos relativos das colunas flexíveis (check/ações ficam em px/rem fixos). */
const CLIENTES_COLUNAS_PESOS: Record<'nome' | ClienteColunaId, number> = {
  nome: 25,
  email: 15,
  celular: 14,
  nascimento: 11,
  creditos: 11,
  cashback: 11,
  cpf: 13,
  rg: 11,
  hashtags: 12,
  cidade: 11,
  debitos: 11,
  pacotes_em_aberto: 14,
  ultima_avaliacao: 13,
  observacoes: 16,
};

const CLIENTES_COLUNAS_PADRAO: ClienteColunaId[] = [
  'email',
  'celular',
  'nascimento',
  'creditos',
  'observacoes',
];

@Component({
  selector: 'app-clientes',
  standalone: true,
  imports: [
    FlipDropdownPanelDirective,
    TableEmptyComponent,
    FormsModule,
    CurrencyPipe,
    ClienteAvatarComponent,
    UiTipTriggerComponent,
    ClienteDrawerPeriodoFiltroComponent,
  ],
  templateUrl: './clientes.component.html',
  styleUrl: './clientes.component.scss',
  providers: [{ provide: LOCALE_ID, useValue: 'pt-BR' }],
})
export class ClientesComponent implements OnInit, OnDestroy {
  private readonly api = inject(SheetsApiService);
  private readonly cadastroDrawer = inject(ClienteCadastroDrawerService);
  private readonly shellUi = inject(AppShellUiService);
  private readonly toast = inject(AppToastService);
  private readonly destroyRef = inject(DestroyRef);
  private readonly hostEl = inject(ElementRef<HTMLElement>);

  /** Viewport do shell ≤767px — Bottom Nav visível (template + registry). */
  shellBottomNavEligible = false;

  carregando = false;
  erro = '';
  itens: Cliente[] = [];
  /** Totais de débitos / comandas em aberto por id do cliente. */
  private totaisDebitosPorCliente = new Map<string, TotaisDebitosCliente>();

  busca = '';
  buscaAberta = false;
  filtrosAbertos = false;
  /** Mobile: exibe checkboxes na lista e permite seleção em lote. */
  modoSelecao = false;
  pulsoToolbarFiltro = false;
  pulsoToolbarBusca = false;
  private readonly duracaoPulsoToolbarMs = 600;
  private tPulsoFiltro = 0;
  private tPulsoBusca = 0;

  filtroStatusAtivos = true;
  filtroStatusInativos = false;
  filtroComCelular = false;
  filtroSemCelular = false;
  filtroComDebito = false;
  filtroSemDebito = false;
  filtroAniversarioInicioYmd = '';
  filtroAniversarioFimYmd = '';
  filtroAvaliacaoMin = 0;
  avaliacaoBalaoAberto = false;
  avaliacaoBalaoLeft = 0;
  avaliacaoBalaoAnimar = false;
  readonly estrelasAvaliacao = [1, 2, 3, 4, 5] as const;
  readonly avaliacaoRotulos: Record<number, string> = {
    1: 'Péssimo',
    2: 'Ruim',
    3: 'Neutro',
    4: 'Bom',
    5: 'Ótimo',
  };

  pagina = 1;
  itensPorPagina = 20;
  readonly opcoesItensPorPagina = [10, 20, 40, 50, 100];
  perPageMenuAberto = false;

  ordenacaoNome: OrdenacaoNome = 'asc';
  /** Tooltip do cabeçalho Nome (só hover; suprimida após clique até sair da célula). */
  nomeSortTipVisivel = false;
  private nomeSortTipSuprimida = false;
  private nomeSortTipShowTimer: ReturnType<typeof setTimeout> | null = null;
  selecionados = new Set<string>();
  excluindoId: string | null = null;
  excluirModalAberto = false;
  clientePendenteExclusao: Cliente | null = null;
  excluindoClienteModal = false;

  colunasMenuAberto = false;
  /** Mantém o menu no DOM durante a animação de fechamento. */
  colunasMenuMontado = false;
  private colunasMenuAnimTimer: ReturnType<typeof setTimeout> | null = null;
  private readonly colunasMenuAnimMs = 200;
  readonly colunasOpcoes: ClienteColunaOpcao[] = [
    { id: 'email', label: 'E-mail' },
    { id: 'celular', label: 'Celular' },
    { id: 'nascimento', label: 'Nascimento' },
    { id: 'creditos', label: 'Créditos' },
    { id: 'cashback', label: 'Cashback' },
    { id: 'cpf', label: 'CPF' },
    { id: 'rg', label: 'RG' },
    { id: 'hashtags', label: 'Hashtags' },
    { id: 'cidade', label: 'Cidade' },
    { id: 'debitos', label: 'Débitos' },
    { id: 'pacotes_em_aberto', label: 'Pacotes em aberto' },
    { id: 'ultima_avaliacao', label: 'Última avaliação' },
    { id: 'observacoes', label: 'Observações' },
  ];
  colunasVisiveis = new Set<ClienteColunaId>(CLIENTES_COLUNAS_PADRAO);

  ngOnInit(): void {
    this.carregarColunasSalvas();
    this.carregar();
    this.setupShellBottomNav();
    this.setupBalaoAvaliacaoCliqueFora();
  }

  ngOnDestroy(): void {
    this.shellUi.clearMobileBottomNavActions(CLIENTES_BOTTOM_NAV_OWNER);
    this.clearNomeSortTipShowTimer();
    this.clearColunasMenuAnimTimer();
  }

  private setupShellBottomNav(): void {
    if (typeof window === 'undefined' || !window.matchMedia) return;
    const shellDesktopMq = window.matchMedia(mediaQueryMin('shellMobile'));
    const apply = (): void => {
      this.shellBottomNavEligible = !shellDesktopMq.matches;
      if (!this.shellBottomNavEligible && this.modoSelecao) {
        this.modoSelecao = false;
        this.selecionados.clear();
      }
      if (!this.shellBottomNavEligible && this.filtrosAbertos) {
        this.filtrosAbertos = false;
      }
      this.syncShellBottomNavActions();
    };
    apply();
    shellDesktopMq.addEventListener('change', apply);
    this.destroyRef.onDestroy(() => {
      shellDesktopMq.removeEventListener('change', apply);
    });
  }

  /**
   * Menu | Filtro | Selecionar | Novo — só em ≤767.
   * Em modo seleção: Cancelar | Selecionar tudo | Ações.
   */
  private syncShellBottomNavActions(): void {
    if (!this.shellBottomNavEligible) {
      this.shellUi.clearMobileBottomNavActions(CLIENTES_BOTTOM_NAV_OWNER);
      return;
    }
    if (this.modoSelecao) {
      this.shellUi.setMobileBottomNavActions(CLIENTES_BOTTOM_NAV_OWNER, [
        {
          id: 'cancelar-selecao',
          label: 'Cancelar',
          ariaLabel: 'Cancelar seleção',
          icon: 'x',
          onClick: () => this.sairModoSelecao(),
        },
        {
          id: 'selecionar-tudo',
          label: 'Selecionar tudo',
          ariaLabel: 'Selecionar todos os clientes',
          icon: 'check',
          active: this.todosFiltradosSelecionados(),
          onClick: () => this.selecionarTodosMobile(),
        },
        {
          id: 'acoes',
          label: 'Ações',
          ariaLabel: 'Ações da seleção',
          icon: 'more',
          accent: true,
          onClick: () => this.onAcoesSelecao(),
        },
      ]);
      return;
    }
    this.shellUi.setMobileBottomNavActions(CLIENTES_BOTTOM_NAV_OWNER, [
      {
        id: 'filtro',
        label: 'Filtro',
        ariaLabel: 'Abrir filtros',
        icon: 'filter',
        active: this.filtrosAbertos,
        warn: this.temFiltroAtivo(),
        onClick: () => this.toggleFiltros(),
      },
      {
        id: 'selecionar',
        label: 'Selecionar',
        ariaLabel: 'Selecionar clientes',
        icon: 'check',
        active: false,
        onClick: () => this.entrarModoSelecao(),
      },
      {
        id: 'novo',
        label: 'Novo',
        ariaLabel: 'Novo cliente',
        icon: 'plus',
        accent: true,
        onClick: () => this.onNovoCliente(),
      },
    ]);
  }

  /** Filtros além do padrão (só Ativos). */
  temFiltroAtivo(): boolean {
    return this.filtrosAtivosBadges().length > 0;
  }

  filtrosAtivosBadges(): { id: string; label: string }[] {
    const badges: { id: string; label: string }[] = [];
    const soAtivos =
      this.filtroStatusAtivos && !this.filtroStatusInativos;
    if (!soAtivos) {
      if (this.filtroStatusAtivos && this.filtroStatusInativos) {
        badges.push({ id: 'status-ambos', label: 'Ativos e Inativos' });
      } else if (this.filtroStatusInativos) {
        badges.push({ id: 'status-inativos', label: 'Inativos' });
      } else if (!this.filtroStatusAtivos && !this.filtroStatusInativos) {
        badges.push({ id: 'status-nenhum', label: 'Sem status' });
      }
    }
    if (this.filtroComCelular) {
      badges.push({ id: 'cel-com', label: 'Com celular' });
    }
    if (this.filtroSemCelular) {
      badges.push({ id: 'cel-sem', label: 'Sem celular' });
    }
    if (this.filtroComDebito) {
      badges.push({ id: 'deb-com', label: 'Com débito' });
    }
    if (this.filtroSemDebito) {
      badges.push({ id: 'deb-sem', label: 'Sem débito' });
    }
    const ini = this.filtroAniversarioInicioYmd.trim();
    const fim = this.filtroAniversarioFimYmd.trim();
    if (ini || fim) {
      badges.push({ id: 'aniversario', label: 'Aniversário' });
    }
    if (this.filtroAvaliacaoMin > 0) {
      badges.push({
        id: 'avaliacao',
        label: `${this.filtroAvaliacaoMin}+ estrelas`,
      });
    }
    return badges;
  }

  removerFiltroBadge(id: string, ev?: Event): void {
    ev?.stopPropagation();
    switch (id) {
      case 'status-ambos':
      case 'status-inativos':
      case 'status-nenhum':
        this.filtroStatusAtivos = true;
        this.filtroStatusInativos = false;
        break;
      case 'cel-com':
        this.filtroComCelular = false;
        break;
      case 'cel-sem':
        this.filtroSemCelular = false;
        break;
      case 'deb-com':
        this.filtroComDebito = false;
        break;
      case 'deb-sem':
        this.filtroSemDebito = false;
        break;
      case 'aniversario':
        this.filtroAniversarioInicioYmd = '';
        this.filtroAniversarioFimYmd = '';
        break;
      case 'avaliacao':
        this.filtroAvaliacaoMin = 0;
        break;
      default:
        break;
    }
    this.pagina = 1;
    this.syncShellBottomNavActions();
  }

  entrarModoSelecao(): void {
    if (this.filtrosAbertos) this.fecharFiltros();
    this.modoSelecao = true;
    this.syncShellBottomNavActions();
  }

  sairModoSelecao(): void {
    this.modoSelecao = false;
    this.selecionados.clear();
    this.syncShellBottomNavActions();
  }

  /** @deprecated use entrar/sair — mantido para compat. */
  toggleModoSelecao(): void {
    if (this.modoSelecao) this.sairModoSelecao();
    else this.entrarModoSelecao();
  }

  todosFiltradosSelecionados(): boolean {
    const list = this.filtrados();
    return list.length > 0 && list.every((c) => this.selecionados.has(c.id));
  }

  selecionarTodosMobile(): void {
    this.toast.showLoading('Selecionando...');
    for (const c of this.filtrados()) {
      this.selecionados.add(c.id);
    }
    this.syncShellBottomNavActions();
  }

  onAcoesSelecao(): void {
    if (this.selecionados.size === 0) {
      this.toast.showWarning('Selecione ao menos um cliente.');
      return;
    }
    this.toast.showInfo(`${this.selecionados.size} selecionado(s)`);
  }

  carregar(): void {
    this.carregando = true;
    this.erro = '';
    forkJoin({
      clientes: this.api.listClientes(),
      atendimentos: this.api.listAgendamentos(),
    }).subscribe({
      next: ({ clientes, atendimentos }) => {
        this.itens = clientes ?? [];
        this.totaisDebitosPorCliente = totaisDebitosPorClienteId(
          atendimentos ?? [],
        );
        this.carregando = false;
        this.pagina = 1;
        this.selecionados.clear();
      },
      error: (e: Error) => {
        this.erro =
          e.message ||
          'Não foi possível carregar clientes. Tente novamente.';
        this.carregando = false;
      },
    });
  }

  get buscaPlaceholder(): string {
    return this.buscaAberta ? 'Digite para buscar' : '';
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
      return;
    }
    window.clearTimeout(this.tPulsoFiltro);
    this.pulsoToolbarFiltro = false;
    queueMicrotask(() => {
      this.pulsoToolbarFiltro = true;
      this.tPulsoFiltro = window.setTimeout(() => {
        this.pulsoToolbarFiltro = false;
      }, this.duracaoPulsoToolbarMs);
    });
  }

  fecharPainelBusca(): void {
    this.buscaAberta = false;
  }

  onBuscaWrapClick(): void {
    if (!this.buscaAberta) {
      this.dispararPulsoToolbar('busca');
      this.buscaAberta = true;
      queueMicrotask(() => {
        document.getElementById('clientes-busca-input')?.focus();
      });
    }
  }

  onBuscaInput(): void {
    this.pagina = 1;
  }

  onBuscaEnter(ev: Event): void {
    ev.preventDefault();
    this.onBuscar();
  }

  onBuscar(): void {
    this.pagina = 1;
  }

  toggleFiltros(ev?: Event): void {
    ev?.stopPropagation();
    if (this.modoSelecao) return;
    this.dispararPulsoToolbar('filtro');
    this.filtrosAbertos = !this.filtrosAbertos;
    this.syncShellBottomNavActions();
  }

  fecharFiltros(): void {
    if (!this.filtrosAbertos) return;
    this.avaliacaoBalaoAberto = false;
    this.filtrosAbertos = false;
    this.syncShellBottomNavActions();
  }

  onMobileItemClick(c: Cliente, ev: Event): void {
    if (this.modoSelecao) {
      ev.preventDefault();
      ev.stopPropagation();
      this.toggleSelecionadoCliente(c);
      this.syncShellBottomNavActions();
      return;
    }
    this.abrirPerfilCliente(c, ev);
  }

  private toggleSelecionadoCliente(c: Cliente): void {
    if (this.selecionados.has(c.id)) this.selecionados.delete(c.id);
    else this.selecionados.add(c.id);
  }

  toggleFiltroStatus(which: 'ativos' | 'inativos', ev: Event): void {
    const checked = (ev.target as HTMLInputElement).checked;
    if (which === 'ativos') this.filtroStatusAtivos = checked;
    else this.filtroStatusInativos = checked;
    this.pagina = 1;
    this.syncShellBottomNavActions();
  }

  toggleFiltroCelular(which: 'com' | 'sem', ev: Event): void {
    const checked = (ev.target as HTMLInputElement).checked;
    if (which === 'com') this.filtroComCelular = checked;
    else this.filtroSemCelular = checked;
    this.pagina = 1;
    this.syncShellBottomNavActions();
  }

  toggleFiltroDebito(which: 'com' | 'sem', ev: Event): void {
    const checked = (ev.target as HTMLInputElement).checked;
    if (which === 'com') this.filtroComDebito = checked;
    else this.filtroSemDebito = checked;
    this.pagina = 1;
    this.syncShellBottomNavActions();
  }

  onAniversarioPeriodoAlterado(): void {
    this.pagina = 1;
    this.syncShellBottomNavActions();
  }

  definirFiltroAvaliacao(n: number, ev?: Event, mostrarBalao = false): void {
    ev?.stopPropagation();
    if (this.filtroAvaliacaoMin === n) {
      this.filtroAvaliacaoMin = 0;
      this.avaliacaoBalaoAberto = false;
      this.avaliacaoBalaoAnimar = false;
      this.pagina = 1;
      this.syncShellBottomNavActions();
      return;
    }
    const balaoJaAberto = this.avaliacaoBalaoAberto && mostrarBalao;
    this.filtroAvaliacaoMin = n;
    this.avaliacaoBalaoAnimar = balaoJaAberto;
    if (mostrarBalao) {
      this.atualizarPosicaoBalaoAvaliacao();
      this.avaliacaoBalaoAberto = true;
      if (!balaoJaAberto) {
        requestAnimationFrame(() => {
          this.avaliacaoBalaoAnimar = true;
        });
      }
    } else {
      this.avaliacaoBalaoAberto = false;
    }
    this.pagina = 1;
    this.syncShellBottomNavActions();
  }

  rotuloFiltroAvaliacao(n: number): string {
    return this.avaliacaoRotulos[n] ?? '';
  }

  private atualizarPosicaoBalaoAvaliacao(): void {
    const wrap = this.hostEl.nativeElement.querySelector(
      '.clientes-filtros-stars--sheet',
    ) as HTMLElement | null;
    const btn = wrap?.querySelector(
      `[data-estrela="${this.filtroAvaliacaoMin}"]`,
    ) as HTMLElement | null;
    if (!wrap || !btn) return;
    const wr = wrap.getBoundingClientRect();
    const br = btn.getBoundingClientRect();
    this.avaliacaoBalaoLeft = br.left - wr.left + br.width / 2;
  }

  private setupBalaoAvaliacaoCliqueFora(): void {
    if (typeof document === 'undefined') return;
    const fecharSeFora = (ev: Event): void => {
      if (!this.avaliacaoBalaoAberto) return;
      const alvo = ev.target;
      if (
        alvo instanceof Element &&
        alvo.closest('.clientes-filtros-stars--sheet')
      ) {
        return;
      }
      this.avaliacaoBalaoAberto = false;
      this.avaliacaoBalaoAnimar = false;
    };
    document.addEventListener('pointerdown', fecharSeFora, true);
    this.destroyRef.onDestroy(() => {
      document.removeEventListener('pointerdown', fecharSeFora, true);
    });
  }

  onNovoCliente(): void {
    this.cadastroDrawer.abrirNovo('', {
      onSalvo: () => this.carregar(),
    });
  }

  onEditarCliente(c: Cliente): void {
    const id = c.id?.trim();
    if (!id) return;
    this.cadastroDrawer.abrirEdicao(id, {
      nomeLista: c.nome?.trim() ?? '',
      fotoUrlInicial: c.fotoUrl,
      abaInicial: 'Cadastro',
      callbacks: {
        onSalvo: (salvo) => this.atualizarClienteNaLista(salvo),
        onClienteCarregado: (salvo) => this.atualizarClienteNaLista(salvo),
      },
    });
  }

  onExcluirCliente(c: Cliente): void {
    const id = c.id?.trim();
    if (!id || this.excluindoClienteModal) return;
    this.clientePendenteExclusao = c;
    this.excluirModalAberto = true;
  }

  fecharModalExcluirCliente(): void {
    if (this.excluindoClienteModal) return;
    this.excluirModalAberto = false;
    this.clientePendenteExclusao = null;
  }

  confirmarExcluirCliente(): void {
    const c = this.clientePendenteExclusao;
    const id = c?.id?.trim();
    if (!id || this.excluindoClienteModal) {
      this.fecharModalExcluirCliente();
      return;
    }
    this.excluindoId = id;
    this.excluindoClienteModal = true;
    this.erro = '';
    this.api.deleteCliente(id).subscribe({
      next: () => {
        this.excluindoId = null;
        this.excluindoClienteModal = false;
        this.excluirModalAberto = false;
        this.clientePendenteExclusao = null;
        this.selecionados.delete(id);
        if (this.cadastroDrawer.clienteId === id) {
          this.cadastroDrawer.fechar();
        }
        this.carregar();
      },
      error: (e: Error) => {
        this.excluindoId = null;
        this.excluindoClienteModal = false;
        this.erro =
          e.message || 'Não foi possível excluir o cliente. Tente novamente.';
      },
    });
  }

  abrirPerfilCliente(cliente: Cliente, ev?: Event): void {
    ev?.preventDefault();
    ev?.stopPropagation();
    const id = cliente.id?.trim();
    if (!id) return;

    this.cadastroDrawer.abrirEdicao(id, {
      nomeLista: cliente.nome?.trim() ?? '',
      fotoUrlInicial: cliente.fotoUrl,
      abaInicial: 'Painel',
      callbacks: {
        onSalvo: (c) => this.atualizarClienteNaLista(c),
        onClienteCarregado: (c) => this.atualizarClienteNaLista(c),
      },
    });
  }

  private atualizarClienteNaLista(c: Cliente): void {
    const id = c.id?.trim();
    if (!id) return;
    const ix = this.itens.findIndex((item) => item.id === id);
    if (ix >= 0) {
      const next = [...this.itens];
      next[ix] = c;
      this.itens = next;
    }
  }

  onSortNomeMouseEnter(): void {
    if (this.nomeSortTipSuprimida) return;
    this.clearNomeSortTipShowTimer();
    this.nomeSortTipShowTimer = setTimeout(() => {
      this.nomeSortTipShowTimer = null;
      if (!this.nomeSortTipSuprimida) {
        this.nomeSortTipVisivel = true;
      }
    }, UI_TIP_SHOW_DELAY_MS);
  }

  onSortNomeMouseLeave(): void {
    this.clearNomeSortTipShowTimer();
    this.nomeSortTipVisivel = false;
    this.nomeSortTipSuprimida = false;
  }

  private clearNomeSortTipShowTimer(): void {
    if (this.nomeSortTipShowTimer != null) {
      clearTimeout(this.nomeSortTipShowTimer);
      this.nomeSortTipShowTimer = null;
    }
  }

  onOrdenarNomeClick(event: MouseEvent): void {
    this.clearNomeSortTipShowTimer();
    this.ordenacaoNome = this.ordenacaoNome === 'asc' ? 'desc' : 'asc';
    this.pagina = 1;
    this.nomeSortTipVisivel = false;
    this.nomeSortTipSuprimida = true;
    (event.currentTarget as HTMLButtonElement | null)?.blur();
  }

  /** Tooltip do cabeçalho Nome (próximo clique alterna a direção). */
  tooltipOrdenacaoNome(): string {
    return this.ordenacaoNome === 'asc'
      ? 'Clique organiza por descendente'
      : 'Clique organiza por ascendente';
  }

  comDadosValidos(): Cliente[] {
    return this.itens.filter((c) => Boolean(c.id?.trim() && c.nome?.trim()));
  }

  filtrados(): Cliente[] {
    let list = this.comDadosValidos();
    const q = this.busca.trim();
    if (q) {
      list = list.filter((c) => this.clienteMatchesBusca(c, q));
    }
    list = list.filter((c) => this.clienteMatchesFiltrosPainel(c));
    const dir = this.ordenacaoNome === 'asc' ? 1 : -1;
    return list.slice().sort((a, b) => {
      const cmp = (a.nome ?? '').localeCompare(b.nome ?? '', 'pt-BR', {
        sensitivity: 'base',
      });
      return cmp * dir;
    });
  }

  private clienteMatchesBusca(c: Cliente, qRaw: string): boolean {
    const q = this.normalizarTextoBusca(qRaw);
    if (!q) return true;

    const qDig = this.apenasDigitos(qRaw);
    const textos = [
      c.nome,
      c.apelido,
      c.email,
      c.cpf,
      c.cnpj,
      c.rg,
    ].map((x) => this.normalizarTextoBusca(String(x ?? '')));

    if (textos.some((t) => t.includes(q))) return true;

    if (qDig.length > 0) {
      const docs = [c.cpf, c.cnpj, c.rg].map((x) =>
        this.apenasDigitos(String(x ?? '')),
      );
      if (docs.some((d) => d.includes(qDig))) return true;

      const fones = [c.celular, c.telefone, c.telefoneFixo].map((x) =>
        this.apenasDigitos(String(x ?? '')),
      );
      if (fones.some((f) => f.length > 0 && f.includes(qDig))) return true;
    }

    return false;
  }

  private clienteMatchesFiltrosPainel(c: Cliente): boolean {
    if (!this.filtroStatusAtivos && !this.filtroStatusInativos) return false;
    if (this.filtroStatusInativos && !this.filtroStatusAtivos) {
      if (c.notificacoesAtivo !== false) return false;
    }

    const temCelular = this.clienteTemCelular(c);
    if (this.filtroComCelular && !temCelular) return false;
    if (this.filtroSemCelular && temCelular) return false;

    const temDebito = this.debitosTotalCliente(c) > 0.005;
    if (this.filtroComDebito && !temDebito) return false;
    if (this.filtroSemDebito && temDebito) return false;

    const ymd = this.aniversarioParaYmd(c.aniversario);
    const ini = this.filtroAniversarioInicioYmd.trim().slice(0, 10);
    const fim = this.filtroAniversarioFimYmd.trim().slice(0, 10);
    const temIni = ymdValido(ini);
    const temFim = ymdValido(fim);
    if (temIni || temFim) {
      if (!ymd) return false;
      if (temIni && ymd < ini) return false;
      if (temFim && ymd > fim) return false;
    }

    if (this.filtroAvaliacaoMin > 0) {
      return false;
    }

    return true;
  }

  private clienteTemCelular(c: Cliente): boolean {
    return [c.celular, c.telefone, c.telefoneFixo].some(
      (x) => this.apenasDigitos(String(x ?? '')).length >= 8,
    );
  }

  private aniversarioParaYmd(raw: string | null | undefined): string | null {
    const s = String(raw ?? '').trim();
    if (!s) return null;
    const ymd = parseFiltroDataDdMm(s);
    if (ymd) return ymd;
    const m = /^(\d{1,2})\/(\d{1,2})(?:\/(\d{2,4}))?$/.exec(s);
    if (!m) return null;
    const dd = m[1].padStart(2, '0');
    const mm = m[2].padStart(2, '0');
    return `2000-${mm}-${dd}`;
  }

  private normalizarTextoBusca(s: string): string {
    return s
      .trim()
      .toLowerCase()
      .normalize('NFD')
      .replace(/\p{M}/gu, '');
  }

  private apenasDigitos(s: string): string {
    return String(s ?? '').replace(/\D/g, '');
  }

  totalFiltrado(): number {
    return this.filtrados().length;
  }

  itensPagina(): Cliente[] {
    const all = this.filtrados();
    const start = (this.pagina - 1) * this.itensPorPagina;
    return all.slice(start, start + this.itensPorPagina);
  }

  totalPaginas(): number {
    const n = this.totalFiltrado();
    return Math.max(1, Math.ceil(n / this.itensPorPagina));
  }

  paginaAnterior(): void {
    if (this.pagina > 1) this.pagina--;
  }

  paginaSeguinte(): void {
    if (this.pagina < this.totalPaginas()) this.pagina++;
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
    this.pagina = 1;
  }

  estaSelecionado(id: string): boolean {
    return this.selecionados.has(id);
  }

  toggleSelecionado(c: Cliente, ev: Event): void {
    const checked = (ev.target as HTMLInputElement).checked;
    if (checked) this.selecionados.add(c.id);
    else this.selecionados.delete(c.id);
  }

  todosDaPaginaSelecionados(): boolean {
    const page = this.itensPagina();
    return page.length > 0 && page.every((c) => this.selecionados.has(c.id));
  }

  toggleSelecionarTodos(ev: Event): void {
    const checked = (ev.target as HTMLInputElement).checked;
    for (const c of this.itensPagina()) {
      if (checked) this.selecionados.add(c.id);
      else this.selecionados.delete(c.id);
    }
  }

  exibirCelular(c: Cliente): string {
    const cel = String(c.celular ?? '').trim();
    const tel = String(c.telefoneFixo ?? c.telefone ?? '').trim();
    return cel || tel || '';
  }

  exibirNascimento(c: Cliente): string {
    const a = String(c.aniversario ?? '').trim();
    return a || '';
  }

  exibirCpf(c: Cliente): string {
    const raw = String(c.cpf ?? '').trim();
    if (!raw) return '';
    const fmt = formatarCpfBr(raw);
    return fmt || raw;
  }

  creditoPositivo(c: Cliente): boolean {
    return (c.creditoSaldo ?? 0) > 0;
  }

  creditoNegativo(c: Cliente): boolean {
    return (c.creditoSaldo ?? 0) < 0;
  }

  debitosTotalCliente(c: Cliente): number {
    return this.totaisDebitosPorCliente.get(c.id)?.debitosTotal ?? 0;
  }

  debitoComValor(c: Cliente): boolean {
    return this.debitosTotalCliente(c) > 0.005;
  }

  exibirDebitos(c: Cliente): string {
    const n = this.debitosTotalCliente(c);
    if (n <= 0.005) return '';
    return n.toLocaleString('pt-BR', {
      style: 'currency',
      currency: 'BRL',
    });
  }

  colunaVisivel(id: ClienteColunaId): boolean {
    return this.colunasVisiveis.has(id);
  }

  /**
   * Largura % da coluna flexível, redistribuída pelos pesos das colunas
   * atualmente visíveis (mantém proporção relativa ao esconder/mostrar).
   */
  larguraColunaFlex(id: 'nome' | ClienteColunaId): string {
    let total = CLIENTES_COLUNAS_PESOS.nome;
    for (const colId of CLIENTES_COLUNAS_IMPLEMENTADAS) {
      if (this.colunasVisiveis.has(colId)) {
        total += CLIENTES_COLUNAS_PESOS[colId];
      }
    }
    if (total <= 0) return '0%';
    const pct = (CLIENTES_COLUNAS_PESOS[id] / total) * 100;
    return `${pct.toFixed(4)}%`;
  }

  totalColunasTabela(): number {
    let visiveisImplementadas = 0;
    for (const id of this.colunasVisiveis) {
      if (CLIENTES_COLUNAS_IMPLEMENTADAS.has(id)) visiveisImplementadas += 1;
    }
    return 2 + visiveisImplementadas + 1;
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

  toggleColuna(id: ClienteColunaId, ev: Event): void {
    const checked = (ev.target as HTMLInputElement).checked;
    if (checked) this.colunasVisiveis.add(id);
    else this.colunasVisiveis.delete(id);
    this.colunasVisiveis = new Set(this.colunasVisiveis);
    this.salvarColunas();
    this.fecharColunasMenu();
  }

  restaurarColunasPadrao(): void {
    this.colunasVisiveis = new Set(CLIENTES_COLUNAS_PADRAO);
    this.salvarColunas();
  }

  exibirCashback(c: Cliente): string {
    const n = c.cashbackSaldo;
    if (n == null || !Number.isFinite(n)) return '';
    return n.toLocaleString('pt-BR', {
      style: 'currency',
      currency: 'BRL',
    });
  }

  exibirRg(c: Cliente): string {
    return String(c.rg ?? '').trim();
  }

  exibirCidade(c: Cliente): string {
    return String(c.cidade ?? '').trim();
  }

  private carregarColunasSalvas(): void {
    try {
      const raw = localStorage.getItem(CLIENTES_COLUNAS_STORAGE_KEY);
      if (!raw) return;
      const parsed = JSON.parse(raw) as unknown;
      if (!Array.isArray(parsed)) return;
      const valid = new Set(this.colunasOpcoes.map((c) => c.id));
      const next = parsed.filter(
        (id): id is ClienteColunaId =>
          typeof id === 'string' && valid.has(id as ClienteColunaId),
      );
      if (next.length > 0) this.colunasVisiveis = new Set(next);
    } catch {
      /* ignore */
    }
  }

  private salvarColunas(): void {
    try {
      localStorage.setItem(
        CLIENTES_COLUNAS_STORAGE_KEY,
        JSON.stringify([...this.colunasVisiveis]),
      );
    } catch {
      /* ignore */
    }
  }

  @HostListener('document:keydown.escape', ['$event'])
  onEscape(ev: KeyboardEvent): void {
    if (ev.defaultPrevented) return;
    if (this.excluirModalAberto) {
      ev.preventDefault();
      ev.stopImmediatePropagation();
      if (!this.excluindoClienteModal) {
        this.fecharModalExcluirCliente();
      }
      return;
    }
    if (this.colunasMenuMontado) {
      ev.preventDefault();
      ev.stopImmediatePropagation();
      this.fecharColunasMenu();
      return;
    }
    if (this.cadastroDrawer.isAberto) {
      // ESC da ficha/pilha: app-cliente-cadastro-drawer-host (um nível por vez).
      return;
    }
    if (this.filtrosAbertos) {
      if (this.avaliacaoBalaoAberto) {
        ev.preventDefault();
        ev.stopImmediatePropagation();
        this.avaliacaoBalaoAberto = false;
        return;
      }
      if (
        document.querySelector(
          '.periodo-filtro__panel--sheet.periodo-filtro__panel--open',
        )
      ) {
        return;
      }
      ev.preventDefault();
      ev.stopImmediatePropagation();
      this.fecharFiltros();
      return;
    }
    if (this.buscaAberta) {
      ev.preventDefault();
      ev.stopImmediatePropagation();
      this.fecharPainelBusca();
      return;
    }
    if (this.perPageMenuAberto) {
      ev.preventDefault();
      ev.stopImmediatePropagation();
      this.perPageMenuAberto = false;
      return;
    }
    if (this.modoSelecao) {
      ev.preventDefault();
      ev.stopImmediatePropagation();
      this.sairModoSelecao();
    }
  }

  @HostListener('document:click', ['$event'])
  onDocumentClick(ev: MouseEvent): void {
    const t = ev.target as HTMLElement | null;
    if (this.buscaAberta && !t?.closest?.('.list-head__busca-wrap')) {
      this.fecharPainelBusca();
    }
    if (
      this.perPageMenuAberto &&
      t &&
      !t.closest('.list-footer__per-page')
    ) {
      this.perPageMenuAberto = false;
    }
    if (
      this.colunasMenuMontado &&
      t &&
      !t.closest('.clientes-th-acoes-wrap')
    ) {
      this.fecharColunasMenu();
    }
  }
}
