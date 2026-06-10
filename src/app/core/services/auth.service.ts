import { Injectable, inject, signal } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Router } from '@angular/router';
import { Observable, map, tap } from 'rxjs';
import { environment } from '../../../environments/environment';
import type { ApiResponse } from '../models/api.models';
import type { AuthUser, LoginResponse } from '../models/auth.models';
import { extractApiErrorMessage } from '../utils/api-error-message';

const TOKEN_KEY = 'espaco-lounge-auth-token';
const USER_KEY = 'espaco-lounge-auth-user';

@Injectable({ providedIn: 'root' })
export class AuthService {
  private readonly http = inject(HttpClient);
  private readonly router = inject(Router);
  private readonly baseUrl = environment.apiBaseUrl.replace(/\/$/, '');

  readonly user = signal<AuthUser | null>(this.readStoredUser());
  readonly bootstrapped = signal(false);

  get token(): string | null {
    try {
      return localStorage.getItem(TOKEN_KEY);
    } catch {
      return null;
    }
  }

  isLoggedIn(): boolean {
    return Boolean(this.token && this.user());
  }

  isAdmin(): boolean {
    return this.user()?.role === 'admin';
  }

  isProfissional(): boolean {
    return this.user()?.role === 'profissional';
  }

  profissionalId(): number | null {
    return this.user()?.profissional_id ?? null;
  }

  bootstrapSession(): Observable<boolean> {
    if (!this.token) {
      this.bootstrapped.set(true);
      return new Observable((sub) => {
        sub.next(false);
        sub.complete();
      });
    }
    return this.http
      .get<ApiResponse<{ user: AuthUser }>>(`${this.baseUrl}/api/auth/me`)
      .pipe(
        map((r) => {
          if (!r.ok || !r.data?.user) {
            throw new Error(
              r.error?.message ?? 'Não foi possível validar a sessão.',
            );
          }
          return r.data.user;
        }),
        tap({
          next: (u) => {
            this.persistUser(u);
            this.bootstrapped.set(true);
          },
          error: () => {
            this.clearSession();
            this.bootstrapped.set(true);
          },
        }),
        map(() => true),
      );
  }

  login(email: string, senha: string): Observable<AuthUser> {
    return this.http
      .post<ApiResponse<LoginResponse>>(`${this.baseUrl}/api/auth/login`, {
        email,
        senha,
      })
      .pipe(
        map((r) => {
          if (!r.ok || !r.data) {
            throw new Error(
              extractApiErrorMessage(r) ?? 'E-mail ou senha incorretos.',
            );
          }
          return r.data;
        }),
        tap((data) => {
          try {
            localStorage.setItem(TOKEN_KEY, data.token);
          } catch {
            /* ignore */
          }
          this.persistUser(data.user);
        }),
        map((data) => data.user),
      );
  }

  logout(navigate = true): void {
    this.clearSession();
    if (navigate) {
      void this.router.navigate(['/login']);
    }
  }

  alterarEmail(
    email: string,
    senhaAtual: string,
  ): Observable<AuthUser> {
    return this.http
      .patch<ApiResponse<{ user: AuthUser; token: string }>>(
        `${this.baseUrl}/api/auth/me/email`,
        { email, senha_atual: senhaAtual },
      )
      .pipe(
        map((r) => {
          if (!r.ok || !r.data) {
            throw new Error(
              extractApiErrorMessage(r) ??
                'Não foi possível alterar o e-mail.',
            );
          }
          return r.data;
        }),
        tap((data) => {
          try {
            localStorage.setItem(TOKEN_KEY, data.token);
          } catch {
            /* ignore */
          }
          this.persistUser(data.user);
        }),
        map((data) => data.user),
      );
  }

  alterarSenha(
    senhaAtual: string,
    senhaNova: string,
    senhaNovaConfirmacao: string,
  ): Observable<void> {
    return this.http
      .patch<ApiResponse<{ ok: boolean }>>(
        `${this.baseUrl}/api/auth/me/senha`,
        {
          senha_atual: senhaAtual,
          senha_nova: senhaNova,
          senha_nova_confirmacao: senhaNovaConfirmacao,
        },
      )
      .pipe(
        map((r) => {
          if (!r.ok) {
            throw new Error(
              extractApiErrorMessage(r) ??
                'Não foi possível alterar a senha.',
            );
          }
        }),
        tap(() => this.logout()),
      );
  }

  private persistUser(user: AuthUser): void {
    this.user.set(user);
    try {
      localStorage.setItem(USER_KEY, JSON.stringify(user));
    } catch {
      /* ignore */
    }
  }

  /** Atualiza foto no utilizador em sessão (ex.: após editar o próprio profissional). */
  patchFotoUrl(fotoUrl: string | null): void {
    const atual = this.user();
    if (!atual) return;
    const next: AuthUser = {
      ...atual,
      foto_url: fotoUrl?.trim() || null,
    };
    this.persistUser(next);
  }

  private readStoredUser(): AuthUser | null {
    try {
      const raw = localStorage.getItem(USER_KEY);
      if (!raw) return null;
      return JSON.parse(raw) as AuthUser;
    } catch {
      return null;
    }
  }

  private clearSession(): void {
    this.user.set(null);
    try {
      localStorage.removeItem(TOKEN_KEY);
      localStorage.removeItem(USER_KEY);
    } catch {
      /* ignore */
    }
  }
}
