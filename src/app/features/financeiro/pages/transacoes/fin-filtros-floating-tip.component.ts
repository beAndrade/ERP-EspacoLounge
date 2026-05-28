import {
  Component,
  ElementRef,
  OnDestroy,
  ViewChild,
  ViewEncapsulation,
  inject,
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
      (focusin)="show()"
      (focusout)="scheduleHide()"
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
    }, UI_TIP_SHOW_DELAY_MS);
  }

  show(): void {
    this.clearShowTimer();
    this.clearHideTimer();
    if (!this.panel) {
      this.panel = this.buildPanel();
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
    panel.setAttribute('role', 'tooltip');

    const storage = this.host.nativeElement.querySelector('[finFiltrosTipBody]');
    if (storage) {
      panel.innerHTML = storage.innerHTML;
    }
    const arrow = document.createElement('span');
    arrow.className = 'fin-filtros-tip-panel__arrow';
    arrow.setAttribute('aria-hidden', 'true');
    panel.appendChild(arrow);

    panel.addEventListener('mouseenter', () => this.clearHideTimer());
    panel.addEventListener('mouseleave', () => this.scheduleHide());
    return panel;
  }

  private positionPanel(): void {
    const panel = this.panel;
    const anchor = this.anchorRef?.nativeElement;
    if (!panel || !anchor) return;

    const trigger = anchor.querySelector('[finFiltrosTipTrigger]') ?? anchor;
    const triggerEl =
      trigger instanceof HTMLElement ? trigger : anchor;
    const triggerRect = triggerEl.getBoundingClientRect();

    panel.style.visibility = 'hidden';
    panel.style.display = 'block';
    const panelW = panel.offsetWidth;
    const panelH = panel.offsetHeight;
    const gap = 12;
    const margin = 8;

    let top = triggerRect.top - panelH - gap;
    let placeBelow = false;
    if (top < margin) {
      top = triggerRect.bottom + gap;
      placeBelow = true;
    }

    const triggerCenterX = triggerRect.left + triggerRect.width / 2;
    let left = triggerCenterX - panelW / 2;
    left = Math.max(margin, Math.min(left, window.innerWidth - panelW - margin));

    panel.style.top = `${top}px`;
    panel.style.left = `${left}px`;
    panel.style.visibility = 'visible';
    panel.classList.toggle('fin-filtros-tip-panel--below', placeBelow);

    const arrow = panel.querySelector('.fin-filtros-tip-panel__arrow') as HTMLElement | null;
    if (arrow) {
      const tipCenter = triggerRect.left + triggerRect.width / 2;
      let arrowLeft = tipCenter - left - 7;
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
