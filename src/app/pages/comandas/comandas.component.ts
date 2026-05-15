import {
  Component,
  HostListener,
  inject,
  LOCALE_ID,
  OnDestroy,
  OnInit,
  ViewChild,
} from '@angular/core';
import { Router } from '@angular/router';
import { CurrencyPipe, registerLocaleData } from '@angular/common';
import localePt from '@angular/common/locales/pt';
import { FormsModule } from '@angular/forms';
import { forkJoin, finalize } from 'rxjs';
import { SheetsApiService } from '../../core/services/sheets-api.service';
import { AtendimentoListaItem, Cliente } from '../../core/models/api.models';
import type { ComandaResumoPagamentos } from '../../core/models/api.models';
import { NovaComandaDrawerComponent } from '../agenda-hub/nova-comanda-drawer.component';
import { FaturarDrawerComponent } from '../agenda-hub/faturar-drawer.component';
import type { ComandaDrawerContextoAgenda } from '../agenda-hub/comanda-drawer.types';
import { AgendaNovoComponent } from '../agenda-novo/agenda-novo.component';
import type { SaasSelectOption } from '../agenda-novo/saas-select.component';
import {
  dataDdMmBarraAaaa,
  parseFiltroDataDdMm,
  toYmd,
  ordenarLinhasAtendimentoInPlace,
  valorMonetarioParaNumero,
} from '../../core/utils/atendimento-display';

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

type StatusCobrancaDerivado = 'aberto' | 'pendente' | 'parcial' | 'pago';


/** Payload em JSON na coluna `observacoes` (extras da UI não mapeadas no core da API). */
interface ClienteObsExtras {
  _elCli: 1;
  textoLivre?: string;
  apelido?: string;
  email?: string;
  celular?: string;
  telefoneFixo?: string;
  aniversario?: string;
  cnpj?: string;
  cpf?: string;
  rg?: string;
  fotoUrl?: string;
  notificacoesAtivo?: boolean;
  descontoPadraoTexto?: string;
  descontoPadraoModo?: string;
}

const DRAWER_ANIM_MS = 430;

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
    FormsModule,
    CurrencyPipe,
    NovaComandaDrawerComponent,
    FaturarDrawerComponent,
    AgendaNovoComponent,
  ],
  providers: [{ provide: LOCALE_ID, useValue: 'pt-BR' }],
  templateUrl: './comandas.component.html',
  styleUrl: './comandas.component.scss',
})
export class ComandasComponent implements OnInit, OnDestroy {
  private readonly api = inject(SheetsApiService);
  private readonly router = inject(Router);

  readonly dataDdMmBarraAaaa = dataDdMmBarraAaaa;

  carregando = false;
  erro = '';
  grupos: ComandaGrupo[] = [];

  dataInicio = '';
  dataFim = '';
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

  /** Filtro funcional de status derivado de pagamento da comanda. */
  readonly filtrosStatusPagamento: Array<{
    id: StatusCobrancaDerivado;
    label: string;
  }> = [
    { id: 'aberto', label: 'Em aberto' },
    { id: 'pendente', label: 'Pendente' },
    { id: 'parcial', label: 'Parcial' },
    { id: 'pago', label: 'Pago' },
  ];
  statusPagamentoSelecionados = new Set<StatusCobrancaDerivado>();

  readonly formasPagamentoStub = [
    'Boleto',
    'Cartão de Crédito',
    'Cartão de Débito',
    'Dinheiro',
    'PIX',
    'Transferência',
  ];

  selecionados = new Set<string>();
  menuAbertoParaId: string | null = null;
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

  /** Drawer de edição do agendamento (aberto a partir do botão Editar na comanda). */
  editAgendamentoAberto = false;
  editAgendamentoPanelOpen = false;
  editAgendamentoCtx: {
    data: string;
    profissional_id: number;
    hora?: string;
    id_atendimento?: string;
  } | null = null;
  /** Após salvar/excluir no drawer de edição, recarregar lista + resumo. */
  private editReloadKey = 0;
  /** ViewChild do drawer de comanda para chamar `recarregarAposFaturar`. */
  @ViewChild(NovaComandaDrawerComponent)
  comandaDrawerRef?: NovaComandaDrawerComponent;

  @ViewChild(AgendaNovoComponent)
  private agendaEditComandaRef?: AgendaNovoComponent;

