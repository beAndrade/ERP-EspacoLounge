import { NgClass } from '@angular/common';
import {
  Component,
  DestroyRef,
  ElementRef,
  HostListener,
  OnInit,
  inject,
} from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import {
  NavigationEnd,
  Router,
  RouterLink,
  RouterLinkActive,
  RouterOutlet,
} from '@angular/router';
import { filter } from 'rxjs';
import { AppToastComponent } from './shared/app-toast/app-toast.component';
import { ClienteCadastroDrawerHostComponent } from './shared/cliente-cadastro-drawer/cliente-cadastro-drawer-host.component';
import { ProfissionalCadastroDrawerHostComponent } from './shared/profissional-cadastro-drawer/profissional-cadastro-drawer-host.component';
import { ServicoCadastroDrawerHostComponent } from './shared/servico-cadastro-drawer/servico-cadastro-drawer-host.component';
import { ProdutoCadastroDrawerHostComponent } from './shared/produto-cadastro-drawer/produto-cadastro-drawer-host.component';
import { CategoriaCadastroDrawerHostComponent } from './shared/categoria-cadastro-drawer/categoria-cadastro-drawer-host.component';
import { MarcaCadastroDrawerHostComponent } from './shared/marca-cadastro-drawer/marca-cadastro-drawer-host.component';
import { FornecedorCadastroDrawerHostComponent } from './shared/fornecedor-cadastro-drawer/fornecedor-cadastro-drawer-host.component';
import { SessaoUsuarioService } from './core/services/sessao-usuario.service';
import { SidebarProfileComponent } from './layout/sidebar-profile/sidebar-profile.component';
import { SidebarFlyoutService } from './layout/sidebar-flyout.service';
import { mediaQueryMin } from './styles/breakpoints';
import { AppShellUiService } from './core/services/app-shell-ui.service';
import { SidebarNovoMenuComponent } from './layout/sidebar-novo-menu/sidebar-novo-menu.component';
import { MobileBottomNavComponent } from './layout/mobile-bottom-nav/mobile-bottom-nav.component';
import { MinhaContaDrawerHostComponent } from './shared/minha-conta-drawer/minha-conta-drawer-host.component';
import { FinTransacaoNovoDrawerHostComponent } from './shared/fin-transacao-novo-drawer/fin-transacao-novo-drawer-host.component';
import { AgendaNovoGlobalHostComponent } from './shared/agenda-novo-global/agenda-novo-global-host.component';

const SIDEBAR_COLLAPSED_KEY = 'espaco-lounge-sidebar-collapsed';

export type NavSidebarDropdownId =
  | 'financeiro'
  | 'controle'
  | 'cadastros'
  | 'marketing'
  | 'relatorios';

/** Flyout do rail desktop: secções nav-expand + Principal. */
export type NavCollapsedFlyoutId = NavSidebarDropdownId | 'principal';

@Component({
  selector: 'app-root',
  standalone: true,
  imports: [
    RouterOutlet,
    RouterLink,
    RouterLinkActive,
    NgClass,
    ClienteCadastroDrawerHostComponent,
    ProfissionalCadastroDrawerHostComponent,
    ServicoCadastroDrawerHostComponent,
    ProdutoCadastroDrawerHostComponent,
    CategoriaCadastroDrawerHostComponent,
    MarcaCadastroDrawerHostComponent,
    FornecedorCadastroDrawerHostComponent,
    MinhaContaDrawerHostComponent,
    FinTransacaoNovoDrawerHostComponent,
    AgendaNovoGlobalHostComponent,
    SidebarProfileComponent,
    SidebarNovoMenuComponent,
    MobileBottomNavComponent,
    AppToastComponent,
  ],
  templateUrl: './app.component.html',
  styleUrl: './app.component.scss',
})
export class AppComponent implements OnInit {
  private readonly router = inject(Router);
  private readonly destroyRef = inject(DestroyRef);
  private readonly hostEl = inject(ElementRef<HTMLElement>);
  readonly sessao = inject(SessaoUsuarioService);
  private readonly shellUi = inject(AppShellUiService);
  private readonly sidebarFlyout = inject(SidebarFlyoutService);

