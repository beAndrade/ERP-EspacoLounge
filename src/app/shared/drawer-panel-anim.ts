import type { ApplicationRef } from '@angular/core';

/**
 * Fonte única do slide dos drawers laterais.
 * Manter igual a `--drawer-slide-duration: 0.43s` nos SCSS.
 */
export const DRAWER_ANIM_MS = 430;

export type DrawerOpenAnimHandle = {
  cancel: () => void;
};

/**
 * Sequência padrão de abertura (igual à grelha da agenda):
 * painel montado fechado → 2 rAF (+ reflow opcional) → `panelOpen = true`.
 */
export function runDrawerOpenAnimation(opts: {
  setPanelOpen: (open: boolean) => void;
  appRef?: ApplicationRef | null;
  /** Seletor do shell para forçar paint no estado fechado. */
  reflowSelector?: string;
  onOpened?: () => void;
}): DrawerOpenAnimHandle {
  let raf1: number | null = null;
  let raf2: number | null = null;
  let cancelled = false;

  opts.setPanelOpen(false);
  opts.appRef?.tick();

  queueMicrotask(() => {
    if (cancelled) return;
    raf1 = requestAnimationFrame(() => {
      raf1 = null;
      if (cancelled) return;
      if (opts.reflowSelector) {
        const el = document.querySelector(
          opts.reflowSelector,
        ) as HTMLElement | null;
        void el?.offsetWidth;
      }
      raf2 = requestAnimationFrame(() => {
        raf2 = null;
        if (cancelled) return;
        opts.setPanelOpen(true);
        opts.appRef?.tick();
        opts.onOpened?.();
      });
    });
  });

  return {
    cancel: () => {
      cancelled = true;
      if (raf1 != null) {
        cancelAnimationFrame(raf1);
        raf1 = null;
      }
      if (raf2 != null) {
        cancelAnimationFrame(raf2);
        raf2 = null;
      }
    },
  };
}

/** Inicia o slide de saída imediatamente (tick força o paint no clique). */
export function beginDrawerCloseAnimation(opts: {
  setPanelOpen: (open: boolean) => void;
  appRef?: ApplicationRef | null;
}): void {
  opts.setPanelOpen(false);
  opts.appRef?.tick();
}