  /** Sub-drawer Faturar (pagamentos da comanda). */
  faturarDrawerAberto = false;
  faturarDrawerPanelOpen = false;
  faturarCtx: {
    idAtendimento: string;
    resumo: ComandaResumoPagamentos;
    nomeCliente: string;
  } | null = null;

  clienteDrawerAberto = false;
  clienteDrawerPanelOpen = false;
  /** Modo atual do drawer de cliente (perfil do cliente clicado). */
  clienteDrawerModo: 'perfil' = 'perfil';
  clienteDrawerNome = '';
  clienteAbaAtiva = 'Cadastro';
  abasCliente = [
    'Cadastro',
    'Painel',
    'Débitos',
    'Créditos',
    'Cashback',
    'Agendamentos',
    'Vendas',
    'Pacotes',
    'Mensagens',
  ] as const;

  cadastroNome = '';
  cadastroApelido = '';
  cadastroCelular = '';
  cadastroTelefone = '';
  cadastroEmail = '';
  cadastroAniversario = '';
  cadastroCnpj = '';
  cadastroCpf = '';
  cadastroRg = '';
  cadastroFotoUrl = '';
  secaoEnderecoAberta = false;
  secaoRedesAberta = false;
  secaoConfiguracoesAberta = true;
  descontoDropdownAberto = false;
  descontoPadraoModo = 'Na comanda';
  /** Valor livre do desconto (UI «% 0,00»); persistência/API pode formatar depois. */
  descontoPadraoTexto = '';
  notificacoesAtivo = true;

  clienteDrawerClienteId: string | null = null;
  /** Snapshot das observações ao hidratar (merge seguro ao salvar). */
  private clienteDrawerObsSnapshot: string | null = null;
  clienteSaveErro = '';
  cadastroSalvando = false;
  notificacoesToggleLiqArmed = false;

  private comandaDrawerCloseTimer: ReturnType<typeof setTimeout> | null = null;
  private clienteDrawerCloseTimer: ReturnType<typeof setTimeout> | null = null;
  private editAgendamentoCloseTimer: ReturnType<typeof setTimeout> | null = null;
  private faturarDrawerCloseTimer: ReturnType<typeof setTimeout> | null = null;
  private bodyScrollPreDrawer = 0;
  private pageScrollLockAtivo = false;
  private clientesCatalogo: Cliente[] = [];

  ngOnInit(): void {
    forkJoin({
      ags: this.api.listAgendamentos(),
      clientes: this.api.listClientes(),
    }).subscribe({
      next: ({ ags, clientes }) => {
        this.grupos = this.agruparPorIdAtendimento(ags);
        this.clientesCatalogo = clientes ?? [];
        this.selecionados.clear();
        this.pagina = 1;
        this.carregando = false;
      },
      error: () => {
        this.carregar();
      },
    });
  }

  ngOnDestroy(): void {
    window.clearTimeout(this.tPulsoBusca);
    window.clearTimeout(this.tPulsoFiltro);
    if (this.comandaDrawerCloseTimer != null) {
      clearTimeout(this.comandaDrawerCloseTimer);
      this.comandaDrawerCloseTimer = null;
    }
    if (this.clienteDrawerCloseTimer != null) {
      clearTimeout(this.clienteDrawerCloseTimer);
      this.clienteDrawerCloseTimer = null;
    }
    if (this.editAgendamentoCloseTimer != null) {
      clearTimeout(this.editAgendamentoCloseTimer);
      this.editAgendamentoCloseTimer = null;
    }
    if (this.faturarDrawerCloseTimer != null) {
      clearTimeout(this.faturarDrawerCloseTimer);
      this.faturarDrawerCloseTimer = null;
    }
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
    if (t?.closest?.('.comandas-row-menu')) return;
    this.menuAbertoParaId = null;

    if (this.descontoDropdownAberto && !t?.closest?.('.cliente-discount')) {
      this.descontoDropdownAberto = false;
    }

    if (this.buscaAberta && !t?.closest?.('.comandas-head__busca-wrap')) {
      this.fecharPainelBusca();
    }

    if (
      this.perPageMenuAberto &&
      !t?.closest?.('.comandas-footer__per-page-dropdown')
    ) {
      this.perPageMenuAberto = false;
    }
  }

