import { Component, inject } from '@angular/core';
import {
  AppShellUiService,
  type MobileBottomNavAction,
} from '../../core/services/app-shell-ui.service';

@Component({
  selector: 'app-mobile-bottom-nav',
  standalone: true,
  templateUrl: './mobile-bottom-nav.component.html',
  styleUrl: './mobile-bottom-nav.component.scss',
})
export class MobileBottomNavComponent {
  private readonly shellUi = inject(AppShellUiService);

  readonly actions = this.shellUi.mobileBottomNavActions;

  abrirMenu(ev: Event): void {
    ev.stopPropagation();
    this.shellUi.requestToggleMobileNav();
  }

  executar(action: MobileBottomNavAction, ev: Event): void {
    // Igual aos triggers antigos da Agenda: evita que o document click
    // (outside-close) feche o menu/painel no mesmo gesto que abriu.
    ev.stopPropagation();
    action.onClick();
  }
}
