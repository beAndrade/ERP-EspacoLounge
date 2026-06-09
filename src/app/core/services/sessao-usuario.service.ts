import { Injectable, inject } from '@angular/core';
import { AuthService } from './auth.service';

/**
 * Nome e papel do utilizador autenticado para saudações e filtros na UI.
 */
@Injectable({ providedIn: 'root' })
export class SessaoUsuarioService {
  private readonly auth = inject(AuthService);

  nomeExibicao(): string {
    return this.auth.user()?.nome_exibicao?.trim() || 'usuário';
  }

  role(): 'admin' | 'profissional' | null {
    return this.auth.user()?.role ?? null;
  }

  profissionalId(): number | null {
    return this.auth.profissionalId();
  }

  isAdmin(): boolean {
    return this.auth.isAdmin();
  }

  isProfissional(): boolean {
    return this.auth.isProfissional();
  }
}
