import { ApplicationRef, Injectable, inject } from '@angular/core';
import { Subject } from 'rxjs';
import { toYmd } from '../../core/utils/atendimento-display';
import {
  DRAWER_ANIM_MS,
  beginDrawerCloseAnimation,
  runDrawerOpenAnimation,
  type DrawerOpenAnimHandle,
} from '../drawer-panel-anim';

export type AgendaNovoGlobalModo =
  | 'agendamento'
  | 'comanda'
  | 'orcamento';

export type AgendaNovoGlobalContexto = {
  data: string;
  profissional_id: number;
  hora?: string;
  id_atendimento?: string;
};

type AgendaNovoPageHandler = (modo: AgendaNovoGlobalModo) => boolean;

/**
 * Drawer global «Novo agendamento / comanda / orçamento»
 * (atalhos do menu Novo — sem mudar de rota).
 *
 * Se a página ativa (Agenda / Comandas / Orçamentos) registrar um handler,
 * o atalho abre o drawer local da página — mesma animação da grelha/botão Novo.
 * Caso contrário, usa o host global em `app.component`.
 */
@Injectable({ providedIn: 'root' })
export class AgendaNovoGlobalService {
  private readonly appRef = inject(ApplicationRef);

  /** Emitido após salvar com sucesso no host global (páginas podem refrescar). */
  readonly salvo$ = new Subject<AgendaNovoGlobalModo>();

  aberto = false;
  panelOpen = false;
  modo: AgendaNovoGlobalModo = 'agendamento';
  contexto: AgendaNovoGlobalContexto | null = null;

  private pageHandler: AgendaNovoPageHandler | null = null;
  private closeTimer: ReturnType<typeof setTimeout> | null = null;
  private openAnim: DrawerOpenAnimHandle | null = null;
  private bodyScrollPreDrawer = 0;
  private pageScrollLockAtivo = false;

  get fluxoSomenteComanda(): boolean {
    return this.modo === 'comanda' || this.modo === 'orcamento';
  }

  get fluxoOrcamento(): boolean {
    return this.modo === 'orcamento';
  }

  get ariaLabel(): string {
    if (this.modo === 'comanda') return 'Nova comanda';
    if (this.modo === 'orcamento') return 'Novo orçamento';
    return 'Novo agendamento';
  }

  registerPageHandler(handler: AgendaNovoPageHandler): void {
    this.pageHandler = handler;
  }

  unregisterPageHandler(handler: AgendaNovoPageHandler): void {
    if (this.pageHandler === handler) this.pageHandler = null;
  }

  abrir(modo: AgendaNovoGlobalModo): void {
    if (this.pageHandler?.(modo)) return;
    this.abrirHostGlobal(modo);
  }

  private abrirHostGlobal(modo: AgendaNovoGlobalModo): void {
    if (this.closeTimer != null) {
      clearTimeout(this.closeTimer);
      this.closeTimer = null;
    }
    this.openAnim?.cancel();

    this.modo = modo;
    this.contexto = {
      data: toYmd(new Date()),
      profissional_id: 0,
      hora: '',
      id_atendimento: undefined,
    };
    this.aberto = true;
    this.bloquearScrollPagina();
    this.openAnim = runDrawerOpenAnimation({
      setPanelOpen: (open) => {
        this.panelOpen = open;
      },
      appRef: this.appRef,
      reflowSelector: '.agenda-novo-global-drawer.app-drawer',
    });
  }

  fechar(): void {
    if (!this.aberto) return;
    this.openAnim?.cancel();
    this.openAnim = null;
    beginDrawerCloseAnimation({
      setPanelOpen: (open) => {
        this.panelOpen = open;
      },
      appRef: this.appRef,
    });
    if (this.closeTimer != null) clearTimeout(this.closeTimer);
    this.closeTimer = setTimeout(() => {
      this.closeTimer = null;
      this.aberto = false;
      this.contexto = null;
      this.desbloquearScrollPagina();
    }, DRAWER_ANIM_MS);
  }

  onSalvo(): void {
    const modo = this.modo;
    this.salvo$.next(modo);
    this.fechar();
  }

  private obterLarguraScrollbar(): number {
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
