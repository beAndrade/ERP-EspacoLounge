import { Injectable, computed, inject } from '@angular/core';
import { AuthService } from './auth.service';

/**
 * Nome e papel do utilizador autenticado para saudações e filtros na UI.
 */
@Injectable({ providedIn: 'root' })
export class SessaoUsuarioService {
  private readonly auth = inject(AuthService);

  /** Nome completo para exibição — reativo à sessão (`auth.user`). */
  readonly nomeExibicaoSignal = computed(
    () => this.auth.user()?.nome_exibicao?.trim() || 'usuário',
  );

  /** Primeiro nome do utilizador logado. */
  readonly primeiroNome = computed(() => {
    const nome = this.nomeExibicaoSignal();
    return nome.split(/\s+/)[0] || nome;
  });

  nomeExibicao(): string {
    return this.nomeExibicaoSignal();
  }

  role(): 'admin' | 'profissional' | null {
    return this.auth.user()?.role ?? null;
  }

  profissionalId(): number | null {
    return this.auth.profissionalId();
  }

  fotoUrl(): string | null {
    const u = (this.auth.user()?.foto_url ?? '').trim();
    return u || null;
  }

  isAdmin(): boolean {
    return this.auth.isAdmin();
  }

  isProfissional(): boolean {
    return this.auth.isProfissional();
  }
}
