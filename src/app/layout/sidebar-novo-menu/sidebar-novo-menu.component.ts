import {

  Component,

  ElementRef,

  HostListener,

  Input,

  OnDestroy,

  ViewChild,

  inject,

} from '@angular/core';

import { Router } from '@angular/router';

import { SessaoUsuarioService } from '../../core/services/sessao-usuario.service';

import { ClienteCadastroDrawerService } from '../../shared/cliente-cadastro-drawer/cliente-cadastro-drawer.service';

import { ProfissionalCadastroDrawerService } from '../../shared/profissional-cadastro-drawer/profissional-cadastro-drawer.service';

import { ServicoCadastroDrawerService } from '../../shared/servico-cadastro-drawer/servico-cadastro-drawer.service';

import { ProdutoCadastroDrawerService } from '../../shared/produto-cadastro-drawer/produto-cadastro-drawer.service';

import { CategoriaCadastroDrawerService } from '../../shared/categoria-cadastro-drawer/categoria-cadastro-drawer.service';

import { MarcaCadastroDrawerService } from '../../shared/marca-cadastro-drawer/marca-cadastro-drawer.service';

import { FornecedorCadastroDrawerService } from '../../shared/fornecedor-cadastro-drawer/fornecedor-cadastro-drawer.service';

import { AgendaNovoGlobalService } from '../../shared/agenda-novo-global/agenda-novo-global.service';

import { FinTransacaoNovoDrawerService } from '../../shared/fin-transacao-novo-drawer/fin-transacao-novo-drawer.service';

import type { FinNovoAtalhoTipo } from '../../shared/fin-transacao-novo-drawer/fin-transacao-novo-drawer.service';

import { AdminPinService } from '../../core/services/admin-pin.service';

import { SidebarFlyoutService } from '../sidebar-flyout.service';

type ShortcutId =

  | 'agendamento'

  | 'comanda'

  | 'orcamento'

  | 'pacote'

  | 'cliente'

  | 'servico'

  | 'produto'

  | 'categoria'

  | 'profissional'

  | 'fornecedor'

  | 'compra'

  | 'marca'

  | 'recebimento'

  | 'despesa'

  | 'vale'

  | 'transferencia';

interface ShortcutItem {

  id: ShortcutId;

  label: string;

  adminOnly?: boolean;

}

interface ShortcutSection {

  title: string;

  adminOnly?: boolean;

  items: ShortcutItem[];

}

@Component({

  selector: 'app-sidebar-novo-menu',

  standalone: true,

  host: {
    '[class.sidebar-novo-host--open]': 'menuMontado',
  },

  templateUrl: './sidebar-novo-menu.component.html',

  styleUrl: './sidebar-novo-menu.component.scss',

})

export class SidebarNovoMenuComponent implements OnDestroy {

  private readonly router = inject(Router);

  private readonly sessao = inject(SessaoUsuarioService);

  private readonly clienteDrawer = inject(ClienteCadastroDrawerService);

  private readonly profDrawer = inject(ProfissionalCadastroDrawerService);

  private readonly servicoDrawer = inject(ServicoCadastroDrawerService);

  private readonly produtoDrawer = inject(ProdutoCadastroDrawerService);

  private readonly categoriaDrawer = inject(CategoriaCadastroDrawerService);

  private readonly marcaDrawer = inject(MarcaCadastroDrawerService);

  private readonly fornecedorDrawer = inject(FornecedorCadastroDrawerService);

  private readonly agendaNovoGlobal = inject(AgendaNovoGlobalService);

  private readonly finNovoDrawer = inject(FinTransacaoNovoDrawerService);

  private readonly adminPin = inject(AdminPinService);

  private readonly flyout = inject(SidebarFlyoutService);

  private readonly hostEl = inject(ElementRef<HTMLElement>);

  @Input() collapsed = false;

  @ViewChild('novoBtn') novoBtn?: ElementRef<HTMLButtonElement>;

  @ViewChild('novoPanel') novoPanel?: ElementRef<HTMLElement>;

  private panelRestoreParent: (() => void) | null = null;

  /** Painel no DOM (inclui animação de saída). */
  menuMontado = false;
  /** Classe visual aberta (drop + fade). */
  menuPanelOpen = false;
  private menuCloseTimer: ReturnType<typeof setTimeout> | null = null;
  private static readonly MENU_ANIM_MS = 420;

