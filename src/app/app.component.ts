import { NgClass } from '@angular/common';
import { Component, HostListener, OnInit, inject } from '@angular/core';
import { NavigationEnd, Router, RouterLink, RouterLinkActive, RouterOutlet } from '@angular/router';
import { filter } from 'rxjs';

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
  ],
  templateUrl: './app.component.html',
  styleUrl: './app.component.scss',
})
export class AppComponent implements OnInit {
  private readonly router = inject(Router);

  readonly title = 'Espaço Lounge';

  /** Menu Principal accordion (só afeta sidebar expandida). */
  principalExpanded = true;

  sidebarCollapsed = false;

  /** Acordeão secundário da sidebar (secções Financeiro, Controle, etc.). */
  navDropdownOpen: NavSidebarDropdownId | null = null;

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

  ngOnInit(): void {
    try {
      if (localStorage.getItem(SIDEBAR_COLLAPSED_KEY) === '1') {
        this.sidebarCollapsed = true;
      }
    } catch {
      /* ignore */
    }

    this.router.events
      .pipe(filter((e): e is NavigationEnd => e instanceof NavigationEnd))
      .subscribe(() => {
        this.navDropdownOpen = null;
        if (this.isPrincipalRoute(this.router.url)) {
          this.principalExpanded = true;
        }
      });
  }

  @HostListener('document:click', ['$event'])
  onDocumentClick(ev: MouseEvent): void {
    const el = ev.target as HTMLElement | null;
    if (!el?.closest?.('.app-sidebar')) {
      this.navDropdownOpen = null;
    }
  }

  onNavExpandTrigger(ev: MouseEvent, id: NavSidebarDropdownId): void {
    ev.preventDefault();
    if (this.sidebarCollapsed) {
      void this.router.navigateByUrl(this.collapsedNavFirstRoute[id]);
      return;
    }
    this.navDropdownOpen = this.navDropdownOpen === id ? null : id;
  }

  navExpandIsOpen(id: NavSidebarDropdownId): boolean {
    return this.navDropdownOpen === id;
  }

  /** Rota ativa sob um prefixo (ex.: `/financeiro`, `/relatorios`). */
  urlActivePrefix(prefix: string): boolean {
    const raw = this.router.url.split('?')[0] ?? '';
    const p = raw.replace(/\/+$/, '') || '/';
    const base = prefix.replace(/\/+$/, '') || '/';
    return p === base || p.startsWith(base + '/');
  }

  toggleSidebar(): void {
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

  private isPrincipalRoute(url: string): boolean {
    const path = url.split('?')[0] ?? '';
    return /^\/(painel|agenda|comandas|pacotes)(\/|$)/.test(path);
  }
}
