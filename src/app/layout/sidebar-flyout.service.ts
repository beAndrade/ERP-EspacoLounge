import { Injectable } from '@angular/core';

/** Garante que só um flyout da sidebar (perfil / Novo + / nav colapsada) fica aberto. */
@Injectable({ providedIn: 'root' })
export class SidebarFlyoutService {
  private activeClose: (() => void) | null = null;

  /** Fecha o flyout anterior e regista o novo. */
  open(close: () => void): void {
    if (this.activeClose && this.activeClose !== close) {
      this.activeClose();
    }
    this.activeClose = close;
  }

  release(close: () => void): void {
    if (this.activeClose === close) {
      this.activeClose = null;
    }
  }
}
