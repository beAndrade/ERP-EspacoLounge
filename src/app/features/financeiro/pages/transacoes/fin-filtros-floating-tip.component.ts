import {
  Component,
  ElementRef,
  OnDestroy,
  ViewChild,
  ViewEncapsulation,
  inject,
  input,
} from '@angular/core';
import { UI_TIP_SHOW_DELAY_MS } from '../../../../shared/ui-tip-trigger/ui-tip-delay';

/** Tooltip dos filtros: portal no `body` para não ser cortado pelo scroll da sidebar. */
@Component({
  selector: 'app-fin-filtros-floating-tip',
  standalone: true,
  template: `
    <span
      class="fin-filtros-tip-anchor"
      #anchor
      (mouseenter)="onMouseEnter()"
      (mouseleave)="scheduleHide()"
      (focusin)="onFocusIn()"
      (focusout)="onFocusOut()"
    >
      <ng-content select="[finFiltrosTipTrigger]" />
    </span>
    <div class="fin-filtros-tip-body-storage" hidden aria-hidden="true">
      <ng-content select="[finFiltrosTipBody]" />
    </div>
  `,
  styleUrl: './fin-filtros-floating-tip.component.scss',
  encapsulation: ViewEncapsulation.None,
})
export class FinFiltrosFloatingTipComponent implements OnDestroy {
  private readonly host = inject(ElementRef<HTMLElement>);

  /** Quando falso, não abre ao focar (ex.: checkbox que deve esconder ao clicar). */
  readonly openOnFocus = input(true);

  /** Atraso (ms) antes de exibir o balão — alinhar ao hover do campo (ex.: 160). */
  readonly showDelayMs = input(UI_TIP_SHOW_DELAY_MS);

  /** Seletor do elemento para posicionar a seta (relativo ao gatilho projetado). */
  readonly arrowAlignSelector = input<string | null>(null);

  /** Classe extra no painel portal (ex.: estilo do tooltip de comissões anteriores). */
  readonly panelModifier = input<string | null>(null);

  @ViewChild('anchor', { static: true })
  private anchorRef!: ElementRef<HTMLElement>;

  private panel: HTMLElement | null = null;
  private hideTimer: ReturnType<typeof setTimeout> | null = null;
  private showTimer: ReturnType<typeof setTimeout> | null = null;

  ngOnDestroy(): void {
    this.clearShowTimer();
    this.clearHideTimer();
    this.destroyPanel();
  }

  onMouseEnter(): void {
    this.clearShowTimer();
    this.showTimer = setTimeout(() => {
      this.showTimer = null;
      this.show();
    }, this.showDelayMs());
  }

  onFocusIn(): void {
    if (!this.openOnFocus()) return;
    this.show();
  }

  onFocusOut(): void {
    if (!this.openOnFocus()) return;
    this.scheduleHide();
  }

  show(): void {
    this.clearShowTimer();
    this.clearHideTimer();
    if (!this.panel) {
      this.panel = this.buildPanel();
    } else {
      this.syncPanelContent();
    }
    if (!this.panel.isConnected) {
      document.body.appendChild(this.panel);
    }
    this.panel.classList.add('is-visible');
    requestAnimationFrame(() => this.positionPanel());
  }

  scheduleHide(): void {
    this.clearShowTimer();
    this.clearHideTimer();
    this.hideTimer = setTimeout(() => this.hide(), 80);
  }

  private clearShowTimer(): void {
    if (this.showTimer != null) {
      clearTimeout(this.showTimer);
      this.showTimer = null;
    }
  }

  private hide(): void {
    this.panel?.classList.remove('is-visible');
  }

  private clearHideTimer(): void {
    if (this.hideTimer != null) {
      clearTimeout(this.hideTimer);
      this.hideTimer = null;
    }
  }

  private buildPanel(): HTMLElement {
    const panel = document.createElement('div');
    panel.className = 'fin-filtros-tip-panel fin-filtros-tip-panel--portal';
    const mod = this.panelModifier()?.trim();
    if (mod) panel.classList.add(mod);
    panel.setAttribute('role', 'tooltip');

    const body = document.createElement('div');
    body.className = 'fin-filtros-tip-panel__body';
    panel.appendChild(body);

    const arrow = document.createElement('span');
    arrow.className = 'fin-filtros-tip-panel__arrow';
    arrow.setAttribute('aria-hidden', 'true');
    panel.appendChild(arrow);

    this.syncPanelContent(panel);

    panel.addEventListener('mouseenter', () => this.clearHideTimer());
    panel.addEventListener('mouseleave', () => this.scheduleHide());
    return panel;
  }

  private syncPanelContent(panel: HTMLElement | null = this.panel): void {
    if (!panel) return;
    const body = panel.querySelector('.fin-filtros-tip-panel__body');
    if (!body) return;
    const storage = this.host.nativeElement.querySelector(
      '.fin-filtros-tip-body-storage',
    );
    body.innerHTML = storage?.innerHTML?.trim() ? storage.innerHTML : '';
  }

  private resolveAlignRect(anchor: HTMLElement): DOMRect {
    const trigger =
      anchor.querySelector('[finFiltrosTipTrigger]') ?? anchor;
    const triggerEl = trigger instanceof HTMLElement ? trigger : anchor;
    const sel = this.arrowAlignSelector()?.trim();
    if (sel) {
      const el = triggerEl.querySelector(sel);
      if (el instanceof HTMLElement) {
        return el.getBoundingClientRect();
      }
    }
    return triggerEl.getBoundingClientRect();
  }

  private positionPanel(): void {
    const panel = this.panel;
    const anchor = this.anchorRef?.nativeElement;
    if (!panel || !anchor) return;

    const alignRect = this.resolveAlignRect(anchor);

    panel.style.visibility = 'hidden';
    panel.style.display = 'block';
    const panelW = panel.offsetWidth;
    const panelH = panel.offsetHeight;
    const gap = 10;
    const margin = 8;

    let top = alignRect.top - panelH - gap;
    let placeBelow = false;
    if (top < margin) {
      top = alignRect.bottom + gap;
      placeBelow = true;
    }

    const alignCenterX = alignRect.left + alignRect.width / 2;
    let left = alignCenterX - panelW / 2;
    left = Math.max(margin, Math.min(left, window.innerWidth - panelW - margin));

    panel.style.top = `${top}px`;
    panel.style.left = `${left}px`;
    panel.style.visibility = 'visible';
    panel.classList.toggle('fin-filtros-tip-panel--below', placeBelow);

    const arrow = panel.querySelector('.fin-filtros-tip-panel__arrow') as HTMLElement | null;
    if (arrow) {
      let arrowLeft = alignCenterX - left - 7;
      arrowLeft = Math.max(12, Math.min(panelW - 24, arrowLeft));
      arrow.style.left = `${arrowLeft}px`;
      arrow.style.right = 'auto';
    }
  }

  private destroyPanel(): void {
    this.panel?.remove();
    this.panel = null;
  }
}
