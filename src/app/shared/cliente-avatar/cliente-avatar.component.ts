import { Component, Input } from '@angular/core';

/** Tamanhos/contextos padronizados do avatar do cliente. */
export type ClienteAvatarVariant = 'lista' | 'cabecalho' | 'perfil' | 'sidebar';

@Component({
  selector: 'app-cliente-avatar',
  standalone: true,
  templateUrl: './cliente-avatar.component.html',
  styleUrl: './cliente-avatar.component.scss',
  host: { class: 'cliente-avatar-host' },
})
export class ClienteAvatarComponent {
  @Input() fotoUrl: string | null | undefined;
  @Input() variant: ClienteAvatarVariant = 'lista';
  /** Sidebar sem cliente: ícone grande de placeholder (ignora `fotoUrl`). */
  @Input() placeholderVazio = false;

  get foto(): string | null {
    const u = (this.fotoUrl ?? '').trim();
    return u || null;
  }
}
