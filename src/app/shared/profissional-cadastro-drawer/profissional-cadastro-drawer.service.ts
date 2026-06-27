import { Injectable, ApplicationRef, inject } from '@angular/core';
import { Subscription, finalize } from 'rxjs';
import { SheetsApiService } from '../../core/services/sheets-api.service';
import { AuthService } from '../../core/services/auth.service';
import type {
  ProfissionalCadastroPayload,
  ProfissionalComissaoServicoItem,
  ProfissionalListaItem,
} from '../../core/models/api.models';
import {
  dataDdMmYyyyValida,
  formatarCepBr,
  formatarCpfBr,
  formatarCnpjBr,
  formatarDataDdMmYyyy,
  formatarRgBr9,
} from '../../core/utils/br-document-masks';
import {
  formatarCelularBr,
  isCelularBr11Digitos,
  telefoneBrDigitos,
} from '../../core/utils/telefone-br';
import { extractApiErrorMessage } from '../../core/utils/api-error-message';
import {
  comprimirImagemParaDataUrl,
  fotoDataUrlValidaParaEnvio,
} from '../../core/utils/foto-data-url.util';
import { profissionalFotoUrl } from '../../core/utils/profissional-foto.util';
import { AppToastService } from '../app-toast/app-toast.service';
import {
  CLIENTE_NAV_LOCK_TOOLTIP_DELAY_MS,
  DRAWER_ANIM_MS,
} from '../cliente-cadastro-drawer/cliente-cadastro-drawer.service';

export const PROFISSIONAL_SALVO_TOAST_MSG = 'Profissional salvo com sucesso!';

/** Abas visíveis no drawer. */
export const PROF_CADASTRO_ABAS = [
  'Cadastro',
  'Endereço',
  'Usuário',
  'Configurar comissões',
  'Pagar salário/comissão',
  'Vales e Bonificações',
] as const;

/** Referência Belasis — abas previstas para fases futuras (não exibidas na nav). */
export const PROF_CADASTRO_ABAS_FUTURAS = [
  'Assinatura digital',
  'Expediente',
  'Personalizar serviços',
  'Comissões e Auxiliares',
  'Permissões',
  'Contas de banco',
] as const;

export type ProfCadastroAba = (typeof PROF_CADASTRO_ABAS)[number];
export type ProfCadastroAbaFutura = (typeof PROF_CADASTRO_ABAS_FUTURAS)[number];
export type ProfCadastroAbaOverflow = ProfCadastroAba | ProfCadastroAbaFutura;

/** Abas na barra horizontal (mobile) — todas as secções ativas; futuras ficam no menu ⋯. */
export const PROF_CADASTRO_ABAS_NAV_SCROLL: readonly ProfCadastroAba[] =
  PROF_CADASTRO_ABAS;

/** Abas no menu «⋯» (mobile). */
export const PROF_CADASTRO_ABAS_NAV_OVERFLOW: readonly ProfCadastroAbaFutura[] =
  PROF_CADASTRO_ABAS_FUTURAS;

/** Abas clicáveis (demais secções só após salvar o profissional). */
export const PROF_CADASTRO_ABAS_ATIVAS: readonly ProfCadastroAba[] = [
  'Cadastro',
  'Endereço',
  'Usuário',
  'Configurar comissões',
  'Pagar salário/comissão',
  'Vales e Bonificações',
];

export interface ProfissionalCadastroDrawerCallbacks {
  onSalvo?: (p: ProfissionalListaItem) => void;
  onFechar?: () => void;
}

@Injectable({ providedIn: 'root' })
export class ProfissionalCadastroDrawerService {
  private readonly api = inject(SheetsApiService);
  private readonly auth = inject(AuthService);
  private readonly toast = inject(AppToastService);
  private readonly appRef = inject(ApplicationRef);

  aberto = false;
  panelOpen = false;
  modo: 'novo' | 'editar' = 'novo';
  profissionalId: number | null = null;
  abaAtiva: ProfCadastroAba = 'Cadastro';
  readonly abas = PROF_CADASTRO_ABAS;
  readonly abasNavScroll = PROF_CADASTRO_ABAS_NAV_SCROLL;
  readonly abasNavOverflow = PROF_CADASTRO_ABAS_NAV_OVERFLOW;

