import { Injectable, inject } from '@angular/core';
import { Subscription, finalize } from 'rxjs';
import { SheetsApiService } from '../../core/services/sheets-api.service';
import type {
  ProfissionalCadastroPayload,
  ProfissionalComissaoServicoItem,
  ProfissionalListaItem,
} from '../../core/models/api.models';
import {
  dataDdMmYyyyValida,
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
import { AppToastService } from '../app-toast/app-toast.service';
import {
  CLIENTE_NAV_LOCK_TOOLTIP_DELAY_MS,
  DRAWER_ANIM_MS,
} from '../cliente-cadastro-drawer/cliente-cadastro-drawer.service';

export const PROFISSIONAL_SALVO_TOAST_MSG = 'Profissional salvo com sucesso!';

export const PROF_CADASTRO_ABAS = [
  'Cadastro',
  'Endereço',
  'Usuário',
  'Assinatura digital',
  'Expediente',
  'Personalizar serviços',
  'Configurar comissões',
  'Comissões e Auxiliares',
  'Pagar salário/comissão',
  'Vales e Bonificações',
  'Permissões',
  'Contas de banco',
] as const;

export type ProfCadastroAba = (typeof PROF_CADASTRO_ABAS)[number];

/** Abas clicáveis no drawer (demais mostram tooltip «Em breve»). */
export const PROF_CADASTRO_ABAS_ATIVAS: readonly ProfCadastroAba[] = [
  'Cadastro',
  'Endereço',
  'Usuário',
  'Assinatura digital',
  'Configurar comissões',
  'Comissões e Auxiliares',
];

const PROF_COMISSAO_ABAS: readonly ProfCadastroAba[] = [
  'Configurar comissões',
  'Comissões e Auxiliares',
];

export interface ProfissionalCadastroDrawerCallbacks {
  onSalvo?: (p: ProfissionalListaItem) => void;
  onFechar?: () => void;
}

@Injectable({ providedIn: 'root' })
export class ProfissionalCadastroDrawerService {
  private readonly api = inject(SheetsApiService);
  private readonly toast = inject(AppToastService);

  aberto = false;
  panelOpen = false;
  modo: 'novo' | 'editar' = 'novo';
  profissionalId: number | null = null;
  abaAtiva: ProfCadastroAba = 'Cadastro';
  readonly abas = PROF_CADASTRO_ABAS;

  cadastroNome = '';
  cadastroApelido = '';
  cadastroCelular = '';
  cadastroProfissao = '';
  cadastroAniversario = '';
  cadastroCpfCnpj = '';
  cadastroRg = '';
  cadastroAnotacoes = '';

  ativo = true;
  disponivelAgendamentoOnline = true;
  gerarAgenda = true;
  recebeComissao = true;
  comissaoListagemModo: 'pagamento_cliente' | 'competencia' =
    'pagamento_cliente';

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

  private callbacks: ProfissionalCadastroDrawerCallbacks | null = null;
  private saveSub: Subscription | null = null;
  private closeTimer: ReturnType<typeof setTimeout> | null = null;
  private navLockTooltipTimer: ReturnType<typeof setTimeout> | null = null;
  private bodyScrollPreDrawer = 0;
  private pageScrollLockAtivo = false;

  tituloCabecalho(): string {
    return this.modo === 'novo' ? 'Novo profissional' : 'Editar profissional';
  }

  abaDesabilitada(aba: ProfCadastroAba): boolean {
    if (!PROF_CADASTRO_ABAS_ATIVAS.includes(aba)) return true;
    if (PROF_COMISSAO_ABAS.includes(aba) && this.modo === 'novo') return true;
    return false;
  }

  profNavLockTooltipTexto(aba: ProfCadastroAba): string {
    if (
      PROF_COMISSAO_ABAS.includes(aba) &&
      this.modo === 'novo' &&
      this.abaDesabilitada(aba)
    ) {
      return 'Salve o profissional antes de configurar comissões';
    }
    return 'Em breve';
  }

  abaAtivaIndex(): number {
    const ix = this.abas.indexOf(this.abaAtiva);
    return ix >= 0 ? ix : 0;
  }

  selecionarAba(aba: ProfCadastroAba): void {
    if (this.abaDesabilitada(aba)) return;
    this.abaAtiva = aba;
    if (aba === 'Comissões e Auxiliares') {
      this.carregarComissaoServicosSeNecessario();
    }
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
    this.ativo = true;
    this.disponivelAgendamentoOnline = true;
    this.gerarAgenda = true;
    this.recebeComissao = true;
    this.comissaoListagemModo = 'pagamento_cliente';
    this.comissaoServicosItens = [];
    this.comissaoServicosCarregando = false;
    this.comissaoServicosCarregado = false;
    this.comissaoServicosImportando = false;
    this.secaoConfiguracoesAberta = true;
    this.ativoToggleLiqArmed = false;
    this.disponivelAgendamentoOnlineToggleLiqArmed = false;
    this.gerarAgendaToggleLiqArmed = false;
    this.recebeComissaoToggleLiqArmed = false;
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
