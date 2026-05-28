import { ApplicationRef, Injectable, inject } from '@angular/core';
import { Subscription, catchError, finalize, forkJoin, of, take } from 'rxjs';
import { SheetsApiService } from '../../core/services/sheets-api.service';
import {
  Cliente,
  ClienteCadastroPayload,
  ClienteCreditoMovimento,
} from '../../core/models/api.models';
import {
  dataDdMmYyyyValida,
  emailBrValido,
  formatarCepBr,
  formatarCnpjBr,
  formatarCpfBr,
  formatarDataDdMmYyyy,
  formatarRgBr9,
} from '../../core/utils/br-document-masks';
import {
  formatarCelularBr,
  formatarTelefoneFixoBr,
  telefoneBrDigitos,
} from '../../core/utils/telefone-br';
import { extractApiErrorMessage } from '../../core/utils/api-error-message';
import {
  agruparAtendimentosEmComandas,
  type ClienteComandaAbertaLinhaUi,
  type ClienteDebitoLinhaUi,
  painelDebitosClienteFromAtendimentos,
  totalComandasAbertoCliente,
  totalDebitosCliente,
} from '../../core/utils/comanda-status.util';
import type { ComandaDrawerContextoAgenda } from '../../features/agenda/pages/hub/comanda-drawer.types';
import type { SaasSelectOption } from '../../features/agenda/pages/novo/saas-select.component';
import {
  ClienteDuplicadoCampo,
  findClienteCadastroDuplicado,
} from '../../core/utils/clientes-unicidade';
import {
  historicoAgendamentosClienteFromAtendimentos,
  ymdFimFiltroAgendamentosPadrao,
  ymdInicioFiltroAgendamentosPadrao,
  type ClienteAgendamentoHistoricoLinha,
} from './cliente-agendamentos.util';
import {
  historicoVendasClienteFromAtendimentos,
  ymdFimFiltroVendasPadrao,
  ymdInicioFiltroVendasPadrao,
  type ClienteVendaHistoricoLinha,
} from './cliente-vendas.util';
import { UI_TIP_SHOW_DELAY_MS } from '../ui-tip-trigger/ui-tip-delay';

export const DRAWER_ANIM_MS = 430;

/** @deprecated Use `UI_TIP_SHOW_DELAY_MS` — mantido para imports externos. */
export const CLIENTE_NAV_LOCK_TOOLTIP_DELAY_MS = UI_TIP_SHOW_DELAY_MS;