  readonly title = 'Espaço Lounge';
  isPublicRoute = false;

  /** Viewport estreito: menu lateral em overlay (< shellMobile / ≤767px). */
  isMobileViewport = false;
  mobileNavOpen = false;
  private desktopMq: MediaQueryList | null = null;

  /** Menu Principal accordion (sidebar expandida / overlay mobile). */
  principalExpanded = true;

  /** Rota «Principal» ativa no ciclo anterior (para só auto-abrir ao entrar). */
  private lastPrincipalActive = false;

  sidebarCollapsed = false;

  /**
   * Rail de ícones + flyout: só desktop com sidebar recolhida.
   * No mobile o overlay usa sempre o chrome expandido (acordeão).
   */
  get sidebarIconRail(): boolean {
    return this.sidebarCollapsed && !this.isMobileViewport;
  }

  /**
   * Secções Financeiro, Controle, etc. abertas em simultâneo.
   * Abrem ao entrar na rota da secção; o utilizador pode fechar mesmo com a rota ativa.
   */
  navExpandOpenIds: NavSidebarDropdownId[] = [];

  /** Secções com rota ativa no ciclo anterior (para só auto-abrir ao entrar). */
  private lastActiveNavSections = new Set<NavSidebarDropdownId>();

  /**
   * Flyout da sidebar colapsada (grupos com vários filhos).
   * Separado de `navExpandOpenIds` para o auto-open por rota não abrir flyout.
   */
  collapsedNavFlyoutId: NavCollapsedFlyoutId | null = null;

  private flyoutTrigger: HTMLElement | null = null;
  private flyoutPortal: {
    el: HTMLElement;
    parent: HTMLElement;
    next: ChildNode | null;
  } | null = null;
  private readonly closeCollapsedNavFlyoutBound = () =>
    this.closeCollapsedNavFlyout();

  /**
   * Grupos com um único filho no HTML: no colapsado navegam direto.
   * Multi-filho → flyout (sem listar rotas aqui).
   */
  private readonly collapsedNavDirectRoute: Partial<
    Record<NavSidebarDropdownId, string>
  > = {
    relatorios: '/relatorios/painel',
  };

  /** Prefixos de rota do grupo Principal (Painel, Agenda, Comandas, …). */
  private readonly principalPrefixes: readonly string[] = [
    '/painel',
    '/agenda',
    '/comandas',
    '/orcamentos',
    '/pacotes',
  ];

  /** Prefixos de rota por secção do menu (manter aberto ao navegar dentro da mesma secção). */
  private readonly navDropdownPrefixes: Record<
    NavSidebarDropdownId,
    readonly string[]
  > = {
    financeiro: ['/financeiro'],
    controle: [
      '/estoque',
      '/servicos',
      '/pacotes/predefinidos',
      '/categorias',
      '/marcas',
      '/compras',
    ],
    cadastros: ['/clientes', '/profissionais', '/fornecedores'],
    marketing: ['/promocoes', '/cashback', '/avaliacoes'],
    relatorios: ['/relatorios'],
  };

  ngOnInit(): void {
    try {
      if (localStorage.getItem(SIDEBAR_COLLAPSED_KEY) === '1') {
        this.sidebarCollapsed = true;
      }
    } catch {
      /* ignore */
    }
    this.setupMobileViewport();
    this.setupShellUiRequests();
    this.syncNavExpandForActiveRoutes();
    this.router.events
      .pipe(filter((e): e is NavigationEnd => e instanceof NavigationEnd))
      .subscribe((ev) => {
        this.syncPublicRoute(ev.urlAfterRedirects);
        this.syncNavExpandForActiveRoutes();
        this.closeCollapsedNavFlyout();
        this.closeMobileNav();
      });
    this.syncPublicRoute(this.router.url);
    this.destroyRef.onDestroy(() => this.closeCollapsedNavFlyout());
  }

  private syncPublicRoute(url: string): void {
    const path = (url.split('?')[0] ?? '').replace(/\/+$/, '') || '/';
    this.isPublicRoute = path === '/login' || path === '/agendar';
  }