  cadastroNome = '';
  cadastroApelido = '';
  cadastroCelular = '';
  cadastroProfissao = '';
  cadastroAniversario = '';
  cadastroCpfCnpj = '';
  cadastroRg = '';
  cadastroAnotacoes = '';

  cadastroFotoUrl = '';
  private cadastroFotoUrlInicial = '';
  private cadastroFotoRemovida = false;

  enderecoCep = '';
  enderecoLogradouro = '';
  enderecoNumero = '';
  enderecoComplemento = '';
  enderecoBairro = '';
  enderecoEstado = '';
  enderecoCidade = '';

  ativo = true;
  disponivelAgendamentoOnline = true;
  gerarAgenda = true;
  recebeComissao = true;
  comissaoListagemModo: 'pagamento_cliente' | 'competencia' =
    'pagamento_cliente';
  comissaoTextoRecibo = '';

  salariosDrawerAberto = false;
  salariosDrawerPanelOpen = false;
  valesDrawerAberto = false;
  valesDrawerPanelOpen = false;

  comissaoServicosItens: ProfissionalComissaoServicoItem[] = [];
  comissaoServicosCarregando = false;
  comissaoServicosCarregado = false;
  comissaoServicosImportando = false;

  ativoToggleLiqArmed = false;
  disponivelAgendamentoOnlineToggleLiqArmed = false;
  gerarAgendaToggleLiqArmed = false;
  recebeComissaoToggleLiqArmed = false;

  secaoConfiguracoesAberta = true;

  cadastroSubmetido = false;
  saveErro = '';
  salvando = false;
  carregando = false;

  profNavLockTooltipVisible = false;
  profNavLockTooltipAba: ProfCadastroAba | null = null;
  profNavLockTooltipX = 0;
  profNavLockTooltipY = 0;

  usuarioEmail = '';
  usuarioSenha = '';
  usuarioAtivo = true;
  usuarioTemConta = false;
  usuarioMostrarSenha = false;
  usuarioCarregando = false;
  usuarioSalvando = false;
  usuarioErro = '';

  private callbacks: ProfissionalCadastroDrawerCallbacks | null = null;
  private saveSub: Subscription | null = null;
  private closeTimer: ReturnType<typeof setTimeout> | null = null;
  private salariosCloseTimer: ReturnType<typeof setTimeout> | null = null;
  private valesCloseTimer: ReturnType<typeof setTimeout> | null = null;
  private navLockTooltipTimer: ReturnType<typeof setTimeout> | null = null;
  private bodyScrollPreDrawer = 0;
  private pageScrollLockAtivo = false;

  tituloCabecalho(): string {
    if (this.modo === 'novo') return 'Novo profissional';
    return this.cadastroNome.trim() || 'Profissional';
  }

  isAbaFutura(aba: ProfCadastroAbaOverflow): aba is ProfCadastroAbaFutura {
    return (PROF_CADASTRO_ABAS_FUTURAS as readonly string[]).includes(aba);
  }

  abaOverflowDesabilitada(aba: ProfCadastroAbaOverflow): boolean {
    if (this.isAbaFutura(aba)) return true;
    return this.abaDesabilitada(aba);
  }

  abaAtivaNoOverflow(): boolean {
    return (PROF_CADASTRO_ABAS_FUTURAS as readonly string[]).includes(
      this.abaAtiva,
    );
  }

  abaDesabilitada(aba: ProfCadastroAba): boolean {
    if (!PROF_CADASTRO_ABAS_ATIVAS.includes(aba)) return true;
    if (this.modo === 'novo' && aba !== 'Cadastro') return true;
    return false;
  }

  profNavLockTooltipTexto(aba: ProfCadastroAba): string {
    if (this.modo === 'novo' && aba !== 'Cadastro') {
      return 'Salve o profissional antes de aceder a esta secção';
    }
    return 'Em breve';
  }

