import { Injectable } from '@angular/core';

const STORAGE_KEY = 'espaco_lounge_admin_pin';

/**
 * PIN partilhado enviado no header `X-Admin-Pin` para `/api/folha*`.
 * Guardado em `sessionStorage` para sobreviver a refresh na sessão do browser.
 */
@Injectable({ providedIn: 'root' })
export class AdminPinService {
  private mem = '';

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

  clear(): void {
    this.mem = '';
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
