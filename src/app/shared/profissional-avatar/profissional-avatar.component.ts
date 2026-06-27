import { Component, Input } from '@angular/core';

/** Tamanhos/contextos padronizados do avatar do profissional. */
export type ProfissionalAvatarVariant = 'grid-head' | 'cabecalho';

@Component({
  selector: 'app-profissional-avatar',
  standalone: true,
  templateUrl: './profissional-avatar.component.html',
  styleUrl: './profissional-avatar.component.scss',
  host: { class: 'profissional-avatar-host' },
})
export class ProfissionalAvatarComponent {
  @Input() fotoUrl: string | null | undefined;
  @Input() variant: ProfissionalAvatarVariant = 'grid-head';

  get foto(): string | null {
    const u = (this.fotoUrl ?? '').trim();
    return u || null;
  }
}