  abaAtivaIndex(): number {
    const ix = this.abas.indexOf(this.abaAtiva);
    return ix >= 0 ? ix : 0;
  }

  selecionarAba(aba: ProfCadastroAba): void {
    if (this.abaDesabilitada(aba)) return;
    if (aba === 'Pagar salário/comissão') {
      this.abrirSalariosDrawer();
      return;
    }
    if (aba === 'Vales e Bonificações') {
      this.abrirValesDrawer();
      return;
    }
    this.abaAtiva = aba;
    if (aba === 'Usuário') {
      void this.carregarUsuarioProfissional();
    }
  }

  abrirSalariosDrawer(): void {
    if (this.modo !== 'editar' || !this.profissionalId) return;
    this.abaAtiva = 'Pagar salário/comissão';
    this.salariosDrawerAberto = true;
    requestAnimationFrame(() => {
      requestAnimationFrame(() => {
        this.salariosDrawerPanelOpen = true;
      });
    });
  }

  fecharSalariosDrawer(): void {
    if (!this.salariosDrawerAberto) return;
    this.salariosDrawerPanelOpen = false;
    if (this.salariosCloseTimer != null) clearTimeout(this.salariosCloseTimer);
    this.salariosCloseTimer = setTimeout(() => {
      this.salariosCloseTimer = null;
      this.salariosDrawerAberto = false;
    }, DRAWER_ANIM_MS);
  }

  abrirValesDrawer(): void {
    if (this.modo !== 'editar' || !this.profissionalId) return;
    this.abaAtiva = 'Vales e Bonificações';
    this.valesDrawerAberto = true;
    requestAnimationFrame(() => {
      requestAnimationFrame(() => {
        this.valesDrawerPanelOpen = true;
      });
    });
  }

  fecharValesDrawer(): void {
    if (!this.valesDrawerAberto) return;
    this.valesDrawerPanelOpen = false;
    if (this.valesCloseTimer != null) clearTimeout(this.valesCloseTimer);
    this.valesCloseTimer = setTimeout(() => {
      this.valesCloseTimer = null;
      this.valesDrawerAberto = false;
    }, DRAWER_ANIM_MS);
  }

  fecharDrawerSecundarioAtivo(): boolean {
    if (this.salariosDrawerAberto) {
      this.fecharSalariosDrawer();
      return true;
    }
    if (this.valesDrawerAberto) {
      this.fecharValesDrawer();
      return true;
    }
    return false;
  }

  onEnderecoCepChange(v: string): void {
    this.enderecoCep = formatarCepBr(v);
  }

  salvarEndereco(): void {
    if (this.modo !== 'editar' || !this.profissionalId) return;
    this.saveErro = '';
    this.salvando = true;
    this.saveSub?.unsubscribe();
    this.saveSub = this.api
      .updateProfissional({
        id: this.profissionalId,
        cep: this.enderecoCep.trim() || null,
        logradouro: this.enderecoLogradouro.trim() || null,
        endereco_numero: this.enderecoNumero.trim() || null,
        complemento: this.enderecoComplemento.trim() || null,
        bairro: this.enderecoBairro.trim() || null,
        estado: this.enderecoEstado.trim() || null,
        cidade: this.enderecoCidade.trim() || null,
      })
      .pipe(finalize(() => (this.salvando = false)))
      .subscribe({
        next: () => {
          this.toast.show('Endereço salvo.');
        },
        error: (e: unknown) => {
          this.saveErro =
            extractApiErrorMessage(e) ||
            'Não foi possível salvar o endereço.';
        },
      });
  }

  carregarUsuarioProfissional(): void {
    if (this.modo !== 'editar' || !this.profissionalId) return;
    this.usuarioCarregando = true;
    this.usuarioErro = '';
    this.api.getProfissionalUsuario(this.profissionalId).subscribe({
      next: (item) => {
        this.usuarioCarregando = false;
        if (item) {
          this.usuarioEmail = item.email;
          this.usuarioAtivo = item.ativo !== false;
          this.usuarioTemConta = true;
        } else {
          this.usuarioEmail = '';
          this.usuarioAtivo = true;
          this.usuarioTemConta = false;
        }
        this.usuarioSenha = '';
      },
      error: () => {
        this.usuarioCarregando = false;
        this.usuarioErro = 'Não foi possível carregar o usuário.';
      },
    });
  }

