import { Injectable } from '@angular/core';
import { Subject } from 'rxjs';

/** Comunicação agenda (e outros ecrãs) ↔ shell (`app.component`). */
@Injectable({ providedIn: 'root' })
export class AppShellUiService {
  private readonly toggleMobileNav$ = new Subject<void>();
  private readonly toggleSidebar$ = new Subject<void>();

  /** ≤ shellMobile (768px): abre/fecha sidebar overlay. */
  onToggleMobileNav = this.toggleMobileNav$.asObservable();

  /** > shellMobile (768px): recolhe/expande sidebar fixa. */
  onToggleSidebar = this.toggleSidebar$.asObservable();

  requestToggleMobileNav(): void {
    this.toggleMobileNav$.next();
  }

  requestToggleSidebar(): void {
    this.toggleSidebar$.next();
  }
}
