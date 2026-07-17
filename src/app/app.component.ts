import { NgClass } from '@angular/common';
import { Component, DestroyRef, OnInit, inject } from '@angular/core';
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
import { SessaoUsuarioService } from './core/services/sessao-usuario.service';
import { SidebarProfileComponent } from './layout/sidebar-profile/sidebar-profile.component';
import { mediaQueryMax } from './styles/breakpoints';
import { AppShellUiService } from './core/services/app-shell-ui.service';
import { SidebarNovoMenuComponent } from './layout/sidebar-novo-menu/sidebar-novo-menu.component';
import { MinhaContaDrawerHostComponent } from './shared/minha-conta-drawer/minha-conta-drawer-host.component';
import { FinTransacaoNovoDrawerHostComponent } from './shared/fin-transacao-novo-drawer/fin-transacao-novo-drawer-host.component';

const SIDEBAR_COLLAPSED_KEY = 'espaco-lounge-sidebar-collapsed';

export type NavSidebarDropdownId =
  | 'financeiro'
  | 'controle'
  | 'cadastros'
  | 'marketing'
  | 'relatorios';

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
    MinhaContaDrawerHostComponent,
    FinTransacaoNovoDrawerHostComponent,
    SidebarProfileComponent,
    SidebarNovoMenuComponent,
    AppToastComponent,
  ],
  templateUrl: './app.component.html',
  styleUrl: './app.component.scss',
})
export class AppComponent implements OnInit {
  private readonly router = inject(Router);
  private readonly destroyRef = inject(DestroyRef);
  readonly sessao = inject(SessaoUsuarioService);
  private readonly shellUi = inject(AppShellUiService);

  readonly title = 'Espaço Lounge';
  isPublicRoute = false;

  /** Viewport estreito: menu lateral em overlay. */
  isMobileViewport = false;
  mobileNavOpen = false;
  private mobileMq: MediaQueryList | null = null;

  /** Menu Principal accordion (só afeta sidebar expandida). */
  principalExpanded = true;

  sidebarCollapsed = false;

  /**
   * Secções Financeiro, Controle, etc. abertas em simultâneo.
   * Abrem ao entrar na rota da secção; o utilizador pode fechar mesmo com a rota ativa.
   */
  navExpandOpenIds: NavSidebarDropdownId[] = [];

  /** Secções com rota ativa no ciclo anterior (para só auto-abrir ao entrar). */
  private lastActiveNavSections = new Set<NavSidebarDropdownId>();

  private readonly collapsedNavFirstRoute: Record<
    NavSidebarDropdownId,
    string
  > = {
    financeiro: '/financeiro/painel',
    controle: '/estoque',
    cadastros: '/clientes',
    marketing: '/promocoes',
    relatorios: '/relatorios/painel',
  };

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
        this.closeMobileNav();
      });
    this.syncPublicRoute(this.router.url);
  }

  private syncPublicRoute(url: string): void {
    const path = (url.split('?')[0] ?? '').replace(/\/+$/, '') || '/';
    this.isPublicRoute = path === '/login' || path === '/agendar';
  }

  toggleMobileNav(): void {
    this.mobileNavOpen = !this.mobileNavOpen;
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
    this.mobileNavOpen = false;
  }

  private setupMobileViewport(): void {
    if (typeof window === 'undefined' || !window.matchMedia) return;
    this.mobileMq = window.matchMedia(mediaQueryMax('shellMobile'));
    const apply = (): void => {
      this.isMobileViewport = this.mobileMq?.matches ?? false;
      if (this.isMobileViewport) {
        this.sidebarCollapsed = true;
        this.mobileNavOpen = false;
      }
    };
    apply();
    const onChange = (): void => apply();
    this.mobileMq.addEventListener('change', onChange);
    this.destroyRef.onDestroy(() => {
      this.mobileMq?.removeEventListener('change', onChange);
    });
  }

  onNavExpandTrigger(ev: MouseEvent, id: NavSidebarDropdownId): void {
    ev.preventDefault();
    if (this.sidebarCollapsed) {
      void this.router.navigateByUrl(this.collapsedNavFirstRoute[id]);
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

  /** Rota ativa sob um prefixo (ex.: `/financeiro`, `/relatorios`). */
  urlActivePrefix(prefix: string): boolean {
    const raw = this.router.url.split('?')[0] ?? '';
    const p = raw.replace(/\/+$/, '') || '/';
    const base = prefix.replace(/\/+$/, '') || '/';
    return p === base || p.startsWith(base + '/');
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

  togglePrincipal(): void {
    this.principalExpanded = !this.principalExpanded;
  }

  private pathMatchesPrefix(path: string, prefix: string): boolean {
    const base = prefix.replace(/\/+$/, '') || '/';
    const p = path.replace(/\/+$/, '') || '/';
    return p === base || p.startsWith(base + '/');
  }

  /**
   * Ao entrar numa secção (rota passa a pertencer-lhe), expande o acordeão.
   * Não reabre se o utilizador a tiver fechado enquanto permanece na mesma secção.
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
  }
}