  salvarUsuarioProfissional(): void {
    if (this.modo !== 'editar' || !this.profissionalId) return;
    const email = this.usuarioEmail.trim();
    if (!email) {
      this.usuarioErro = 'E-mail é obrigatório.';
      return;
    }
    if (!this.usuarioTemConta && !this.usuarioSenha.trim()) {
      this.usuarioErro = 'Senha é obrigatória ao criar o usuário.';
      return;
    }
    this.usuarioErro = '';
    this.usuarioSalvando = true;
    this.api
      .saveProfissionalUsuario(this.profissionalId, {
        email,
        senha: this.usuarioSenha.trim() || undefined,
        ativo: this.usuarioAtivo,
      })
      .pipe(finalize(() => (this.usuarioSalvando = false)))
      .subscribe({
        next: (item) => {
          this.usuarioEmail = item.email;
          this.usuarioAtivo = item.ativo !== false;
          this.usuarioTemConta = true;
          this.usuarioSenha = '';
          this.toast.show('Usuário do profissional salvo.');
        },
        error: (e: unknown) => {
          this.usuarioErro =
            extractApiErrorMessage(e) ||
            'Não foi possível salvar o usuário.';
        },
      });
  }

  abrirNovo(callbacks?: ProfissionalCadastroDrawerCallbacks): void {
    this.callbacks = callbacks ?? null;
    this.modo = 'novo';
    this.profissionalId = null;
    this.abaAtiva = 'Cadastro';
    this.resetForm();
    this.abrirPainel();
  }

  abrirEdicao(id: number, callbacks?: ProfissionalCadastroDrawerCallbacks): void {
    if (!Number.isFinite(id) || id <= 0) return;
    this.callbacks = callbacks ?? null;
    this.modo = 'editar';
    this.profissionalId = id;
    this.abaAtiva = 'Cadastro';
    this.resetForm();
    this.abrirPainel();
    this.carregar(id);
  }

  fechar(): void {
    if (!this.aberto) return;
    this.fecharSalariosDrawer();
    this.fecharValesDrawer();
    this.panelOpen = false;
    if (this.closeTimer != null) clearTimeout(this.closeTimer);
    this.closeTimer = setTimeout(() => {
      this.closeTimer = null;
      this.aberto = false;
      this.desbloquearScrollPagina();
      this.saveSub?.unsubscribe();
      this.saveSub = null;
      this.callbacks?.onFechar?.();
      this.callbacks = null;
    }, DRAWER_ANIM_MS);
  }

  onCelularChange(v: string): void {
    this.cadastroCelular = formatarCelularBr(v);
  }

  onAniversarioInput(v: string): void {
    this.cadastroAniversario = formatarDataDdMmYyyy(v);
  }

  onCpfCnpjInput(v: string): void {
    const d = v.replace(/\D/g, '');
    this.cadastroCpfCnpj =
      d.length > 11 ? formatarCnpjBr(v) : formatarCpfBr(v);
  }

  onRgInput(v: string): void {
    this.cadastroRg = formatarRgBr9(v);
  }

