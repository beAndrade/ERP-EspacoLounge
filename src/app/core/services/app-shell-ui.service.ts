import { Injectable, isDevMode, signal } from '@angular/core';
import { Subject } from 'rxjs';

/**
 * Ícones suportados pelo Bottom Navigation do shell (sem importar features).
 * Extensões futuras (quando uma tela real justificar): `more`, e `disabled` na ação.
 */
export type MobileBottomNavIconId =
  | 'calendar'
  | 'filter'
  | 'bolt'
  | 'plus'
  | 'search'
  | 'check'
  | 'x'
  | 'more';

/** Ação contextual registada pela página ativa. */
export interface MobileBottomNavAction {
  id: string;
  label: string;
  ariaLabel?: string;
  icon: MobileBottomNavIconId;
  /** Destaque visual (ex.: Criar / Novo). */
  accent?: boolean;
  /** Estado expandido / ativo (aria + estilo). */
  active?: boolean;
  /** Destaque âmbar (ex.: filtros aplicados). */
  warn?: boolean;
  onClick: () => void;
}

/** Limite recomendado de ações contextuais (+ Menu = 5 slots). */
const MOBILE_BOTTOM_NAV_MAX_ACTIONS = 4;

/** Comunicação páginas ↔ shell (`app.component`). */
@Injectable({ providedIn: 'root' })
export class AppShellUiService {
  private readonly toggleMobileNav$ = new Subject<void>();
  private readonly toggleSidebar$ = new Subject<void>();
  private readonly mobileBottomNavActionsSig = signal<MobileBottomNavAction[]>(
    [],
  );
  /** Dono atual das ações — `clear` só limpa se o owner coincidir. */
  private mobileBottomNavOwnerId: string | null = null;

  /** < shellMobile (768px), i.e. ≤767px: abre/fecha sidebar overlay. */
  onToggleMobileNav = this.toggleMobileNav$.asObservable();

  /** ≥ shellMobile (768px): recolhe/expande sidebar fixa. */
  onToggleSidebar = this.toggleSidebar$.asObservable();

  /** Ações contextuais do Bottom Navigation (além do Menu global). */
  readonly mobileBottomNavActions = this.mobileBottomNavActionsSig.asReadonly();

  requestToggleMobileNav(): void {
    this.toggleMobileNav$.next();
  }

  requestToggleSidebar(): void {
    this.toggleSidebar$.next();
  }

  /**
   * Regista ações da página ativa.
   * `ownerId` evita que o destroy de uma rota apague as ações da seguinte.
   */
  setMobileBottomNavActions(
    ownerId: string,
    actions: MobileBottomNavAction[],
  ): void {
    if (isDevMode() && actions.length > MOBILE_BOTTOM_NAV_MAX_ACTIONS) {
      console.warn(
        `[AppShellUi] Bottom Nav: ${actions.length} ações (máx. recomendado: ${MOBILE_BOTTOM_NAV_MAX_ACTIONS}). owner=${ownerId}`,
      );
    }
    this.mobileBottomNavOwnerId = ownerId;
    this.mobileBottomNavActionsSig.set([...actions]);
  }

  /** Limpa só se `ownerId` for o dono atual (no-op caso contrário). */
  clearMobileBottomNavActions(ownerId: string): void {
    if (this.mobileBottomNavOwnerId !== ownerId) return;
    this.mobileBottomNavOwnerId = null;
    this.mobileBottomNavActionsSig.set([]);
  }
}
