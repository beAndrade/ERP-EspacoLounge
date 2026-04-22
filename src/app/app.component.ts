import { NgClass } from '@angular/common';
import { Component, OnInit, inject } from '@angular/core';
import { NavigationEnd, Router, RouterLink, RouterLinkActive, RouterOutlet } from '@angular/router';
import { filter } from 'rxjs';

const SIDEBAR_COLLAPSED_KEY = 'espaco-lounge-sidebar-collapsed';

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
        if (this.isPrincipalRoute(this.router.url)) {
          this.principalExpanded = true;
        }
      });
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