  onFotoSelecionada(ev: Event): void {
    const input = ev.target as HTMLInputElement | null;
    const file = input?.files?.[0];
    if (!file || !file.type.startsWith('image/')) {
      if (input) input.value = '';
      return;
    }
    void comprimirImagemParaDataUrl(file)
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

  private fotoUrlParaPayload(): string | null | undefined {
    if (this.cadastroFotoRemovida) {
      return this.modo === 'editar' ? null : undefined;
    }
    const raw = (this.cadastroFotoUrl ?? '').trim();
    const inicial = (this.cadastroFotoUrlInicial ?? '').trim();
    if (!raw) {
      if (this.modo === 'editar' && inicial) return null;
      return undefined;
    }
    if (fotoDataUrlValidaParaEnvio(raw)) return raw;
    if (raw === inicial) return undefined;
    return undefined;
  }

  private sincronizarFotoSessao(item: ProfissionalListaItem): void {
    if (item.id !== this.auth.profissionalId()) return;
    this.auth.patchFotoUrl(profissionalFotoUrl(item));
  }

  erroNome(): string | null {
    if (!this.cadastroSubmetido && !this.cadastroNome.trim()) return null;
    return this.cadastroNome.trim() ? null : 'Nome é obrigatório';
  }

  erroCelular(): string | null {
    if (!this.cadastroSubmetido && !this.cadastroCelular.trim()) return null;
    return isCelularBr11Digitos(this.cadastroCelular)
      ? null
      : 'Celular é obrigatório (11 dígitos)';
  }

  salvar(): void {
    this.cadastroSubmetido = true;
    this.saveErro = '';
    const nome = this.cadastroNome.trim();
    const celular = telefoneBrDigitos(this.cadastroCelular);
    if (!nome) {
      this.saveErro = 'Nome é obrigatório';
      return;
    }
    if (!isCelularBr11Digitos(celular)) {
      this.saveErro = 'Celular é obrigatório (11 dígitos)';
      return;
    }
    let aniversarioIso: string | null = null;
    const aniv = this.cadastroAniversario.trim();
    if (aniv) {
      if (!dataDdMmYyyyValida(aniv)) {
        this.saveErro = 'Aniversário inválido';
        return;
      }
      const [dd, mm, yyyy] = aniv.split('/');
      aniversarioIso = `${yyyy}-${mm}-${dd}`;
    }

    const payload: ProfissionalCadastroPayload = {
      nome,
      celular,
      apelido: this.cadastroApelido.trim() || null,
      profissao: this.cadastroProfissao.trim() || null,
      aniversario: aniversarioIso,
      cpf_cnpj: this.cadastroCpfCnpj.replace(/\D/g, '') || null,
      rg: this.cadastroRg.replace(/\D/g, '') || null,
      anotacoes: this.cadastroAnotacoes.trim() || null,
      ativo: this.ativo,
      disponivel_agendamento_online: this.disponivelAgendamentoOnline,
      gerar_agenda: this.gerarAgenda,
      recebe_comissao: this.recebeComissao,
      comissao_listagem_modo: this.comissaoListagemModo,
    };
    const fotoUrlPayload = this.fotoUrlParaPayload();
    if (fotoUrlPayload !== undefined) {
      payload.foto_url = fotoUrlPayload;
    }
    const rawFoto = (this.cadastroFotoUrl ?? '').trim();
    if (
      rawFoto &&
      !this.cadastroFotoRemovida &&
      fotoUrlPayload === undefined &&
      rawFoto !== (this.cadastroFotoUrlInicial ?? '').trim()
    ) {
      this.saveErro =
        'A foto não pôde ser incluída (arquivo grande demais). Tente outra imagem.';
      return;
    }

    this.salvando = true;
    this.saveSub?.unsubscribe();
    const req$ =
      this.modo === 'novo'
        ? this.api.createProfissional(payload)
        : this.api.updateProfissional({
            id: this.profissionalId!,
            ...payload,
          });

    this.saveSub = req$
      .pipe(finalize(() => (this.salvando = false)))
      .subscribe({
        next: (item) => {
          const fotoSalva = profissionalFotoUrl(item);
          const fotoEnviada = this.fotoUrlParaPayload();
          if (
            fotoEnviada &&
            typeof fotoEnviada === 'string' &&
            fotoEnviada.length > 0 &&
            !fotoSalva
          ) {
            this.saveErro =
              'Os dados foram salvos, mas a foto não foi gravada. Tente salvar novamente.';
            return;
          }
          this.cadastroFotoUrlInicial = fotoSalva ?? '';
          this.cadastroFotoUrl = this.cadastroFotoUrlInicial;
          this.cadastroFotoRemovida = false;
          this.sincronizarFotoSessao(item);
          this.toast.show(PROFISSIONAL_SALVO_TOAST_MSG);
          this.callbacks?.onSalvo?.(item);
          this.fechar();
        },
        error: (e: unknown) => {
          this.saveErro =
            extractApiErrorMessage(e) ||
            'Não foi possível salvar o profissional.';
        },
      });
  }

  onProfNavTooltipEnter(
    event: Event,
    aba: ProfCadastroAba,
    imediato = false,
  ): void {
    if (!this.abaDesabilitada(aba)) return;
    const btn = event.currentTarget as HTMLElement;
    this.limparProfNavLockTooltipTimer();
    const mostrar = (): void => {
      this.profNavLockTooltipAba = aba;
      this.posicionarProfNavLockTooltip(btn);
    };
    if (imediato) {
      mostrar();
      return;
    }
    this.navLockTooltipTimer = setTimeout(
      mostrar,
      CLIENTE_NAV_LOCK_TOOLTIP_DELAY_MS,
    );
  }

  onProfNavTooltipLeave(aba: ProfCadastroAba): void {
    if (!this.abaDesabilitada(aba)) return;
    this.ocultarProfNavLockTooltip();
  }

  ocultarProfNavLockTooltip(): void {
    this.limparProfNavLockTooltipTimer();
    this.profNavLockTooltipVisible = false;
    this.profNavLockTooltipAba = null;
  }

  onAtivoToggleClick(ev: Event): void {
    this.pulseToggleVisual(ev);
    this.ativo = !this.ativo;
    if (!this.ativoToggleLiqArmed) this.ativoToggleLiqArmed = true;
  }

  onAtivoToggleKeydown(ev: KeyboardEvent): void {
    if (ev.key !== 'Enter' && ev.key !== ' ') return;
    ev.preventDefault();
    this.onAtivoToggleClick(ev);
  }

  onDisponivelAgendamentoOnlineToggleClick(ev: Event): void {
    this.pulseToggleVisual(ev);
    this.disponivelAgendamentoOnline = !this.disponivelAgendamentoOnline;
    if (!this.disponivelAgendamentoOnlineToggleLiqArmed) {
      this.disponivelAgendamentoOnlineToggleLiqArmed = true;
    }
  }

  onDisponivelAgendamentoOnlineToggleKeydown(ev: KeyboardEvent): void {
    if (ev.key !== 'Enter' && ev.key !== ' ') return;
    ev.preventDefault();
    this.onDisponivelAgendamentoOnlineToggleClick(ev);
  }

  onGerarAgendaToggleClick(ev: Event): void {
    this.pulseToggleVisual(ev);
    this.gerarAgenda = !this.gerarAgenda;
    if (!this.gerarAgendaToggleLiqArmed) this.gerarAgendaToggleLiqArmed = true;
  }

  onGerarAgendaToggleKeydown(ev: KeyboardEvent): void {
    if (ev.key !== 'Enter' && ev.key !== ' ') return;
    ev.preventDefault();
    this.onGerarAgendaToggleClick(ev);
  }

  onRecebeComissaoToggleClick(ev: Event): void {
    this.pulseToggleVisual(ev);
    this.recebeComissao = !this.recebeComissao;
    if (!this.recebeComissaoToggleLiqArmed) {
      this.recebeComissaoToggleLiqArmed = true;
    }
  }

  onRecebeComissaoToggleKeydown(ev: KeyboardEvent): void {
    if (ev.key !== 'Enter' && ev.key !== ' ') return;
    ev.preventDefault();
    this.onRecebeComissaoToggleClick(ev);
  }

  salvarConfigComissoes(): void {
    if (this.modo !== 'editar' || !this.profissionalId) return;
    this.saveErro = '';
    this.salvando = true;
    this.saveSub?.unsubscribe();
    this.saveSub = this.api
      .updateProfissional({
        id: this.profissionalId,
        recebe_comissao: this.recebeComissao,
        comissao_listagem_modo: this.comissaoListagemModo,
      })
      .pipe(finalize(() => (this.salvando = false)))
      .subscribe({
        next: (item) => {
          this.recebeComissao = item.recebe_comissao !== false;
          this.comissaoListagemModo =
            item.comissao_listagem_modo === 'competencia'
              ? 'competencia'
              : 'pagamento_cliente';
          this.toast.show('Configuração de comissões salva.');
        },
        error: (e: unknown) => {
          this.saveErro =
            extractApiErrorMessage(e) ||
            'Não foi possível salvar a configuração de comissões.';
        },
      });
  }

  salvarComissaoServicos(): void {
    if (this.modo !== 'editar' || !this.profissionalId) return;
    this.saveErro = '';
    this.salvando = true;
    const items = this.comissaoServicosItens.map((it) => ({
      servico_id: it.servico_id,
      tipo: it.tipo,
      valor: it.valor,
      como_auxiliar: it.como_auxiliar,
      sobre: it.sobre || 'valor_bruto',
    }));
    this.saveSub?.unsubscribe();
    this.saveSub = this.api
      .replaceProfissionalComissaoServicos(this.profissionalId, items)
      .pipe(finalize(() => (this.salvando = false)))
      .subscribe({
        next: (lista) => {
          this.comissaoServicosItens = lista;
          this.toast.show('Comissões por serviço salvas.');
        },
        error: (e: unknown) => {
          this.saveErro =
            extractApiErrorMessage(e) ||
            'Não foi possível salvar as comissões por serviço.';
        },
      });
  }

  importarComissaoServicosCatalogo(): void {
    if (this.modo !== 'editar' || !this.profissionalId) return;
    this.saveErro = '';
    this.comissaoServicosImportando = true;
    this.api
      .importarProfissionalComissaoServicosCatalogo(this.profissionalId)
      .pipe(finalize(() => (this.comissaoServicosImportando = false)))
      .subscribe({
        next: (res) => {
          this.comissaoServicosItens = res.items;
          const n = res.importados;
          this.toast.show(
            n > 0
              ? `${n} serviço(s) importado(s) do catálogo.`
              : 'Nenhum serviço novo para importar (catálogo já refletido ou vazio).',
          );
        },
        error: (e: unknown) => {
          this.saveErro =
            extractApiErrorMessage(e) ||
            'Não foi possível importar do catálogo.';
        },
      });
  }

  removerComissaoServicoLinha(servicoId: number): void {
    this.comissaoServicosItens = this.comissaoServicosItens.filter(
      (it) => it.servico_id !== servicoId,
    );
  }

  private carregarComissaoServicosSeNecessario(): void {
    if (
      this.modo !== 'editar' ||
      !this.profissionalId ||
      this.comissaoServicosCarregando ||
      this.comissaoServicosCarregado
    ) {
      return;
    }
    this.comissaoServicosCarregando = true;
    this.api.listProfissionalComissaoServicos(this.profissionalId).subscribe({
      next: (items) => {
        this.comissaoServicosItens = items;
        this.comissaoServicosCarregado = true;
        this.comissaoServicosCarregando = false;
      },
      error: () => {
        this.saveErro = 'Não foi possível carregar comissões por serviço.';
        this.comissaoServicosCarregando = false;
      },
    });
  }

  private carregar(id: number): void {
    this.carregando = true;
    this.api.getProfissional(id).subscribe({
      next: (p) => {
        this.cadastroNome = p.nome ?? '';
        this.cadastroApelido = p.apelido ?? '';
        this.cadastroCelular = formatarCelularBr(p.celular);
        this.cadastroProfissao = p.profissao ?? '';
        if (p.aniversario) {
          const [y, m, d] = p.aniversario.slice(0, 10).split('-');
          this.cadastroAniversario = `${d}/${m}/${y}`;
        }
        this.cadastroCpfCnpj = p.cpf_cnpj ?? '';
        this.cadastroRg = p.rg ?? '';
        this.cadastroAnotacoes = p.anotacoes ?? '';
        this.ativo = p.ativo !== false;
        this.disponivelAgendamentoOnline =
          p.disponivel_agendamento_online !== false;
        this.gerarAgenda = p.gerar_agenda !== false;
        this.recebeComissao = p.recebe_comissao !== false;
        this.comissaoListagemModo =
          p.comissao_listagem_modo === 'competencia'
            ? 'competencia'
            : 'pagamento_cliente';
        this.enderecoCep = formatarCepBr(p.cep ?? '');
        this.enderecoLogradouro = p.logradouro ?? '';
        this.enderecoNumero = p.endereco_numero ?? '';
        this.enderecoComplemento = p.complemento ?? '';
        this.enderecoBairro = p.bairro ?? '';
        this.enderecoEstado = p.estado ?? '';
        this.enderecoCidade = p.cidade ?? '';
        const foto = profissionalFotoUrl(p);
        this.cadastroFotoUrl = foto ?? '';
        this.cadastroFotoUrlInicial = foto ?? '';
        this.cadastroFotoRemovida = false;
        this.carregando = false;
      },
      error: () => {
        this.saveErro = 'Não foi possível carregar o profissional.';
        this.carregando = false;
      },
    });
  }

  private resetForm(): void {
    this.cadastroSubmetido = false;
    this.saveErro = '';
    this.salvando = false;
    this.carregando = false;
    this.cadastroNome = '';
    this.cadastroApelido = '';
    this.cadastroCelular = '';
    this.cadastroProfissao = '';
    this.cadastroAniversario = '';
    this.cadastroCpfCnpj = '';
    this.cadastroRg = '';
    this.cadastroAnotacoes = '';
    this.cadastroFotoUrl = '';
    this.cadastroFotoUrlInicial = '';
    this.cadastroFotoRemovida = false;
    this.enderecoCep = '';
    this.enderecoLogradouro = '';
    this.enderecoNumero = '';
    this.enderecoComplemento = '';
    this.enderecoBairro = '';
    this.enderecoEstado = '';
    this.enderecoCidade = '';
    this.ativo = true;
    this.disponivelAgendamentoOnline = true;
    this.gerarAgenda = true;
    this.recebeComissao = true;
    this.comissaoListagemModo = 'pagamento_cliente';
    this.comissaoTextoRecibo = '';
    this.salariosDrawerAberto = false;
    this.salariosDrawerPanelOpen = false;
    this.valesDrawerAberto = false;
    this.valesDrawerPanelOpen = false;
    this.comissaoServicosItens = [];
    this.comissaoServicosCarregando = false;
    this.comissaoServicosCarregado = false;
    this.comissaoServicosImportando = false;
    this.secaoConfiguracoesAberta = true;
    this.ativoToggleLiqArmed = false;
    this.disponivelAgendamentoOnlineToggleLiqArmed = false;
    this.gerarAgendaToggleLiqArmed = false;
    this.recebeComissaoToggleLiqArmed = false;
    this.usuarioEmail = '';
    this.usuarioSenha = '';
    this.usuarioAtivo = true;
    this.usuarioTemConta = false;
    this.usuarioMostrarSenha = false;
    this.usuarioCarregando = false;
    this.usuarioSalvando = false;
    this.usuarioErro = '';
    this.ocultarProfNavLockTooltip();
  }

  private posicionarProfNavLockTooltip(btn: HTMLElement): void {
    const label = btn.querySelector<HTMLElement>('.cliente-nav__label');
    if (!label) return;
    const r = label.getBoundingClientRect();
    this.profNavLockTooltipX = r.left + r.width / 2;
    this.profNavLockTooltipY = r.top;
    this.profNavLockTooltipVisible = true;
  }

  private limparProfNavLockTooltipTimer(): void {
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

  private abrirPainel(): void {
    this.aberto = true;
    this.bloquearScrollPagina();
    requestAnimationFrame(() => {
      requestAnimationFrame(() => {
        this.panelOpen = true;
      });
    });
  }

  private obterLarguraScrollbar(): number {
    if (typeof window === 'undefined') return 0;
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