export const CLIENTE_CADASTRO_ABAS = [
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

export type ClienteCadastroAba = (typeof CLIENTE_CADASTRO_ABAS)[number];

export type AbrirCadastroClientePayload = {
  aba?: ClienteCadastroAba;
};

export interface ClienteCashbackMovimento {
  id: string;
  /** `AAAA-MM-DD` */
  data: string;
  valorReais: number;
  tipo: 'entrada' | 'saida';
  motivo: string;
}

export type CadastroClienteTouchKey =
  | 'nome'
  | 'celular'
  | 'telefone'
  | 'email'
  | 'aniversario'
  | 'cnpj'
  | 'cpf'
  | 'rg';

export type ClienteCadastroExibicao = 'drawer' | 'embutido';

export interface ClienteCadastroDrawerCallbacks {
  onSalvo?: (c: Cliente) => void;
  onFechar?: () => void;
  onClienteCarregado?: (c: Cliente) => void;
}

export interface ClienteCadastroDrawerAbrirEdicaoOptions {
  nomeLista?: string;
  /** Foto já conhecida (ex.: drawer de perfil) antes do GET completar. */
  fotoUrlInicial?: string | null;
  /** Aba inicial (ex.: «Cashback» desde a sidebar da comanda). */
  abaInicial?: ClienteCadastroAba;
  callbacks?: ClienteCadastroDrawerCallbacks;
}

@Injectable({ providedIn: 'root' })
export class ClienteCadastroDrawerService {
  private readonly api = inject(SheetsApiService);
  private readonly appRef = inject(ApplicationRef);

  aberto = false;
  panelOpen = false;

  clienteNavLockTooltipVisible = false;
  clienteNavLockTooltipX = 0;
  clienteNavLockTooltipY = 0;

  modo: 'perfil' | 'novo' = 'perfil';
  drawerNome = '';
  abaAtiva = 'Cadastro';
  readonly abas = CLIENTE_CADASTRO_ABAS;

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
  cadastroCep = '';
  cadastroLogradouro = '';
  cadastroEnderecoNumero = '';
  cadastroComplemento = '';
  cadastroBairro = '';
  cadastroEstado = '';
  cadastroCidade = '';
  cadastroInstagram = '';
  cadastroFacebook = '';
  secaoEnderecoAberta = false;
  secaoRedesAberta = false;
  secaoConfiguracoesAberta = true;
  descontoDropdownAberto = false;
  descontoPadraoModo = 'Na comanda';
  descontoPadraoTexto = '';
  notificacoesAtivo = true;

  clienteId: string | null = null;
  cashbackSaldo = 0;
  cashbackMovimentos: ClienteCashbackMovimento[] = [];
  carregandoCashbackHistorico = false;
  creditoSaldo = 0;
  creditoMovimentos: ClienteCreditoMovimento[] = [];
  carregandoCreditoHistorico = false;
  debitosLinhas: ClienteDebitoLinhaUi[] = [];
  comandasAbertoLinhas: ClienteComandaAbertaLinhaUi[] = [];
  debitosTotal = 0;
  comandasAbertoTotal = 0;
  carregandoDebitosPainel = false;
  agendamentosLinhas: ClienteAgendamentoHistoricoLinha[] = [];
  carregandoAgendamentosHistorico = false;
  agendamentosFiltroInicio = ymdInicioFiltroAgendamentosPadrao();
  agendamentosFiltroFim = ymdFimFiltroAgendamentosPadrao();
  vendasLinhas: ClienteVendaHistoricoLinha[] = [];
  carregandoVendasHistorico = false;
  vendasFiltroInicio = ymdInicioFiltroVendasPadrao();
  vendasFiltroFim = ymdFimFiltroVendasPadrao();
  /** Drawer «Visualizando comanda» por cima da ficha (sem fechar nem mudar de rota). */
  comandaEmpilhadaAberta = false;
  comandaEmpilhadaPanelOpen = false;
  comandaEmpilhadaContexto: ComandaDrawerContextoAgenda | null = null;
  carregandoComandaEmpilhada = false;
  private comandaEmpilhadaCloseTimer: ReturnType<typeof setTimeout> | null =
    null;
  exibicao: ClienteCadastroExibicao = 'drawer';
  embutidoAtivo = false;
  carregandoFormulario = false;
  saveErro = '';
  salvando = false;
  notificacoesToggleLiqArmed = false;

  cadastroSubmetido = false;
  private cadastroTouch: Record<CadastroClienteTouchKey, boolean> = {
    nome: false,
    celular: false,
    telefone: false,
    email: false,
    aniversario: false,
    cnpj: false,
    cpf: false,
    rg: false,
  };

  private callbacks: ClienteCadastroDrawerCallbacks | null = null;
  private closeTimer: ReturnType<typeof setTimeout> | null = null;
  private navLockTooltipTimer: ReturnType<typeof setTimeout> | null = null;
  private bodyScrollPreDrawer = 0;
  private pageScrollLockAtivo = false;
  private saveSub: Subscription | null = null;
  private clientesIndiceUnicidade: Cliente[] | null = null;
  private duplicadoCampo: ClienteDuplicadoCampo | null = null;
  /** Foto ao carregar o formulário; usado para persistir remoção no PATCH. */
  private cadastroFotoUrlInicial = '';
  private cadastroFotoRemovida = false;

  private static readonly FOTO_URL_MAX_CHARS = 520_000;

  get fotoRemovidaNoFormulario(): boolean {
    return this.cadastroFotoRemovida;
  }

  get isAberto(): boolean {
    return this.aberto;
  }

  abrirNovo(
    nomeInicial = '',
    callbacks?: ClienteCadastroDrawerCallbacks,
  ): void {
    this.exibicao = 'drawer';
    this.embutidoAtivo = false;
    this.callbacks = callbacks ?? null;
    this.saveErro = '';
    this.salvando = false;
    this.notificacoesToggleLiqArmed = false;
    this.modo = 'novo';
    this.clienteId = null;
    this.drawerNome = 'Novo cliente';
    this.preencherFormularioVazio(nomeInicial);
    this.abaAtiva = 'Cadastro';
    this.abrirPainel();
    this.prefetchClientesParaUnicidade();
  }

  abrirEdicao(
    clienteId: string,
    options?: ClienteCadastroDrawerAbrirEdicaoOptions,
  ): void {
    const cid = clienteId.trim();
    if (!cid) return;

    this.exibicao = 'drawer';
    this.embutidoAtivo = false;
    this.callbacks = options?.callbacks ?? null;
    this.saveErro = '';
    this.salvando = false;
    this.notificacoesToggleLiqArmed = false;
    this.modo = 'perfil';
    this.clienteId = cid;
    this.preencherFormularioVazio(options?.nomeLista ?? '');
    this.abaAtiva = this.resolverAbaInicial(options?.abaInicial);
    this.abrirPainel();
    this.carregarCliente(cid);
    this.prefetchClientesParaUnicidade();
  }

  /**
   * Ficha global a partir dos links «Informações» da sidebar de cliente
   * (drawer de comanda, agendamento, edição de itens, etc.).
   */
  abrirEdicaoPorLinkSidebar(
    clienteId: string,
    payload: AbrirCadastroClientePayload = {},
    options?: ClienteCadastroDrawerAbrirEdicaoOptions,
  ): void {
    const abaInicial =
      this.resolverAbaInicial(payload.aba) ?? options?.abaInicial;
    this.abrirEdicao(clienteId, { ...options, abaInicial });
  }

  /** Formulário de cadastro dentro do drawer de perfil (sem overlay). */
  anexarEdicaoEmbutida(
    clienteId: string,
    options?: ClienteCadastroDrawerAbrirEdicaoOptions,
  ): void {
    const cid = clienteId.trim();
    if (!cid) return;
    if (this.embutidoAtivo && this.clienteId === cid) return;

    this.exibicao = 'embutido';
    this.embutidoAtivo = true;
    this.callbacks = options?.callbacks ?? null;
    this.saveErro = '';
    this.salvando = false;
    this.notificacoesToggleLiqArmed = false;
    this.modo = 'perfil';
    this.clienteId = cid;
    this.carregandoFormulario = true;
    this.preencherFormularioVazio(options?.nomeLista ?? '');
    const fotoSeed = (options?.fotoUrlInicial ?? '').trim();
    if (fotoSeed) {
      this.cadastroFotoUrl = fotoSeed;
      this.cadastroFotoUrlInicial = fotoSeed;
    }
    this.carregarCliente(cid);
    this.prefetchClientesParaUnicidade();
  }

  desanexarEmbutido(): void {
    if (!this.embutidoAtivo) return;
    this.saveSub?.unsubscribe();
    this.saveSub = null;
    this.embutidoAtivo = false;
    this.exibicao = 'drawer';
    this.carregandoFormulario = false;
    this.descontoDropdownAberto = false;
    this.clienteId = null;
    this.saveErro = '';
    this.salvando = false;
    this.duplicadoCampo = null;
    this.resetValidacao();
    this.callbacks = null;
  }

  fechar(): void {
    if (this.embutidoAtivo) {
      this.desanexarEmbutido();
      return;
    }
    if (!this.aberto) return;
    this.fecharComandaEmpilhadaSincrono();
    this.saveSub?.unsubscribe();
    this.saveSub = null;
    this.ocultarClienteNavLockTooltip();
    this.panelOpen = false;
    if (this.closeTimer != null) clearTimeout(this.closeTimer);
    this.closeTimer = setTimeout(() => {
      this.closeTimer = null;
      this.aberto = false;
      this.descontoDropdownAberto = false;
      this.modo = 'perfil';
      this.clienteId = null;
      this.cashbackSaldo = 0;
      this.cashbackMovimentos = [];
      this.carregandoCashbackHistorico = false;
      this.creditoSaldo = 0;
      this.creditoMovimentos = [];
      this.carregandoCreditoHistorico = false;
      this.debitosLinhas = [];
      this.comandasAbertoLinhas = [];
      this.debitosTotal = 0;
      this.comandasAbertoTotal = 0;
      this.carregandoDebitosPainel = false;
      this.agendamentosLinhas = [];
      this.carregandoAgendamentosHistorico = false;
      this.agendamentosFiltroInicio = ymdInicioFiltroAgendamentosPadrao();
      this.agendamentosFiltroFim = ymdFimFiltroAgendamentosPadrao();
      this.vendasLinhas = [];
      this.carregandoVendasHistorico = false;
      this.vendasFiltroInicio = ymdInicioFiltroVendasPadrao();
      this.vendasFiltroFim = ymdFimFiltroVendasPadrao();
      this.saveErro = '';
      this.salvando = false;
      this.notificacoesToggleLiqArmed = false;
      this.clientesIndiceUnicidade = null;
      this.duplicadoCampo = null;
      this.desbloquearScrollPagina();
      const cb = this.callbacks;
      this.callbacks = null;
      cb?.onFechar?.();
    }, DRAWER_ANIM_MS);
  }

  tituloCabecalho(): string {
    if (this.modo === 'novo') return 'Novo cliente';
    return this.drawerNome.trim() || 'Cliente';
  }

  ariaLabelDrawer(): string {
    return this.modo === 'novo' ? 'Novo cliente' : 'Perfil do cliente';
  }

  abaDesabilitada(aba: string): boolean {
    return this.modo === 'novo' && aba !== 'Cadastro';
  }

  abaAtivaIndex(): number {
    const ix = (this.abas as readonly string[]).indexOf(this.abaAtiva);
    return ix >= 0 ? ix : 0;
  }

  selecionarAba(aba: string): void {
    if (this.abaDesabilitada(aba)) return;
    this.abaAtiva = aba;
    if (aba === 'Cashback' && this.clienteId) {
      this.carregarCashbackHistorico(this.clienteId);
    }
    if (aba === 'Créditos' && this.clienteId) {
      this.carregarCreditoHistorico(this.clienteId);
    }
    if (aba === 'Débitos' && this.clienteId) {
      this.carregarDebitosPainel(this.clienteId);
    }
    if (aba === 'Agendamentos' && this.clienteId) {
      this.carregarAgendamentosHistorico(this.clienteId);
    }
    if (aba === 'Vendas' && this.clienteId) {
      this.carregarVendasHistorico(this.clienteId);
    }
  }

  aplicarFiltroVendasHistorico(): void {
    const cid = this.clienteId?.trim();
    if (!cid) return;
    this.carregarVendasHistorico(cid);
  }

  aplicarFiltroAgendamentosHistorico(): void {
    const cid = this.clienteId?.trim();
    if (!cid) return;
    this.carregarAgendamentosHistorico(cid);
  }

  /**
   * Abre o drawer «Visualizando comanda» empilhado sobre a ficha (ex.: aba Agendamentos).
   */
  visualizarComandaAgendamento(idAtendimento: string): void {
    const idAt = String(idAtendimento ?? '').trim();
    const cid = this.clienteId?.trim();
    if (!idAt || !cid || !this.isAberto) return;
    if (this.comandaEmpilhadaAberta) {
      this.fecharComandaEmpilhada(() => this.carregarEAbrirComandaEmpilhada(idAt));
      return;
    }
    this.carregarEAbrirComandaEmpilhada(idAt);
  }

  fecharComandaEmpilhada(aposAnimacao?: () => void): void {
    if (!this.comandaEmpilhadaAberta) {
      aposAnimacao?.();
      return;
    }
    this.comandaEmpilhadaPanelOpen = false;
    if (this.comandaEmpilhadaCloseTimer != null) {
      clearTimeout(this.comandaEmpilhadaCloseTimer);
    }
    this.comandaEmpilhadaCloseTimer = setTimeout(() => {
      this.comandaEmpilhadaCloseTimer = null;
      this.comandaEmpilhadaAberta = false;
      this.comandaEmpilhadaContexto = null;
      this.carregandoComandaEmpilhada = false;
      const cid = this.clienteId?.trim();
      if (cid && this.abaAtiva === 'Agendamentos') {
        this.carregarAgendamentosHistorico(cid);
      }
      if (cid && this.abaAtiva === 'Débitos') {
        this.carregarDebitosPainel(cid);
      }
      if (cid && this.abaAtiva === 'Vendas') {
        this.carregarVendasHistorico(cid);
      }
      this.appRef.tick();
      aposAnimacao?.();
    }, DRAWER_ANIM_MS);
  }

  fecharComandaEmpilhadaSincrono(): void {
    if (this.comandaEmpilhadaCloseTimer != null) {
      clearTimeout(this.comandaEmpilhadaCloseTimer);
      this.comandaEmpilhadaCloseTimer = null;
    }
    this.comandaEmpilhadaPanelOpen = false;
    this.comandaEmpilhadaAberta = false;
    this.comandaEmpilhadaContexto = null;
    this.carregandoComandaEmpilhada = false;
  }

  /**
   * Escape com comanda empilhada na ficha: recolhe só esse drawer (um nível acima).
   * Páginas com listener global devem chamar isto **antes** de `fechar()` na ficha.
   */
  tratarEscapeComandaEmpilhadaNaFicha(): boolean {
    if (!this.comandaEmpilhadaAberta) return false;
    this.fecharComandaEmpilhada();
    return true;
  }

  private carregarEAbrirComandaEmpilhada(idAtendimento: string): void {
    const idAt = idAtendimento.trim();
    const cid = this.clienteId?.trim();
    if (!idAt || !cid) return;
    this.carregandoComandaEmpilhada = true;
    forkJoin({
      items: this.api.listAgendamentos(undefined, undefined, idAt),
      clientes: this.api.listClientes().pipe(catchError(() => of([] as Cliente[]))),
    }).subscribe({
      next: ({ items, clientes }) => {
        if (this.clienteId !== cid) return;
        const grupos = agruparAtendimentosEmComandas(items);
        const g =
          grupos.find((gr) => String(gr.linhas[0]?.id ?? '').trim() === idAt) ??
          grupos[0];
        const l0 = g?.linhas[0];
        if (!g || !l0) {
          this.carregandoComandaEmpilhada = false;
          this.appRef.tick();
          return;
        }
        const cliente =
          clientes.find((c) => c.id === cid) ??
          ({
            id: cid,
            nome: this.cadastroNome?.trim() || '—',
          } as Cliente);
        const n = l0.numeroComanda;
        const numero =
          typeof n === 'number' && Number.isFinite(n) && n > 0 ? n : 1;
        const dataYmd = (g.data || '').slice(0, 10);
        this.comandaEmpilhadaContexto = {
          acessar: true,
          idAtendimento: idAt,
          numeroComandaTitulo: numero,
          clienteId: cid,
          cliente,
          opcoesClientes: this.opcoesClientesParaComandaEmpilhada(clientes),
          dataYmd: /^\d{4}-\d{2}-\d{2}$/.test(dataYmd) ? dataYmd : null,
          linhasSnapshot: [],
        };
        this.carregandoComandaEmpilhada = false;
        this.abrirPainelComandaEmpilhada();
        this.appRef.tick();
      },
      error: () => {
        if (this.clienteId !== cid) return;
        this.carregandoComandaEmpilhada = false;
        this.appRef.tick();
      },
    });
  }

  private opcoesClientesParaComandaEmpilhada(
    clientes: Cliente[],
  ): SaasSelectOption[] {
    return clientes.map((c) => ({
      value: c.id,
      label: (c.nome ?? '').trim() || '—',
    }));
  }

  private abrirPainelComandaEmpilhada(): void {
    this.comandaEmpilhadaAberta = true;
    this.comandaEmpilhadaPanelOpen = false;
    queueMicrotask(() => {
      requestAnimationFrame(() => {
        requestAnimationFrame(() => {
          this.comandaEmpilhadaPanelOpen = true;
          this.appRef.tick();
        });
      });
    });
  }

  onClienteNavTooltipEnter(event: Event, aba: string, imediato = false): void {
    if (!this.abaDesabilitada(aba)) return;
    const btn = event.currentTarget as HTMLElement;
    this.limparClienteNavLockTooltipTimer();
    const mostrar = (): void => this.posicionarClienteNavLockTooltip(btn);
    if (imediato) {
      mostrar();
      return;
    }
    this.navLockTooltipTimer = setTimeout(
      mostrar,
      CLIENTE_NAV_LOCK_TOOLTIP_DELAY_MS,
    );
  }

  onClienteNavTooltipLeave(aba: string): void {
    if (!this.abaDesabilitada(aba)) return;
    this.ocultarClienteNavLockTooltip();
  }

  ocultarClienteNavLockTooltip(): void {
    this.limparClienteNavLockTooltipTimer();
    this.clienteNavLockTooltipVisible = false;
  }

  blurCadastro(campo: CadastroClienteTouchKey): void {
    this.cadastroTouch[campo] = true;
  }

  erroCampo(campo: CadastroClienteTouchKey): string | null {
    if (!this.cadastroTouch[campo] && !this.cadastroSubmetido) return null;
    if (this.duplicadoCampo === campo) {
      return this.saveErro || 'Valor já cadastrado para outro cliente';
    }
    switch (campo) {
      case 'nome':
        return this.cadastroNome.trim() ? null : 'Campo obrigatório';
      case 'celular': {
        const d = telefoneBrDigitos(this.cadastroCelular);
        if (d.length === 0) return null;
        return d.length === 11 ? null : 'Celular deve ter 11 dígitos';
      }
      case 'telefone': {
        const d = telefoneBrDigitos(this.cadastroTelefone);
        if (d.length === 0) return null;
        return d.length === 10 ? null : 'Telefone deve ter 10 dígitos';
      }
      case 'email':
        return emailBrValido(this.cadastroEmail) ? null : 'E-mail inválido';
      case 'aniversario': {
        const d = ClienteCadastroDrawerService.apenasDigitos(
          this.cadastroAniversario,
        );
        if (d.length === 0) return null;
        if (d.length !== 8 || !dataDdMmYyyyValida(d)) return 'Data inválida';
        return null;
      }
      case 'cnpj': {
        const d = ClienteCadastroDrawerService.apenasDigitos(this.cadastroCnpj);
        if (d.length === 0) return null;
        return d.length === 14 ? null : 'CNPJ inválido';
      }
      case 'cpf': {
        const d = ClienteCadastroDrawerService.apenasDigitos(this.cadastroCpf);
        if (d.length === 0) return null;
        return d.length === 11 ? null : 'CPF inválido';
      }
      case 'rg': {
        const d = ClienteCadastroDrawerService.apenasDigitos(this.cadastroRg);
        if (d.length === 0) return null;
        return d.length === 9 ? null : 'RG inválido';
      }
      default:
        return null;
    }
  }

  onAniversarioChange(value: string): void {
    this.cadastroAniversario = formatarDataDdMmYyyy(value);
  }

  onCpfChange(value: string): void {
    this.cadastroCpf = formatarCpfBr(value);
    this.limparErroDuplicado('cpf');
  }

  onCnpjChange(value: string): void {
    this.cadastroCnpj = formatarCnpjBr(value);
  }

  onRgChange(value: string): void {
    this.cadastroRg = formatarRgBr9(value);
  }

  onCepChange(value: string): void {
    this.cadastroCep = formatarCepBr(value);
  }

  onCelularChange(value: string): void {
    this.cadastroCelular = formatarCelularBr(value);
    this.limparErroDuplicado('celular');
  }

  onNomeChange(value: string): void {
    this.cadastroNome = value;
    this.limparErroDuplicado('nome');
  }

  onTelefoneChange(value: string): void {
    this.cadastroTelefone = formatarTelefoneFixoBr(value);
  }

  toggleDescontoDropdown(ev: Event): void {
    ev.stopPropagation();
    this.descontoDropdownAberto = !this.descontoDropdownAberto;
  }

  selecionarDescontoModo(modo: string): void {
    this.descontoPadraoModo = modo;
    this.descontoDropdownAberto = false;
  }

  onNotificacoesToggleClick(ev: Event): void {
    this.pulseToggleVisual(ev);
    this.notificacoesAtivo = !this.notificacoesAtivo;
    if (!this.notificacoesToggleLiqArmed) {
      this.notificacoesToggleLiqArmed = true;
    }
  }

  onNotificacoesToggleKeydown(ev: KeyboardEvent): void {
    if (ev.key !== 'Enter' && ev.key !== ' ') return;
    ev.preventDefault();
    this.onNotificacoesToggleClick(ev);
  }

  onFotoSelecionada(ev: Event): void {
    const input = ev.target as HTMLInputElement | null;
    const file = input?.files?.[0];
    if (!file || !file.type.startsWith('image/')) {
      if (input) input.value = '';
      return;
    }
    void this.comprimirFoto(file)
      .then((dataUrl) => {
        this.cadastroFotoUrl = dataUrl;
        this.cadastroFotoRemovida = false;
        this.saveErro = '';
        this.appRef.tick();
      })
      .catch(() => {
        this.saveErro =
          'Não foi possível processar a imagem. Tente outro arquivo.';
        this.appRef.tick();
      })
      .finally(() => {
        if (input) input.value = '';
      });
  }

  removerFotoSelecionada(): void {
    this.cadastroFotoUrl = '';
    this.cadastroFotoRemovida = true;
    this.appRef.tick();
  }

  salvar(): void {
    if (this.salvando) return;

    this.saveErro = '';
    this.duplicadoCampo = null;
    this.cadastroSubmetido = true;
    const campos: CadastroClienteTouchKey[] = [
      'nome',
      'celular',
      'telefone',
      'email',
      'aniversario',
      'cnpj',
      'cpf',
      'rg',
    ];
    if (campos.some((k) => this.erroCampo(k) != null)) {
      this.saveErro = 'Corrija os campos destacados antes de salvar.';
      return;
    }

    const nome = this.cadastroNome.trim();
    const telefone = this.telefonePrioritarioParaApi().trim();
    const cadastro = this.montarPayload(nome, telefone);
    if (!cadastro) return;

    const dupLocal = this.clientesIndiceUnicidade
      ? findClienteCadastroDuplicado(
          this.clientesIndiceUnicidade,
          cadastro,
          this.clienteId,
        )
      : null;
    if (dupLocal) {
      this.duplicadoCampo = dupLocal.campo;
      this.saveErro = dupLocal.message;
      this.cadastroTouch[dupLocal.campo] = true;
      return;
    }

    this.salvando = true;
    this.saveSub?.unsubscribe();

    const embutido = this.exibicao === 'embutido';
    const callbacksSalvar = this.callbacks;
    const limpouFoto = this.cadastroFotoRemovida;

    const finalizeFn = (): void => {
      this.salvando = false;
      this.saveSub = null;
      this.appRef.tick();
    };

    const notificarSalvoEmbutido = (salvo: Cliente): void => {
      this.cadastroFotoRemovida = false;
      callbacksSalvar?.onSalvo?.(salvo);
    };

    const concluirSalvoEmbutido = (salvo?: Cliente): void => {
      const cid = this.clienteId?.trim() ?? '';
      const idSalvo = (salvo?.id ?? '').trim();
      if (idSalvo) {
        notificarSalvoEmbutido(salvo!);
        return;
      }
      if (!cid) {
        this.saveErro =
          'Cliente salvo, mas não foi possível atualizar a ficha (ID em falta).';
        this.appRef.tick();
        return;
      }
      this.api
        .getCliente(cid)
        .pipe(take(1))
        .subscribe({
          next: (c) => notificarSalvoEmbutido(c),
          error: () => {
            notificarSalvoEmbutido({
              id: cid,
              nome: this.cadastroNome.trim() || 'Cliente',
              telefone: this.telefonePrioritarioParaApi() || null,
              fotoUrl: limpouFoto ? null : undefined,
            });
          },
        });
    };

    const onOk = (salvo?: Cliente): void => {
      if (embutido) {
        concluirSalvoEmbutido(salvo);
        return;
      }
      if (salvo) {
        callbacksSalvar?.onSalvo?.(salvo);
      }
      this.fechar();
    };

    const onErr = (e: unknown): void => {
      const msg = extractApiErrorMessage(
        e,
        'Não foi possível salvar o cliente. Tente novamente.',
      );
      this.saveErro = msg;
      this.duplicadoCampo = this.mapearDuplicadoCampo(msg);
      if (this.duplicadoCampo) {
        this.cadastroTouch[this.duplicadoCampo] = true;
      }
      this.appRef.tick();
    };

    const req = this.clienteId
      ? this.api.updateCliente({
          cliente_id: this.clienteId,
          ...cadastro,
        })
      : this.api.createCliente(cadastro);

    this.saveSub = req
      .pipe(finalize(finalizeFn))
      .subscribe({ next: (salvo) => onOk(salvo), error: onErr });
  }

  private prefetchClientesParaUnicidade(): void {
    this.clientesIndiceUnicidade = null;
    this.api
      .listClientes()
      .pipe(take(1))
      .subscribe({
        next: (items) => {
          this.clientesIndiceUnicidade = items ?? [];
        },
        error: () => {
          this.clientesIndiceUnicidade = null;
        },
      });
  }

  private limparErroDuplicado(campo: ClienteDuplicadoCampo): void {
    if (this.duplicadoCampo === campo) {
      this.duplicadoCampo = null;
      this.saveErro = '';
    }
  }

  private mapearDuplicadoCampo(msg: string): ClienteDuplicadoCampo | null {
    const m = msg.toLowerCase();
    if (m.includes('nome')) return 'nome';
    if (m.includes('celular')) return 'celular';
    if (m.includes('cpf')) return 'cpf';
    return null;
  }

  private abrirPainel(): void {
    this.secaoEnderecoAberta = false;
    this.secaoRedesAberta = false;
    this.secaoConfiguracoesAberta = true;

    this.aberto = true;
    this.bloquearScrollPagina();
    this.panelOpen = false;
    queueMicrotask(() => {
      requestAnimationFrame(() => {
        requestAnimationFrame(() => {
          this.panelOpen = true;
        });
      });
    });
  }

  private carregarCliente(cid: string): void {
    if (this.exibicao === 'embutido') {
      this.carregandoFormulario = true;
    }
    this.api.getCliente(cid).subscribe({
      next: (c) => {
        if (this.clienteId !== cid) return;
        const fotoRemovida = this.cadastroFotoRemovida;
        this.hidratarForm(c);
        if (fotoRemovida) {
          this.cadastroFotoUrl = '';
          this.cadastroFotoRemovida = true;
        }
        this.carregandoFormulario = false;
        if (this.abaAtiva === 'Cashback') {
          this.carregarCashbackHistorico(cid);
        }
        if (this.abaAtiva === 'Créditos') {
          this.carregarCreditoHistorico(cid);
        }
        if (this.abaAtiva === 'Débitos') {
          this.carregarDebitosPainel(cid);
        }
        if (this.abaAtiva === 'Agendamentos') {
          this.carregarAgendamentosHistorico(cid);
        }
        if (this.abaAtiva === 'Vendas') {
          this.carregarVendasHistorico(cid);
        }
        this.callbacks?.onClienteCarregado?.(
          fotoRemovida ? { ...c, fotoUrl: null } : c,
        );
      },
      error: () => {
        if (this.clienteId === cid) {
          this.carregandoFormulario = false;
          this.saveErro = 'Não foi possível carregar os dados do cliente.';
        }
      },
    });
  }

  private preencherFormularioVazio(nomeInicial: string): void {
    const nomeLista = nomeInicial.trim();
    this.drawerNome = nomeLista || 'Cliente';
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
    this.cadastroFotoUrlInicial = '';
    this.cadastroFotoRemovida = false;
    this.cadastroCep = '';
    this.cadastroLogradouro = '';
    this.cadastroEnderecoNumero = '';
    this.cadastroComplemento = '';
    this.cadastroBairro = '';
    this.cadastroEstado = '';
    this.cadastroCidade = '';
    this.cadastroInstagram = '';
    this.cadastroFacebook = '';
    this.descontoPadraoModo = 'Na comanda';
    this.descontoPadraoTexto = '';
    this.notificacoesAtivo = true;
    this.resetValidacao();
  }

  private hidratarForm(c: Cliente): void {
    this.resetValidacao();
    this.cadastroNome = String(c.nome ?? '').trim();
    this.drawerNome = this.cadastroNome || this.drawerNome || 'Cliente';

    const celStored = String(c.celular ?? '').trim();
    const telStored = String(c.telefoneFixo ?? '').trim();
    const apiTel = String(c.telefone ?? '').trim();

    if (celStored.length > 0) {
      this.cadastroCelular = formatarCelularBr(celStored);
    } else if (apiTel.length > 0) {
      this.cadastroCelular = formatarCelularBr(apiTel);
    } else {
      this.cadastroCelular = '';
    }

    this.cadastroTelefone =
      telStored.length > 0 ? formatarTelefoneFixoBr(telStored) : '';

    this.cadastroApelido = c.apelido ?? '';
    this.cadastroEmail = c.email ?? '';
    this.cadastroAniversario = c.aniversario ?? '';
    this.cadastroCnpj = c.cnpj ?? '';
    this.cadastroCpf = c.cpf ?? '';
    this.cadastroRg = c.rg ?? '';
    if (c.descontoPadraoModo?.trim()) {
      this.descontoPadraoModo = c.descontoPadraoModo;
    }
    if (c.descontoPadraoTexto?.trim()) {
      this.descontoPadraoTexto = c.descontoPadraoTexto;
    }
    if (typeof c.notificacoesAtivo === 'boolean') {
      this.notificacoesAtivo = c.notificacoesAtivo;
    }
    this.cadastroFotoUrl = c.fotoUrl?.trim() ?? '';
    this.cadastroFotoUrlInicial = this.cadastroFotoUrl;
    this.cadastroFotoRemovida = false;
    this.cadastroCep = formatarCepBr(c.cep ?? '');
    this.cadastroLogradouro = c.logradouro ?? '';
    this.cadastroEnderecoNumero = c.enderecoNumero ?? '';
    this.cadastroComplemento = c.complemento ?? '';
    this.cadastroBairro = c.bairro ?? '';
    this.cadastroEstado = c.estado ?? '';
    this.cadastroCidade = c.cidade ?? '';
    this.cadastroInstagram = c.instagram ?? '';
    this.cadastroFacebook = c.facebook ?? '';

    this.cadastroAniversario = formatarDataDdMmYyyy(this.cadastroAniversario);
    this.cadastroCnpj = formatarCnpjBr(this.cadastroCnpj);
    this.cadastroCpf = formatarCpfBr(this.cadastroCpf);
    this.cadastroRg = formatarRgBr9(this.cadastroRg);
    this.cashbackSaldo = this.saldoMoedaNum(c.cashbackSaldo);
    this.creditoSaldo = this.saldoMoedaNum(c.creditoSaldo);
  }

  private resolverAbaInicial(aba?: ClienteCadastroAba): ClienteCadastroAba {
    if (aba && (this.abas as readonly string[]).includes(aba)) {
      return aba;
    }
    return 'Cadastro';
  }

  private saldoMoedaNum(v: unknown): number {
    const n = Number(v ?? 0);
    return Number.isFinite(n) ? Math.round(n * 100) / 100 : 0;
  }

  /**
   * Histórico de cashback (API dedicada quando existir).
   * Por agora mantém saldo do GET cliente e lista vazia.
   */
  private carregarCashbackHistorico(clienteId: string): void {
    const cid = clienteId.trim();
    if (!cid || this.clienteId !== cid) return;
    this.carregandoCashbackHistorico = true;
    this.cashbackMovimentos = [];
    this.carregandoCashbackHistorico = false;
    this.appRef.tick();
  }

  recarregarDebitosPainel(): void {
    const cid = String(this.clienteId ?? '').trim();
    if (!cid) return;
    this.carregarDebitosPainel(cid);
  }

  recarregarCreditoPainel(): void {
    const cid = String(this.clienteId ?? '').trim();
    if (!cid) return;
    this.carregarCreditoHistorico(cid);
  }

  aplicarCreditoSaldoAposAjuste(saldo: number): void {
    this.creditoSaldo = this.saldoMoedaNum(saldo);
    this.appRef.tick();
  }

  private carregarDebitosPainel(clienteId: string): void {
    const cid = clienteId.trim();
    if (!cid || this.clienteId !== cid) return;
    this.carregandoDebitosPainel = true;
    this.debitosLinhas = [];
    this.comandasAbertoLinhas = [];
    this.debitosTotal = 0;
    this.comandasAbertoTotal = 0;
    this.api.listAgendamentos().subscribe({
      next: (items) => {
        if (this.clienteId !== cid || this.abaAtiva !== 'Débitos') return;
        const painel = painelDebitosClienteFromAtendimentos(cid, items, {
          nomeCliente: this.cadastroNome,
        });
        this.debitosLinhas = painel.debitos;
        this.comandasAbertoLinhas = painel.comandasAberto;
        this.debitosTotal = totalDebitosCliente(painel.debitos);
        this.comandasAbertoTotal = totalComandasAbertoCliente(
          painel.comandasAberto,
        );
        this.carregandoDebitosPainel = false;
        this.appRef.tick();
      },
      error: () => {
        if (this.clienteId !== cid) return;
        this.debitosLinhas = [];
        this.comandasAbertoLinhas = [];
        this.debitosTotal = 0;
        this.comandasAbertoTotal = 0;
        this.carregandoDebitosPainel = false;
        this.appRef.tick();
      },
    });
  }

  private carregarAgendamentosHistorico(clienteId: string): void {
    const cid = clienteId.trim();
    if (!cid || this.clienteId !== cid) return;
    const ini = String(this.agendamentosFiltroInicio ?? '').trim().slice(0, 10);
    const fim = String(this.agendamentosFiltroFim ?? '').trim().slice(0, 10);
    this.carregandoAgendamentosHistorico = true;
    this.agendamentosLinhas = [];
    this.api
      .listAgendamentos(ini || undefined, fim || undefined, undefined, true)
      .subscribe({
      next: (items) => {
        if (this.clienteId !== cid || this.abaAtiva !== 'Agendamentos') return;
        this.agendamentosLinhas = historicoAgendamentosClienteFromAtendimentos(
          cid,
          items,
          ini,
          fim,
        );
        this.carregandoAgendamentosHistorico = false;
        this.appRef.tick();
      },
      error: () => {
        if (this.clienteId !== cid) return;
        this.agendamentosLinhas = [];
        this.carregandoAgendamentosHistorico = false;
        this.appRef.tick();
      },
    });
  }

  private carregarVendasHistorico(clienteId: string): void {
    const cid = clienteId.trim();
    if (!cid || this.clienteId !== cid) return;
    const ini = String(this.vendasFiltroInicio ?? '').trim().slice(0, 10);
    const fim = String(this.vendasFiltroFim ?? '').trim().slice(0, 10);
    this.carregandoVendasHistorico = true;
    this.vendasLinhas = [];
    this.api.listAgendamentos(ini || undefined, fim || undefined).subscribe({
      next: (items) => {
        if (this.clienteId !== cid || this.abaAtiva !== 'Vendas') return;
        this.vendasLinhas = historicoVendasClienteFromAtendimentos(
          cid,
          items,
          ini,
          fim,
        );
        this.carregandoVendasHistorico = false;
        this.appRef.tick();
      },
      error: () => {
        if (this.clienteId !== cid) return;
        this.vendasLinhas = [];
        this.carregandoVendasHistorico = false;
        this.appRef.tick();
      },
    });
  }

  private carregarCreditoHistorico(clienteId: string): void {
    const cid = clienteId.trim();
    if (!cid || this.clienteId !== cid) return;
    this.carregandoCreditoHistorico = true;
    this.creditoMovimentos = [];
    this.api.listClienteCreditoMovimentos(cid).subscribe({
      next: (items) => {
        if (this.clienteId !== cid || this.abaAtiva !== 'Créditos') return;
        this.creditoMovimentos = items;
        this.carregandoCreditoHistorico = false;
        this.appRef.tick();
      },
      error: () => {
        if (this.clienteId !== cid) return;
        this.creditoMovimentos = [];
        this.carregandoCreditoHistorico = false;
        this.appRef.tick();
      },
    });
  }

  private fotoUrlValidaParaEnvio(raw: string): boolean {
    const okHttp = raw.startsWith('http://') || raw.startsWith('https://');
    const okData = raw.startsWith('data:image/');
    return (
      (okHttp || okData) &&
      raw.length <= ClienteCadastroDrawerService.FOTO_URL_MAX_CHARS
    );
  }

  private montarPayload(
    nome: string,
    telefone: string,
  ): ClienteCadastroPayload | null {
    if (this.cadastroFotoRemovida) {
      this.cadastroFotoUrl = '';
    }

    const rawFoto = (this.cadastroFotoUrl ?? '').trim();
    const fotoInicial = (this.cadastroFotoUrlInicial ?? '').trim();
    let fotoUrlPayload: string | undefined;

    if (this.cadastroFotoRemovida && this.clienteId) {
      fotoUrlPayload = '';
    } else if (rawFoto) {
      if (this.fotoUrlValidaParaEnvio(rawFoto)) {
        fotoUrlPayload = rawFoto;
      } else if (rawFoto === fotoInicial) {
        fotoUrlPayload = undefined;
      } else {
        this.saveErro =
          'A foto não pôde ser incluída (arquivo grande demais). Tente outra imagem.';
        this.appRef.tick();
        return null;
      }
    } else if (this.clienteId && fotoInicial.length > 0) {
      fotoUrlPayload = '';
    }
    return {
      nome,
      telefone: telefone || undefined,
      apelido: this.cadastroApelido.trim() || undefined,
      email: this.cadastroEmail.trim() || undefined,
      celular: this.cadastroCelular.trim() || undefined,
      telefoneFixo: this.cadastroTelefone.trim() || undefined,
      aniversario: this.cadastroAniversario.trim() || undefined,
      cnpj: this.cadastroCnpj.trim() || undefined,
      cpf: this.cadastroCpf.trim() || undefined,
      rg: this.cadastroRg.trim() || undefined,
      notificacoesAtivo: this.notificacoesAtivo,
      descontoPadraoTexto: this.descontoPadraoTexto.trim() || undefined,
      descontoPadraoModo: this.descontoPadraoModo || undefined,
      ...(fotoUrlPayload !== undefined ? { fotoUrl: fotoUrlPayload } : {}),
      cep: this.cadastroCep.trim() || undefined,
      logradouro: this.cadastroLogradouro.trim() || undefined,
      enderecoNumero: this.cadastroEnderecoNumero.trim() || undefined,
      complemento: this.cadastroComplemento.trim() || undefined,
      bairro: this.cadastroBairro.trim() || undefined,
      estado: this.cadastroEstado.trim() || undefined,
      cidade: this.cadastroCidade.trim() || undefined,
      instagram:
        ClienteCadastroDrawerService.normalizarHandleRede(
          this.cadastroInstagram,
        ) || undefined,
      facebook:
        ClienteCadastroDrawerService.normalizarHandleRede(
          this.cadastroFacebook,
        ) || undefined,
    };
  }

  private telefonePrioritarioParaApi(): string {
    const c = ClienteCadastroDrawerService.apenasDigitos(this.cadastroCelular);
    const f = ClienteCadastroDrawerService.apenasDigitos(this.cadastroTelefone);
    if (c.length > 0) return this.cadastroCelular.trim();
    if (f.length > 0) return this.cadastroTelefone.trim();
    return '';
  }

  private static normalizarHandleRede(value: string): string {
    let s = String(value ?? '').trim();
    if (!s) return '';
    s = s.replace(/^https?:\/\//i, '');
    s = s.replace(/^(www\.)?instagram\.com\//i, '');
    s = s.replace(/^(www\.)?facebook\.com\//i, '');
    return s.replace(/^\/+/, '').replace(/\/+$/, '');
  }

  private static apenasDigitos(s: string): string {
    return (s ?? '').replace(/\D/g, '');
  }

  private resetValidacao(): void {
    this.cadastroSubmetido = false;
    this.cadastroTouch = {
      nome: false,
      celular: false,
      telefone: false,
      email: false,
      aniversario: false,
      cnpj: false,
      cpf: false,
      rg: false,
    };
  }

  private posicionarClienteNavLockTooltip(btn: HTMLElement): void {
    const label = btn.querySelector<HTMLElement>('.cliente-nav__label');
    if (!label) return;
    const r = label.getBoundingClientRect();
    this.clienteNavLockTooltipX = r.left + r.width / 2;
    this.clienteNavLockTooltipY = r.top;
    this.clienteNavLockTooltipVisible = true;
  }

  private limparClienteNavLockTooltipTimer(): void {
    if (this.navLockTooltipTimer != null) {
      clearTimeout(this.navLockTooltipTimer);
      this.navLockTooltipTimer = null;
    }
  }

  private pulseToggleVisual(ev: Event): void {
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

  private comprimirFoto(file: File): Promise<string> {
    return new Promise((resolve, reject) => {
      const url = URL.createObjectURL(file);
      const img = new Image();
      img.onload = () => {
        URL.revokeObjectURL(url);
        const maxSide = 480;
        let { width, height } = img;
        if (width > maxSide || height > maxSide) {
          const ratio = Math.min(maxSide / width, maxSide / height);
          width = Math.max(1, Math.round(width * ratio));
          height = Math.max(1, Math.round(height * ratio));
        }
        const canvas = document.createElement('canvas');
        canvas.width = width;
        canvas.height = height;
        const ctx = canvas.getContext('2d');
        if (!ctx) {
          reject(new Error('canvas'));
          return;
        }
        ctx.drawImage(img, 0, 0, width, height);
        let quality = 0.86;
        let dataUrl = canvas.toDataURL('image/jpeg', quality);
        while (
          dataUrl.length > ClienteCadastroDrawerService.FOTO_URL_MAX_CHARS &&
          quality > 0.45
        ) {
          quality -= 0.08;
          dataUrl = canvas.toDataURL('image/jpeg', quality);
        }
        if (dataUrl.length > ClienteCadastroDrawerService.FOTO_URL_MAX_CHARS) {
          reject(new Error('too_large'));
          return;
        }
        resolve(dataUrl);
      };
      img.onerror = () => {
        URL.revokeObjectURL(url);
        reject(new Error('load'));
      };
      img.src = url;
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
}