  panelTop = 0;

  panelLeft = 0;

  readonly sections: ShortcutSection[] = [

    {

      title: 'Principal',

      items: [

        { id: 'agendamento', label: 'Agendamento' },

        { id: 'comanda', label: 'Comanda' },

        { id: 'orcamento', label: 'Orçamento' },

        { id: 'pacote', label: 'Pacote' },

      ],

    },

    {

      title: 'Cadastros',

      items: [

        { id: 'cliente', label: 'Cliente' },

        { id: 'servico', label: 'Serviço', adminOnly: true },

        { id: 'produto', label: 'Produto', adminOnly: true },

        { id: 'categoria', label: 'Categoria', adminOnly: true },

        { id: 'profissional', label: 'Profissional', adminOnly: true },

        { id: 'fornecedor', label: 'Fornecedor', adminOnly: true },

        { id: 'compra', label: 'Compra', adminOnly: true },

        { id: 'marca', label: 'Marca', adminOnly: true },

      ],

    },

    {

      title: 'Financeiro',

      adminOnly: true,

      items: [

        { id: 'recebimento', label: 'Recebimento', adminOnly: true },

        { id: 'despesa', label: 'Despesa', adminOnly: true },

        { id: 'vale', label: 'Vale', adminOnly: true },

        { id: 'transferencia', label: 'Transferência', adminOnly: true },

      ],

    },

  ];

  sectionsVisiveis(): ShortcutSection[] {

    const admin = this.sessao.isAdmin();

    return this.sections

      .filter((s) => !s.adminOnly || admin)

      .map((s) => ({

        ...s,

        items: s.items.filter((i) => !i.adminOnly || admin),

      }))

      .filter((s) => s.items.length > 0);

  }

  toggleMenu(ev: Event): void {
    ev.preventDefault();
    ev.stopPropagation();
    if (this.menuMontado && this.menuPanelOpen) {
      this.fecharMenu();
      return;
    }
    if (this.menuMontado && !this.menuPanelOpen) {
      // Reabre no meio do fade-out
      if (this.menuCloseTimer != null) {
        clearTimeout(this.menuCloseTimer);
        this.menuCloseTimer = null;
      }
      this.flyout.open(() => this.fecharMenu());
      this.menuPanelOpen = true;
      return;
    }
    this.abrirMenu();
  }

  private abrirMenu(): void {
    this.flyout.open(() => this.fecharMenu());
    this.menuMontado = true;
    this.menuPanelOpen = false;
    queueMicrotask(() => {
      requestAnimationFrame(() => {
        this.portalizarPanel();
        this.atualizarPosicaoPanel();
        // Força reflow para a transição CSS rodar de fato (senão “pula”).
        const el = this.novoPanel?.nativeElement;
        if (el) void el.offsetHeight;
        requestAnimationFrame(() => {
          this.menuPanelOpen = true;
        });
      });
    });
  }

  fecharMenu(): void {
    if (!this.menuMontado) return;
    this.menuPanelOpen = false;
    if (this.menuCloseTimer != null) clearTimeout(this.menuCloseTimer);
    this.menuCloseTimer = setTimeout(() => {
      this.menuCloseTimer = null;
      this.menuMontado = false;
      this.restaurarPanelPortal();
      this.flyout.release(() => this.fecharMenu());
    }, SidebarNovoMenuComponent.MENU_ANIM_MS);
  }

  /**
   * Fecha o painel sem animação — usado ao abrir um drawer/atalho.
   * Evita blur+z-index 1650 competir com o slide do drawer (abre “travando”).
   */
  private fecharMenuImediato(): void {
    if (!this.menuMontado && !this.menuPanelOpen) return;
    if (this.menuCloseTimer != null) {
      clearTimeout(this.menuCloseTimer);
      this.menuCloseTimer = null;
    }
    this.menuPanelOpen = false;
    this.menuMontado = false;
    this.restaurarPanelPortal();
    this.flyout.release(() => this.fecharMenu());
  }

  ngOnDestroy(): void {
    if (this.menuCloseTimer != null) clearTimeout(this.menuCloseTimer);
    this.restaurarPanelPortal();
  }