  toggleMobileNav(): void {
    const opening = !this.mobileNavOpen;
    this.closeCollapsedNavFlyout();
    if (opening) {
      // Estado limpo ANTES de mostrar o overlay (evita animação residual).
      this.resetMobileNavGroupsClosed();
      this.mobileNavOpen = true;
    } else {
      this.closeMobileNav();
    }
  }

  private setupShellUiRequests(): void {
    this.shellUi.onToggleMobileNav
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe(() => this.toggleMobileNav());
    this.shellUi.onToggleSidebar
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe(() => this.toggleSidebar());
  }

  closeMobileNav(): void {
    const wasOpen = this.mobileNavOpen;
    this.mobileNavOpen = false;
    this.closeCollapsedNavFlyout();
    // Reset ao fechar (NavigationEnd / backdrop): painéis já em 0fr antes de reabrir.
    if (wasOpen && this.isMobileViewport) {
      this.resetMobileNavGroupsClosed();
    }
  }

  /**
   * Ao abrir o overlay mobile: todos os grupos começam fechados.
   * Atualiza `lastActive*` para o sync por rota não reabrir na hora.
   */
  private resetMobileNavGroupsClosed(): void {
    this.navExpandOpenIds = [];
    this.principalExpanded = false;
    const secaoIds: NavSidebarDropdownId[] = [
      'financeiro',
      'controle',
      'cadastros',
      'marketing',
      'relatorios',
    ];
    this.lastActiveNavSections = new Set(
      secaoIds.filter((id) => this.sectionActive(id)),
    );
    this.lastPrincipalActive = this.principalSectionActive();
  }

  private setupMobileViewport(): void {
    if (typeof window === 'undefined' || !window.matchMedia) return;
    // ≥ shellMobile (768) = desktop; abaixo = mobile (≤767).
    this.desktopMq = window.matchMedia(mediaQueryMin('shellMobile'));
    const apply = (): void => {
      const wasMobile = this.isMobileViewport;
      this.isMobileViewport = !(this.desktopMq?.matches ?? true);
      if (this.isMobileViewport) {
        this.mobileNavOpen = false;
        this.closeCollapsedNavFlyout();
        this.resetMobileNavGroupsClosed();
      } else {
        this.closeCollapsedNavFlyout();
        if (wasMobile) {
          this.syncNavExpandForActiveRoutes();
        }
      }
    };
    apply();
    const onChange = (): void => apply();
    this.desktopMq.addEventListener('change', onChange);
    this.destroyRef.onDestroy(() => {
      this.desktopMq?.removeEventListener('change', onChange);
    });
  }

  onNavExpandTrigger(ev: MouseEvent, id: NavSidebarDropdownId): void {
    ev.preventDefault();
    ev.stopPropagation();
    if (this.sidebarIconRail) {
      const direct = this.collapsedNavDirectRoute[id];
      if (direct) {
        this.closeCollapsedNavFlyout();
        void this.router.navigateByUrl(direct);
        return;
      }
      if (this.collapsedNavFlyoutId === id) {
        this.closeCollapsedNavFlyout();
        return;
      }
      this.openCollapsedNavFlyout(id, ev.currentTarget as HTMLElement);
      return;
    }
    const idx = this.navExpandOpenIds.indexOf(id);
    if (idx >= 0) {
      this.navExpandOpenIds = this.navExpandOpenIds.filter((x) => x !== id);
    } else {
      this.navExpandOpenIds = [...this.navExpandOpenIds, id];
    }
  }

  navExpandIsOpen(id: NavSidebarDropdownId): boolean {
    return this.navExpandOpenIds.includes(id);
  }

  collapsedNavFlyoutIsOpen(id: NavCollapsedFlyoutId): boolean {
    return this.collapsedNavFlyoutId === id;
  }

  /** `aria-expanded`: acordeão (desktop expandido / mobile) ou flyout (rail). */
  navExpandAriaExpanded(id: NavSidebarDropdownId): boolean {
    if (this.sidebarIconRail) {
      return this.collapsedNavFlyoutId === id;
    }
    return this.navExpandOpenIds.includes(id);
  }

