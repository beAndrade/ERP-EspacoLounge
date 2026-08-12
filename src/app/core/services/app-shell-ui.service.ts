import { Injectable, signal } from '@angular/core';
import { Subject } from 'rxjs';

/** Ícones suportados pelo Bottom Navigation do shell (sem importar features). */
export type MobileBottomNavIconId =
  | 'calendar'
  | 'filter'
  | 'bolt'
  | 'plus';

/** Ação contextual registada pela página ativa. */
export interface MobileBottomNavAction {
  id: string;
  label: string;
  ariaLabel?: string;
  icon: MobileBottomNavIconId;
  /** Destaque visual (ex.: Criar). */
  accent?: boolean;
  /** Estado expandido / ativo (aria + estilo). */
  active?: boolean;
  onClick: () => void;
}

/** Comunicação páginas ↔ shell (`app.component`). */
@Injectable({ providedIn: 'root' })
export class AppShellUiService {
  private readonly toggleMobileNav$ = new Subject<void>();
  private readonly toggleSidebar$ = new Subject<void>();
  private readonly mobileBottomNavActionsSig = signal<MobileBottomNavAction[]>(
    [],
  );

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

  setMobileBottomNavActions(actions: MobileBottomNavAction[]): void {
    this.mobileBottomNavActionsSig.set([...actions]);
  }

  clearMobileBottomNavActions(): void {
    this.mobileBottomNavActionsSig.set([]);
  }
}
