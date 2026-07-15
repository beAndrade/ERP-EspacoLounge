import { Injectable, signal } from '@angular/core';

export type AppToastState = {
  message: string;
  visible: boolean;
  variant: 'success' | 'warning' | 'info';
};

@Injectable({ providedIn: 'root' })
export class AppToastService {
  readonly toast = signal<AppToastState | null>(null);

  private hideTimer: ReturnType<typeof setTimeout> | null = null;
  private removeTimer: ReturnType<typeof setTimeout> | null = null;

  private static readonly VISIBLE_MS = 4000;
  private static readonly EXIT_MS = 280;

  show(message: string, durationMs = AppToastService.VISIBLE_MS): void {
    this.present(message, 'success', durationMs);
  }

  showWarning(message: string, durationMs = AppToastService.VISIBLE_MS): void {
    this.present(message, 'warning', durationMs);
  }

  showInfo(message: string, durationMs = AppToastService.VISIBLE_MS): void {
    this.present(message, 'info', durationMs);
  }

  private present(
    message: string,
    variant: AppToastState['variant'],
    durationMs: number,
  ): void {
    this.clearTimers();
    this.toast.set({ message, visible: false, variant });
    requestAnimationFrame(() => {
      requestAnimationFrame(() => {
        const cur = this.toast();
        if (!cur || cur.message !== message) return;
        this.toast.set({ ...cur, visible: true });
        this.hideTimer = setTimeout(() => this.dismiss(), durationMs);
      });
    });
  }

  dismiss(): void {
    const cur = this.toast();
    if (!cur) return;
    this.clearTimers();
    if (!cur.visible) {
      this.toast.set(null);
      return;
    }
    this.toast.set({ ...cur, visible: false });
    this.removeTimer = setTimeout(() => {
      this.removeTimer = null;
      this.toast.set(null);
    }, AppToastService.EXIT_MS);
  }

  private clearTimers(): void {
    if (this.hideTimer != null) {
      clearTimeout(this.hideTimer);
      this.hideTimer = null;
    }
    if (this.removeTimer != null) {
      clearTimeout(this.removeTimer);
      this.removeTimer = null;
    }
  }
}