  principalAriaExpanded(): boolean {
    if (this.sidebarIconRail) {
      return this.collapsedNavFlyoutId === 'principal';
    }
    return this.principalExpanded;
  }

  onPrincipalTrigger(ev: MouseEvent): void {
    ev.preventDefault();
    ev.stopPropagation();
    if (this.sidebarIconRail) {
      if (this.collapsedNavFlyoutId === 'principal') {
        this.closeCollapsedNavFlyout();
        return;
      }
      this.openCollapsedNavFlyout('principal', ev.currentTarget as HTMLElement);
      return;
    }
    this.principalExpanded = !this.principalExpanded;
  }

  closeCollapsedNavFlyout(): void {
    if (!this.collapsedNavFlyoutId && !this.flyoutPortal) return;
    this.restoreFlyoutPortal();
    this.collapsedNavFlyoutId = null;
    this.flyoutTrigger = null;
    this.sidebarFlyout.release(this.closeCollapsedNavFlyoutBound);
  }

  private openCollapsedNavFlyout(
    id: NavCollapsedFlyoutId,
    trigger: HTMLElement,
  ): void {
    if (!this.sidebarIconRail) return;
    this.sidebarFlyout.open(this.closeCollapsedNavFlyoutBound);
    this.collapsedNavFlyoutId = id;
    this.flyoutTrigger = trigger;
    queueMicrotask(() => {
      requestAnimationFrame(() => {
        if (this.collapsedNavFlyoutId !== id) return;
        this.portalizeFlyoutPanel(id);
        this.positionFlyoutPanel(trigger);
      });
    });
  }

  private portalizeFlyoutPanel(id: NavCollapsedFlyoutId): void {
    this.restoreFlyoutPortal();
    const expand = this.hostEl.nativeElement.querySelector(
      `[data-nav-expand="${id}"]`,
    ) as HTMLElement | null;
    const panel = expand?.querySelector(
      '.nav-sidebar__panel',
    ) as HTMLElement | null;
    if (!panel || !panel.parentElement) return;
    const parent = panel.parentElement;
    const next = panel.nextSibling;
    panel.classList.add('nav-expand-flyout-panel');
    document.body.appendChild(panel);
    this.flyoutPortal = { el: panel, parent, next };
  }

  private restoreFlyoutPortal(): void {
    const p = this.flyoutPortal;
    if (!p) return;
    p.el.classList.remove('nav-expand-flyout-panel');
    p.el.style.top = '';
    p.el.style.left = '';
    p.el.style.maxHeight = '';
    if (p.next && p.next.parentNode === p.parent) {
      p.parent.insertBefore(p.el, p.next);
    } else {
      p.parent.appendChild(p.el);
    }
    this.flyoutPortal = null;
  }

  private positionFlyoutPanel(trigger: HTMLElement): void {
    const panel = this.flyoutPortal?.el;
    if (!panel) return;
    const r = trigger.getBoundingClientRect();
    const gap = 8;
    const margin = 8;
    const maxH = Math.max(120, window.innerHeight - margin * 2);
    panel.style.maxHeight = `${maxH}px`;

    const panelW = Math.max(panel.offsetWidth || 0, 200);
    let left = r.right + gap;
    if (left + panelW > window.innerWidth - margin) {
      left = Math.max(margin, r.left - panelW - gap);
    }
    left = Math.max(
      margin,
      Math.min(left, window.innerWidth - panelW - margin),
    );

    const panelH = panel.offsetHeight || 0;
    let top = r.top;
    if (top + panelH > window.innerHeight - margin) {
      top = Math.max(margin, window.innerHeight - margin - panelH);
    }
    top = Math.max(margin, top);

    panel.style.top = `${top}px`;
    panel.style.left = `${left}px`;
  }

  @HostListener('document:click', ['$event'])
  onCollapsedNavFlyoutDocumentClick(ev: MouseEvent): void {
    if (!this.collapsedNavFlyoutId) return;
    const t = ev.target as Node | null;
    if (!t) return;
    if (this.flyoutTrigger?.contains(t)) return;
    if (this.flyoutPortal?.el.contains(t)) return;
    this.closeCollapsedNavFlyout();
  }

