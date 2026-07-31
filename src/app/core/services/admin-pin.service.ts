import { Injectable, signal } from '@angular/core';

const STORAGE_KEY = 'espaco_lounge_admin_pin';

/**
 * PIN de sessão do Financeiro (header `X-Admin-Pin`).
 * Guardado em `sessionStorage` para sobreviver a refresh na mesma aba.
 * `unlocked` só fica true após verificação bem-sucedida na API.
 */
@Injectable({ providedIn: 'root' })
export class AdminPinService {
  private mem = '';

  /** Sessão financeira desbloqueada nesta aba (memória; some no refresh até revalidar). */
  readonly unlocked = signal(false);

  constructor() {
    try {
      const s = sessionStorage.getItem(STORAGE_KEY);
      if (s) this.mem = s;
    } catch {
      /* ignore */
    }
  }

  getPin(): string {
    if (this.mem) return this.mem;
    try {
      return sessionStorage.getItem(STORAGE_KEY) ?? '';
    } catch {
      return '';
    }
  }

  setPin(pin: string): void {
    const t = String(pin ?? '').trim();
    this.mem = t;
    try {
      if (t) sessionStorage.setItem(STORAGE_KEY, t);
      else sessionStorage.removeItem(STORAGE_KEY);
    } catch {
      /* ignore */
    }
  }

  markUnlocked(): void {
    this.unlocked.set(true);
  }

  clear(): void {
    this.mem = '';
    this.unlocked.set(false);
    try {
      sessionStorage.removeItem(STORAGE_KEY);
    } catch {
      /* ignore */
    }
  }

  hasPin(): boolean {
    return this.getPin().length > 0;
  }
}