  /** Painel em `body` para não ficar atrás da sidebar / conteúdo principal. */
  private portalizarPanel(): void {

    const el = this.novoPanel?.nativeElement;

    if (!el || this.panelRestoreParent) return;

    const parent = el.parentElement;

    const next = el.nextSibling;

    document.body.appendChild(el);

    this.panelRestoreParent = () => {

      if (!parent) return;

      if (next && next.parentNode === parent) {

        parent.insertBefore(el, next);

      } else {

        parent.appendChild(el);

      }

    };

  }

  private restaurarPanelPortal(): void {

    this.panelRestoreParent?.();

    this.panelRestoreParent = null;

  }

  private atualizarPosicaoPanel(): void {

    const btn =

      this.novoBtn?.nativeElement ??

      this.hostEl.nativeElement.querySelector(

        '.sidebar-novo__btn',

      ) as HTMLButtonElement | null;

    if (!btn) return;

    const r = btn.getBoundingClientRect();

    const panel = this.novoPanel?.nativeElement;

    const panelW = panel?.offsetWidth ?? 420;

    const gap = 8;

    let left = r.left;

    const top = r.bottom + gap;

    const margin = 8;

    left = Math.max(

      margin,

      Math.min(left, window.innerWidth - panelW - margin),

    );

    this.panelTop = top;

    this.panelLeft = left;

  }

  executar(id: ShortcutId): void {
    this.fecharMenuImediato();
    // Um frame livre: o painel (blur) some do DOM antes de montar o drawer.
    requestAnimationFrame(() => {
      this.executarAtalho(id);
    });
  }

  private executarAtalho(id: ShortcutId): void {
    switch (id) {
      case 'agendamento':
        this.agendaNovoGlobal.abrir('agendamento');
        break;
      case 'comanda':
        this.agendaNovoGlobal.abrir('comanda');
        break;
      case 'orcamento':
        this.agendaNovoGlobal.abrir('orcamento');
        break;
      case 'pacote':
        void this.router.navigate(['/pacotes']);
        break;
      case 'cliente':
        this.clienteDrawer.abrirNovo('');
        break;
      case 'servico':
        this.servicoDrawer.abrirNovo();
        break;
      case 'produto':
        this.produtoDrawer.abrirNovo();
        break;
      case 'categoria':
        this.categoriaDrawer.abrirNovo();
        break;
      case 'profissional':
        this.profDrawer.abrirNovo();
        break;
      case 'fornecedor':
        this.fornecedorDrawer.abrirNovo();
        break;
      case 'compra':
        void this.router.navigate(['/compras']);
        break;
      case 'marca':
        this.marcaDrawer.abrirNovo();
        break;
      case 'recebimento':
        this.abrirAtalhoFinanceiro('receita');
        break;
      case 'despesa':
        this.abrirAtalhoFinanceiro('despesa');
        break;
      case 'vale':
        this.abrirAtalhoFinanceiro('vale');
        break;
      case 'transferencia':
        this.abrirAtalhoFinanceiro('transferencia');
        break;
    }
  }

  /** Atalhos financeiros exigem PIN desbloqueado; senão manda para o cadeado. */
  private abrirAtalhoFinanceiro(tipo: FinNovoAtalhoTipo): void {
    if (!this.adminPin.unlocked()) {
      void this.router.navigate(['/financeiro']);
      return;
    }
    this.finNovoDrawer.abrir(tipo);
  }

  @HostListener('document:keydown.escape', ['$event'])
  onEscape(ev: KeyboardEvent): void {
    if (!this.menuMontado) return;
    ev.preventDefault();
    ev.stopPropagation();
    this.fecharMenu();
  }

  @HostListener('document:click', ['$event'])

  onDocumentClick(ev: MouseEvent): void {

    if (!this.menuMontado) return;

    const t = ev.target as Node | null;

    if (t && this.hostEl.nativeElement.contains(t)) return;

    const panel = document.querySelector('.sidebar-novo__panel--fixed');

    if (t && panel?.contains(t)) return;

    this.fecharMenu();

  }

  @HostListener('window:resize')

  @HostListener('window:scroll')

  onViewportChange(): void {

    if (this.menuMontado) this.atualizarPosicaoPanel();

  }

}