  @HostListener('document:keydown', ['$event'])
  onCollapsedNavFlyoutKeydown(ev: KeyboardEvent): void {
    if (ev.key !== 'Escape') return;
    if (this.collapsedNavFlyoutId) {
      this.closeCollapsedNavFlyout();
      return;
    }
    if (this.isMobileViewport && this.mobileNavOpen) {
      this.closeMobileNav();
    }
  }

  @HostListener('window:resize')
  onCollapsedNavFlyoutResize(): void {
    if (!this.collapsedNavFlyoutId || !this.flyoutTrigger) return;
    this.positionFlyoutPanel(this.flyoutTrigger);
  }

  /** Rota ativa sob um prefixo (ex.: `/financeiro`, `/relatorios`). */
  urlActivePrefix(prefix: string): boolean {
    const raw = this.router.url.split('?')[0] ?? '';
    const p = raw.replace(/\/+$/, '') || '/';
    const base = prefix.replace(/\/+$/, '') || '/';
    return p === base || p.startsWith(base + '/');
  }

  /** Secção Principal com rota ativa (exclui Pacotes Predefinidos em Controle). */
  principalSectionActive(): boolean {
    const path = (this.router.url.split('?')[0] ?? '').replace(/\/+$/, '') || '/';
    if (path === '/pacotes/predefinidos' || path.startsWith('/pacotes/predefinidos/')) {
      return false;
    }
    return this.principalPrefixes.some((prefix) =>
      this.pathMatchesPrefix(path, prefix),
    );
  }

  /** Secção do menu (accordions) com rota ativa — alinhado a `navDropdownPrefixes`. */
  sectionActive(id: NavSidebarDropdownId): boolean {
    const path = this.router.url.split('?')[0] ?? '';
    return this.navDropdownPrefixes[id].some((prefix) =>
      this.pathMatchesPrefix(path, prefix),
    );
  }

  toggleSidebar(): void {
    if (this.isMobileViewport) {
      this.toggleMobileNav();
      return;
    }
    this.closeCollapsedNavFlyout();
    this.sidebarCollapsed = !this.sidebarCollapsed;
    try {
      localStorage.setItem(
        SIDEBAR_COLLAPSED_KEY,
        this.sidebarCollapsed ? '1' : '0',
      );
    } catch {
      /* ignore */
    }
  }

  private pathMatchesPrefix(path: string, prefix: string): boolean {
    const base = prefix.replace(/\/+$/, '') || '/';
    const p = path.replace(/\/+$/, '') || '/';
    return p === base || p.startsWith(base + '/');
  }

  /**
   * Ao entrar numa secção (rota passa a pertencer-lhe), expande o acordeão.
   * Não reabre se o utilizador a tiver fechado enquanto permanece na mesma secção.
   * No mobile não auto-abre (overlay sempre começa com grupos fechados).
   */
  private syncNavExpandForActiveRoutes(): void {
    const secaoIds: NavSidebarDropdownId[] = [
      'financeiro',
      'controle',
      'cadastros',
      'marketing',
      'relatorios',
    ];
    const currentlyActive = new Set(
      secaoIds.filter((id) => this.sectionActive(id)),
    );

    if (this.isMobileViewport) {
      this.lastActiveNavSections = currentlyActive;
      this.lastPrincipalActive = this.principalSectionActive();
      return;
    }

    const next = [...this.navExpandOpenIds];
    let mudou = false;
    for (const id of currentlyActive) {
      if (!this.lastActiveNavSections.has(id) && !next.includes(id)) {
        next.push(id);
        mudou = true;
      }
    }
    if (mudou) {
      this.navExpandOpenIds = next;
    }
    this.lastActiveNavSections = currentlyActive;

    const principalAtivo = this.principalSectionActive();
    if (principalAtivo && !this.lastPrincipalActive) {
      this.principalExpanded = true;
    }
    this.lastPrincipalActive = principalAtivo;
  }
}
