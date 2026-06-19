import {
  Component,
  ElementRef,
  HostListener,
  Input,
  inject,
} from '@angular/core';
import { AuthService } from '../../core/services/auth.service';
import { SessaoUsuarioService } from '../../core/services/sessao-usuario.service';
import { MinhaContaDrawerService } from '../../shared/minha-conta-drawer/minha-conta-drawer.service';
import { SidebarFlyoutService } from '../sidebar-flyout.service';

@Component({
  selector: 'app-sidebar-profile',
  standalone: true,
  templateUrl: './sidebar-profile.component.html',
  styleUrl: './sidebar-profile.component.scss',
})
export class SidebarProfileComponent {
  private readonly auth = inject(AuthService);
  private readonly minhaConta = inject(MinhaContaDrawerService);
  private readonly flyout = inject(SidebarFlyoutService);
  private readonly hostEl = inject(ElementRef<HTMLElement>);

  readonly sessao = inject(SessaoUsuarioService);

  @Input() collapsed = false;

  dropdownAberto = false;

  foto(): string | null {
    return this.sessao.fotoUrl();
  }

  iniciais(): string {
    const nome = this.sessao.nomeExibicao().trim();
    if (!nome) return '?';
    const parts = nome.split(/\s+/).filter(Boolean);
    if (parts.length === 1) return parts[0]!.slice(0, 2).toUpperCase();
    return `${parts[0]![0] ?? ''}${parts[parts.length - 1]![0] ?? ''}`.toUpperCase();
  }

  toggleDropdown(ev: Event): void {
    ev.preventDefault();
    ev.stopPropagation();
    if (this.dropdownAberto) {
      this.fecharDropdown();
      return;
    }
    this.flyout.open(() => this.fecharDropdown());
    requestAnimationFrame(() => {
      requestAnimationFrame(() => {
        this.dropdownAberto = true;
      });
    });
  }

  fecharDropdown(): void {
    if (!this.dropdownAberto) return;
    this.dropdownAberto = false;
    this.flyout.release(() => this.fecharDropdown());
  }

  abrirMinhaConta(): void {
    this.fecharDropdown();
    this.minhaConta.abrir();
  }

  sair(): void {
    this.fecharDropdown();
    this.auth.logout();
  }

  @HostListener('document:click', ['$event'])
  onDocumentClick(ev: MouseEvent): void {
    if (!this.dropdownAberto) return;
    const t = ev.target as Node | null;
    if (t && this.hostEl.nativeElement.contains(t)) return;
    this.fecharDropdown();
  }
}