  @HostListener('document:keydown.escape', ['$event'])
  fecharBuscaAoEscape(ev: KeyboardEvent): void {
    if (this.clienteDrawerAberto) {
      ev.preventDefault();
      this.fecharClienteDrawer();
      return;
    }
    if (this.faturarDrawerAberto) {
      ev.preventDefault();
      this.fecharFaturarDrawer();
      return;
    }
    if (this.editAgendamentoAberto) {
      ev.preventDefault();
      this.fecharEditAgendamento();
      return;
    }
    if (this.comandaPainelAberto) {
      ev.preventDefault();
      this.fecharComandaDrawer();
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
        this.selecionados.clear();
        this.pagina = 1;
        this.carregando = false;
      },
      error: (e: Error) => {
        this.erro =
          e.message ||
          'Não foi possível carregar as comandas. Tente novamente.';
        this.carregando = false;
      },
    });
  }

  toggleFiltros(): void {
    this.dispararPulsoToolbar('filtro');
    this.filtrosAbertos = !this.filtrosAbertos;
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

  /** Abre o drawer «Nova comanda» reutilizando o fluxo da comanda. */
  abrirNovaComandaDrawer(): void {
    this.menuAbertoParaId = null;
    this.fecharPainelBusca();
    if (this.clienteDrawerAberto) {
      this.clienteDrawerAberto = false;
      this.clienteDrawerPanelOpen = false;
      if (this.clienteDrawerCloseTimer != null) {
        clearTimeout(this.clienteDrawerCloseTimer);
        this.clienteDrawerCloseTimer = null;
      }
      this.descontoDropdownAberto = false;
    }
    this.comandaDrawerContexto = {
      acessar: false,
      idAtendimento: null,
      numeroComandaTitulo: Math.max(
        1,
        this.maiorNumeroComandaNosGruposCarregados() + 1,
      ),
      clienteId: '',
      cliente: null,
      opcoesClientes: this.opcoesClientes(),
      dataYmd: toYmd(new Date()),
      linhasSnapshot: [],
    };
    this.abrirDrawerComAnimacao(() => {
      this.comandaPainelAberto = true;
    }, (open) => {
      this.comandaDrawerPanelOpen = open;
    });
  }

  tituloCabecalhoClienteDrawer(): string {
    return this.clienteDrawerNome.trim() || 'Cliente';
  }

  ariaLabelClienteDrawer(): string {
    return 'Perfil do cliente';
  }

  ariaLabelComandaDrawer(): string {
    return this.comandaDrawerContexto?.idAtendimento?.trim()
      ? 'Editando comanda'
      : 'Nova comanda';
  }

  selecionarAbaCliente(aba: string): void {
    this.clienteAbaAtiva = aba;
  }

  /** Índice da aba ativa para animar a barra direita na `.cliente-nav` (desktop). */
  abaAtivaClienteIndex(): number {
    const lista = this.abasCliente as readonly string[];
    const ix = lista.indexOf(this.clienteAbaAtiva);
    return ix >= 0 ? ix : 0;
  }

  salvarClienteDrawer(): void {
    this.clienteSaveErro = '';
    const nome = this.cadastroNome.trim();
    if (!nome) {
      this.clienteSaveErro = 'O nome é obrigatório.';
      return;
    }
    const telefone = this.telefonePrioritarioParaApi().trim();
    const notas = this.construirObservacoesParaSalvar(this.clienteDrawerObsSnapshot);

    this.cadastroSalvando = true;
    const finalizeFn = (): void => {
      this.cadastroSalvando = false;
    };

    const onOk = (): void => {
      this.atualizarGruposECatalogo();
      this.fecharClienteDrawer();
    };

    const onErr = (e: unknown): void => {
      const msg =
        e instanceof Error
          ? e.message
          : 'Não foi possível salvar o cliente. Tente novamente.';
      this.clienteSaveErro = msg;
    };

    if (this.clienteDrawerClienteId) {
      this.api
        .updateCliente({
          cliente_id: this.clienteDrawerClienteId,
          nome,
          telefone: telefone || undefined,
          notas,
        })
        .pipe(finalize(finalizeFn))
        .subscribe({ next: () => onOk(), error: onErr });
    } else {
      this.api
        .createCliente({
          nome,
          telefone: telefone || undefined,
          notas,
        })
        .pipe(finalize(finalizeFn))
        .subscribe({
          next: () => {
            onOk();
          },
          error: onErr,
        });
    }
  }

  private pulseClienteToggleVisual(ev: Event): void {
    ev.stopPropagation();
    const el = ev.currentTarget;
    if (!(el instanceof HTMLElement)) return;
    el.classList.remove('toggle--pulse');
    void el.offsetWidth;
    el.classList.add('toggle--pulse');
    window.setTimeout(() => {
      el.classList.remove('toggle--pulse');
    }, 1500);
  }

  onNotificacoesToggleClick(ev: Event): void {
    this.pulseClienteToggleVisual(ev);
    this.notificacoesAtivo = !this.notificacoesAtivo;
    this.armNotificacoesToggleLiq();
  }

  onNotificacoesToggleKeydown(ev: KeyboardEvent): void {
    if (ev.key !== 'Enter' && ev.key !== ' ') return;
    ev.preventDefault();
    this.onNotificacoesToggleClick(ev);
  }

  private armNotificacoesToggleLiq(): void {
    if (this.notificacoesToggleLiqArmed) return;
    this.notificacoesToggleLiqArmed = true;
  }

  private lerExtrasObservacoes(obs: string | null | undefined): ClienteObsExtras | null {
    if (obs == null || !String(obs).trim()) return null;
    const s = String(obs).trim();
    try {
      const o = JSON.parse(s) as unknown;
      if (o != null && typeof o === 'object' && '_elCli' in o) {
        const rec = o as { _elCli?: unknown };
        if (rec._elCli === 1) return o as ClienteObsExtras;
      }
    } catch {
      /* legado não-JSON */
    }
    return { _elCli: 1, textoLivre: s };
  }

  private construirObservacoesParaSalvar(obsSnapshot: string | null): string {
    const prev = this.lerExtrasObservacoes(obsSnapshot);
    const textoLivre =
      prev?.textoLivre != null && String(prev.textoLivre).trim().length > 0
        ? String(prev.textoLivre).trim()
        : undefined;
    let fotoUrl: string | undefined;
    const rawFoto = (this.cadastroFotoUrl ?? '').trim();
    if (
      rawFoto.startsWith('http://') ||
      rawFoto.startsWith('https://') ||
      (rawFoto.length > 0 && rawFoto.length <= 80_000)
    ) {
      fotoUrl = rawFoto;
    }
    const payload: ClienteObsExtras = {
      _elCli: 1,
      apelido: this.cadastroApelido.trim(),
      email: this.cadastroEmail.trim(),
      celular: this.cadastroCelular.trim(),
      telefoneFixo: this.cadastroTelefone.trim(),
      aniversario: this.cadastroAniversario.trim(),
      cnpj: this.cadastroCnpj.trim(),
      cpf: this.cadastroCpf.trim(),
      rg: this.cadastroRg.trim(),
      notificacoesAtivo: this.notificacoesAtivo,
      descontoPadraoTexto: this.descontoPadraoTexto.trim(),
      descontoPadraoModo: this.descontoPadraoModo,
    };
    if (typeof textoLivre === 'string') payload.textoLivre = textoLivre;
    if (fotoUrl) payload.fotoUrl = fotoUrl;
    return JSON.stringify(payload);
  }

  private telefonePrioritarioParaApi(): string {
    const c = ComandasComponent.apenasDigitos(this.cadastroCelular);
    const f = ComandasComponent.apenasDigitos(this.cadastroTelefone);
    if (c.length > 0) return this.cadastroCelular.trim();
    if (f.length > 0) return this.cadastroTelefone.trim();
    return '';
  }

  private static apenasDigitos(s: string): string {
    return (s ?? '').replace(/\D/g, '');
  }

  private preencherCadastroClienteInicialDoGrupo(g: ComandaGrupo): void {
    this.clienteDrawerObsSnapshot = null;
    const nomeLista = g.nomeCliente?.trim() || '';
    this.clienteDrawerNome = nomeLista || 'Cliente';
    this.cadastroNome = nomeLista;
    this.cadastroApelido = '';
    this.cadastroCelular = '';
    this.cadastroTelefone = '';
    this.cadastroEmail = '';
    this.cadastroAniversario = '';
    this.cadastroCnpj = '';
    this.cadastroCpf = '';
    this.cadastroRg = '';
    this.cadastroFotoUrl = '';
    this.descontoPadraoModo = 'Na comanda';
    this.descontoPadraoTexto = '';
    this.notificacoesAtivo = true;
  }

  private hidratarClienteNaForm(c: Cliente): void {
    this.clienteDrawerObsSnapshot = c.observacoes ?? null;
    this.cadastroNome = String(c.nome ?? '').trim();
    this.clienteDrawerNome =
      this.cadastroNome || this.clienteDrawerNome || 'Cliente';
    const ex = this.lerExtrasObservacoes(c.observacoes ?? null);

    const celStored = String(ex?.celular ?? '').trim();
    const telStored = String(ex?.telefoneFixo ?? '').trim();
    const apiTel = String(c.telefone ?? '').trim();

    if (celStored.length > 0) {
      this.cadastroCelular = this.formatarTelefone(celStored, true);
    } else if (apiTel.length > 0) {
      this.cadastroCelular = this.formatarTelefone(apiTel, true);
    } else {
      this.cadastroCelular = '';
    }

    if (telStored.length > 0) {
      this.cadastroTelefone = this.formatarTelefone(telStored, false);
    } else {
      this.cadastroTelefone = '';
    }

    if (ex) {
      this.cadastroApelido = ex.apelido ?? '';
      this.cadastroEmail = ex.email ?? '';
      this.cadastroAniversario = ex.aniversario ?? '';
      this.cadastroCnpj = ex.cnpj ?? '';
      this.cadastroCpf = ex.cpf ?? '';
      this.cadastroRg = ex.rg ?? '';
      if (typeof ex.descontoPadraoModo === 'string' && ex.descontoPadraoModo.trim()) {
        this.descontoPadraoModo = ex.descontoPadraoModo;
      }
      if (
        typeof ex.descontoPadraoTexto === 'string' &&
        ex.descontoPadraoTexto.length > 0
      ) {
        this.descontoPadraoTexto = ex.descontoPadraoTexto;
      }
      if (typeof ex.notificacoesAtivo === 'boolean') {
        this.notificacoesAtivo = ex.notificacoesAtivo;
      }
      const foto = typeof ex.fotoUrl === 'string' ? ex.fotoUrl.trim() : '';
      this.cadastroFotoUrl = foto;
    } else {
      this.cadastroApelido = '';
      this.cadastroEmail = '';
      this.cadastroAniversario = '';
      this.cadastroCnpj = '';
      this.cadastroCpf = '';
      this.cadastroRg = '';
    }
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
    setPanelOpen(false);
    queueMicrotask(() => {
      requestAnimationFrame(() => {
        requestAnimationFrame(() => {
          setPanelOpen(true);
        });
      });
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
    const qDigits = q.replace(/[^\\d]/g, '');
    let list = this.grupos;
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
        const valorDigits = valorBr.replace(/[^\\d]/g, '');
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
    if (this.statusPagamentoSelecionados.size > 0) {
      list = list.filter((g) =>
        this.statusPagamentoSelecionados.has(this.statusCobrancaEfetivo(g)),
      );
    }
    return list.slice().sort((a, b) => {
      const pa = this.prioridadeOrdenacaoStatus(a);
      const pb = this.prioridadeOrdenacaoStatus(b);
      if (pa !== pb) return pa - pb;
      const c = a.data.localeCompare(b.data);
      return c !== 0 ? c : a.nomeCliente.localeCompare(b.nomeCliente, 'pt-BR');
    });
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

  statusCobrancaDerivado(g: ComandaGrupo): StatusCobrancaDerivado {
    const s = g.linhas[0]?.status_cobranca;
    if (s === 'aberto' || s === 'pendente' || s === 'parcial' || s === 'pago') {
      return s;
    }
    return 'aberto';
  }

  private prioridadeOrdenacaoStatus(g: ComandaGrupo): number {
    const s = this.statusCobrancaEfetivo(g);
    if (s === 'parcial') return 0;
    if (s === 'pendente') return 1;
    if (s === 'aberto') return 2;
    return 3;
  }

  /**
   * Filtros / ordenação: quitada nas cifras conta como `pago` mesmo com `status_cobranca`
   * ou `pagamento_status` legados «parcial».
   */
  statusCobrancaEfetivo(g: ComandaGrupo): StatusCobrancaDerivado {
    if (this.comandaQuitadaNasCifras(g)) return 'pago';
    return this.statusCobrancaDerivado(g);
  }

  private readonly epsMoeda = 0.005;

  /** Quitada (inclui pagamento com excesso para crédito). */
  comandaQuitadaNasCifras(g: ComandaGrupo): boolean {
    const l0 = g.linhas[0];
    if (l0?.status_cobranca === 'pago') return true;
    const saldo = Number(l0?.saldo);
    if (Number.isFinite(saldo) && saldo <= this.epsMoeda) return true;
    const total = Number(l0?.total);
    const pago = Number(l0?.total_pago);
    if (
      Number.isFinite(total) &&
      total > 0 &&
      Number.isFinite(pago) &&
      pago + this.epsMoeda >= total
    ) {
      return true;
    }
    return false;
  }

  rotuloStatus(g: ComandaGrupo): string {
    const l0 = g.linhas[0];
    const cs = String(l0?.cobrancaStatus ?? '').trim().toLowerCase();
    if (cs === 'finalizada') {
      return 'Finalizado';
    }
    const s = this.statusCobrancaDerivado(g);
    if (s === 'aberto') return 'Em aberto';
    if (s === 'pendente') return 'Pendente';
    if (s === 'parcial') return 'Parcial';
    return 'Pago';
  }

  rotuloPagamento(g: ComandaGrupo): string {
    const l0 = g.linhas[0];
    const cs = String(l0?.cobrancaStatus ?? '').trim().toLowerCase();
    if (cs !== 'finalizada') {
      return '—';
    }
    if (this.comandaQuitadaNasCifras(g)) {
      return 'Pago';
    }
    const ps = String(l0?.pagamentoStatus ?? '').trim().toLowerCase();
    if (ps === 'confirmado') return 'Pago';
    if (ps === 'pendente') return 'Pendente';
    if (ps === 'parcial') return 'Parcial';
    return 'Pendente';
  }

  classeBadgeStatus(g: ComandaGrupo): string {
    const l0 = g.linhas[0];
    const cs = String(l0?.cobrancaStatus ?? '').trim().toLowerCase();
    if (cs === 'finalizada') {
      return 'badge--finalizado';
    }
    const s = this.statusCobrancaDerivado(g);
    if (s === 'pago') return 'badge--ok';
    if (s === 'parcial') return 'badge--warn';
    if (s === 'pendente') return 'badge--info';
    return 'badge--aviso';
  }

  classeBadgePagamento(g: ComandaGrupo): string {
    const l0 = g.linhas[0];
    const cs = String(l0?.cobrancaStatus ?? '').trim().toLowerCase();
    if (cs !== 'finalizada') {
      return 'badge--aviso';
    }
    if (this.comandaQuitadaNasCifras(g)) {
      return 'badge--ok';
    }
    const ps = String(l0?.pagamentoStatus ?? '').trim().toLowerCase();
    if (ps === 'confirmado') return 'badge--ok';
    if (ps === 'parcial') return 'badge--warn';
    if (ps === 'pendente') return 'badge--warn';
    return 'badge--info';
  }

  resumoParcial(g: ComandaGrupo): string {
    if (this.comandaQuitadaNasCifras(g)) return '';
    const l0 = g.linhas[0];
    const pago = Number(l0?.total_pago ?? 0) || 0;
    const total = Number(l0?.total ?? g.valorTotal ?? 0) || 0;
    if (this.statusCobrancaDerivado(g) !== 'parcial') return '';
    return `${formataMoeda(pago)} de ${formataMoeda(total)}`;
  }

  saldoAtrasadoMaisDe7Dias(g: ComandaGrupo): boolean {
    const s = this.statusCobrancaEfetivo(g);
    if (s === 'pago') return false;
    const saldo = Number(g.linhas[0]?.saldo ?? 0) || 0;
    if (saldo <= 0) return false;
    const dt = new Date(`${g.data}T00:00:00`);
    if (Number.isNaN(dt.getTime())) return false;
    const hoje = new Date();
    hoje.setHours(0, 0, 0, 0);
    const diffDias = Math.floor((hoje.getTime() - dt.getTime()) / 86_400_000);
    return diffDias > 7;
  }

  toggleFiltroStatusPagamento(id: StatusCobrancaDerivado): void {
    if (this.statusPagamentoSelecionados.has(id)) {
      this.statusPagamentoSelecionados.delete(id);
    } else {
      this.statusPagamentoSelecionados.add(id);
    }
    this.pagina = 1;
  }

  filtroStatusAtivo(id: StatusCobrancaDerivado): boolean {
    return this.statusPagamentoSelecionados.has(id);
  }

  limparFiltrosStatusPagamento(): void {
    this.statusPagamentoSelecionados.clear();
    this.pagina = 1;
  }

  valorExibicao(g: ComandaGrupo): number | null {
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

  mostrarIconeDescontoComanda(g: ComandaGrupo): boolean {
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

  editar(g: ComandaGrupo, ev: Event): void {
    ev.stopPropagation();
    this.menuAbertoParaId = null;
    const idAt = this.idAtendimento(g);
    if (!idAt) return;
    void this.router.navigate(['/agenda/novo'], {
      queryParams: { atendimento: idAt },
    });
  }

  abrirDrawerComanda(g: ComandaGrupo, ev: Event): void {
    ev.preventDefault();
    ev.stopPropagation();
    this.menuAbertoParaId = null;
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
      if (this.comandaDrawerCloseTimer != null) {
        clearTimeout(this.comandaDrawerCloseTimer);
        this.comandaDrawerCloseTimer = null;
      }
    }
    this.clienteSaveErro = '';
    this.cadastroSalvando = false;
    this.notificacoesToggleLiqArmed = false;
    this.clienteDrawerModo = 'perfil';
    this.clienteDrawerClienteId = this.idCliente(g);
    this.preencherCadastroClienteInicialDoGrupo(g);
    this.clienteAbaAtiva = 'Cadastro';
    this.abrirPainelClienteDrawer();

    const cid = this.clienteDrawerClienteId;
    if (cid) {
      this.api.getCliente(cid).subscribe({
        next: (c) => {
          if (this.clienteDrawerClienteId !== cid) return;
          this.hidratarClienteNaForm(c);
        },
        error: () => {
          if (this.clienteDrawerClienteId === cid) {
            this.clienteSaveErro =
              'Não foi possível carregar os dados do cliente.';
          }
        },
      });
    }
  }

  private abrirPainelClienteDrawer(): void {
    /** Ao reabrir o drawer, apenas «Configurações» fica expandido no aside. */
    this.secaoEnderecoAberta = false;
    this.secaoRedesAberta = false;
    this.secaoConfiguracoesAberta = true;

    this.abrirDrawerComAnimacao(() => {
      this.clienteDrawerAberto = true;
    }, (open) => {
      this.clienteDrawerPanelOpen = open;
    });
  }

  fecharComandaDrawer(): void {
    if (!this.comandaPainelAberto) return;
    this.comandaDrawerPanelOpen = false;
    if (this.comandaDrawerCloseTimer != null) clearTimeout(this.comandaDrawerCloseTimer);
    this.comandaDrawerCloseTimer = setTimeout(() => {
      this.comandaDrawerCloseTimer = null;
      this.comandaPainelAberto = false;
      this.comandaDrawerContexto = null;
      this.desbloquearScrollPagina();
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
   * Rodapé «Salvar»: com o overlay do editor aberto não dá para premir este botão —
   * dispara `salvar()` no `app-agenda-novo` quando o editor já está por cima da comanda.
   */
  onSalvarDesdeDrawerComanda(): void {
    if (this.editAgendamentoAberto && this.agendaEditComandaRef) {
      this.agendaEditComandaRef.salvar();
      return;
    }
    this.onEditarAgendamentoDesdeComanda();
  }

  onEditarAgendamentoDesdeComanda(): void {
    const ctx = this.comandaDrawerContexto;
    const idAt = ctx?.idAtendimento?.trim();
    const ymd = (ctx?.dataYmd ?? '').trim();
    if (!idAt || !/^\d{4}-\d{2}-\d{2}$/.test(ymd)) return;
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

  /** Após salvar agendamento: fecha edição e o drawer da comanda; volta à lista de comandas. */
  onSalvoEditAgendamento(): void {
    this.fecharEditAgendamento();
    this.editReloadKey++;
    if (this.comandaPainelAberto) {
      this.fecharComandaDrawer();
    }
    this.carregar();
  }

  // ----- Sub-drawer Faturar -------------------------------------------------

  onAbrirFaturarComanda(ev: {
    idAtendimento: string;
    resumo: ComandaResumoPagamentos;
  }): void {
    const ctx = this.comandaDrawerContexto;
    const nomeCliente = ctx?.cliente?.nome ?? '';
    this.faturarCtx = {
      idAtendimento: ev.idAtendimento,
      resumo: ev.resumo,
      nomeCliente,
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
      this.comandaDrawerRef?.recarregarAposFaturar();
      this.carregar();
    }, DRAWER_ANIM_MS);
  }

  /** Após «Faturar» gravar com sucesso: fecha o sub-drawer e o da comanda; a lista já é actualizada em `fecharFaturarDrawer`. */
  onFaturaComandaSucesso(): void {
    this.fecharFaturarDrawer();
    this.fecharComandaDrawer();
  }

  fecharClienteDrawer(): void {
    if (!this.clienteDrawerAberto) return;
    this.clienteDrawerPanelOpen = false;
    if (this.clienteDrawerCloseTimer != null) clearTimeout(this.clienteDrawerCloseTimer);
    this.clienteDrawerCloseTimer = setTimeout(() => {
      this.clienteDrawerCloseTimer = null;
      this.clienteDrawerAberto = false;
      this.descontoDropdownAberto = false;
      this.clienteDrawerClienteId = null;
      this.clienteDrawerObsSnapshot = null;
      this.clienteSaveErro = '';
      this.cadastroSalvando = false;
      this.notificacoesToggleLiqArmed = false;
      this.desbloquearScrollPagina();
    }, DRAWER_ANIM_MS);
  }

  toggleDescontoDropdown(ev: Event): void {
    ev.stopPropagation();
    this.descontoDropdownAberto = !this.descontoDropdownAberto;
  }

  selecionarDescontoModo(modo: string): void {
    this.descontoPadraoModo = modo;
    this.descontoDropdownAberto = false;
  }

  onCelularChange(value: string): void {
    this.cadastroCelular = this.formatarTelefone(value, true);
  }

  onTelefoneChange(value: string): void {
    this.cadastroTelefone = this.formatarTelefone(value, false);
  }

  private formatarTelefone(value: string, celular: boolean): string {
    const digits = (value ?? '').replace(/\D/g, '').slice(0, celular ? 11 : 10);
    if (digits.length <= 2) return digits ? `(${digits}` : '';
    const ddd = digits.slice(0, 2);
    const corpo = digits.slice(2);
    if (celular) {
      if (corpo.length <= 5) return `(${ddd}) ${corpo}`;
      return `(${ddd}) ${corpo.slice(0, 5)}-${corpo.slice(5)}`;
    }
    if (corpo.length <= 4) return `(${ddd}) ${corpo}`;
    return `(${ddd}) ${corpo.slice(0, 4)}-${corpo.slice(4)}`;
  }

  onFotoSelecionada(ev: Event): void {
    const input = ev.target as HTMLInputElement | null;
    const file = input?.files?.[0];
    if (!file || !file.type.startsWith('image/')) {
      if (input) input.value = '';
      return;
    }
    const reader = new FileReader();
    reader.onload = () => {
      this.cadastroFotoUrl = typeof reader.result === 'string' ? reader.result : '';
      if (input) input.value = '';
    };
    reader.onerror = () => {
      if (input) input.value = '';
    };
    reader.readAsDataURL(file);
  }

  removerFotoSelecionada(): void {
    this.cadastroFotoUrl = '';
  }

  private opcoesClientes(): SaasSelectOption[] {
    return this.clientesCatalogo.map((c) => ({
      value: c.id,
      label: c.nome.trim() || '—',
    }));
  }

  excluir(g: ComandaGrupo, ev: Event): void {
    ev.stopPropagation();
    this.menuAbertoParaId = null;
    if (!this.idAtendimento(g) || this.excluindoItemModal) return;
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
        this.erro =
          e.message || 'Não foi possível excluir. Tente novamente.';
      },
    });
  }

  toggleMenu(g: ComandaGrupo, ev: Event): void {
    ev.stopPropagation();
    const id = g.id;
    this.menuAbertoParaId = this.menuAbertoParaId === id ? null : id;
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
      const nomeCliente = linhas[0].nomeCliente?.trim() || '—';
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
      const descontoN = valorMonetarioParaNumero(linhas[0]?.desconto);
      const descontoValor =
        descontoN !== null && descontoN > 0 ? descontoN : null;
      let valorTotal = subtotal;
      if (subtotal !== null && descontoValor !== null) {
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

    return grupos.sort((a, b) => {
      const c = a.data.localeCompare(b.data);
      return c !== 0 ? c : a.nomeCliente.localeCompare(b.nomeCliente, 'pt-BR');
    });
  }
}

