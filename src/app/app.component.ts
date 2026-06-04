import { NgClass } from '@angular/common';
import { Component, DestroyRef, OnInit, inject } from '@angular/core';
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
    AppToastComponent,
  ],
  templateUrl: './app.component.html',
  styleUrl: './app.component.scss',
})
export class AppComponent implements OnInit {
  private readonly router = inject(Router);
  private readonly destroyRef = inject(DestroyRef);

  readonly title = 'Espaço Lounge';

  /** Viewport estreito: menu lateral em overlay. */
  isMobileViewport = false;
  mobileNavOpen = false;
  private mobileMq: MediaQueryList | null = null;

  /** Menu Principal accordion (só afeta sidebar expandida). */
  principalExpanded = true;

  sidebarCollapsed = false;

  /**
   * Secções Financeiro, Controle, etc. abertas em simultâneo.
   * Só mudam ao clicar no trigger — não recolhem ao trocar de rota.
   */
  navExpandOpenIds: NavSidebarDropdownId[] = [];

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
    this.syncNavExpandForActiveRoutes();
    this.router.events
      .pipe(filter((e): e is NavigationEnd => e instanceof NavigationEnd))
      .subscribe(() => {
        this.syncNavExpandForActiveRoutes();
        this.closeMobileNav();
      });
  }

  toggleMobileNav(): void {
    this.mobileNavOpen = !this.mobileNavOpen;
  }

  closeMobileNav(): void {
    this.mobileNavOpen = false;
  }

  private setupMobileViewport(): void {
    if (typeof window === 'undefined' || !window.matchMedia) return;
    this.mobileMq = window.matchMedia('(max-width: 640px)');
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
    return this.navExpandOpenIds.includes(id) || this.sectionActive(id);
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

  /** Mantém Financeiro/Controle/etc. expandidos enquanto a rota ativa pertence à secção. */
  private syncNavExpandForActiveRoutes(): void {
    const secaoIds: NavSidebarDropdownId[] = [
      'financeiro',
      'controle',
      'cadastros',
      'marketing',
      'relatorios',
    ];
    const abrir = secaoIds.filter((id) => this.sectionActive(id));
    if (abrir.length === 0) return;

    const next = [...this.navExpandOpenIds];
    let mudou = false;
    for (const id of abrir) {
      if (!next.includes(id)) {
        next.push(id);
        mudou = true;
      }
    }
    if (mudou) {
      this.navExpandOpenIds = next;
    }
  }
}
