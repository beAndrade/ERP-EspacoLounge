import {
  Component,
  ElementRef,
  HostListener,
  OnDestroy,
  ViewChild,
  ViewEncapsulation,
  booleanAttribute,
  input,
  signal,
} from '@angular/core';
import { UI_TIP_SHOW_DELAY_MS } from './ui-tip-delay';

export type UiTipAlign = 'center' | 'end' | 'start';

/** Tooltip escuro padrão do sistema (`ui-tooltip.scss`). */
@Component({
  selector: 'app-ui-tip-trigger',
  standalone: true,
  encapsulation: ViewEncapsulation.None,
  template: `
    <span
      #anchor
      class="ui-tip-trigger"
      [class.ui-tip-trigger--align-end]="align() === 'end'"
      [class.ui-tip-trigger--align-start]="align() === 'start'"
      [class.ui-tip-trigger--open]="tipOpen() && !floating()"
      [class.ui-tip-trigger--floating]="floating()"
      (click)="onTriggerClick($event)"
    >
      <ng-content />
      @if (tip() && !floating()) {
        <span class="ui-tip" role="tooltip">{{ tip() }}</span>
      }
    </span>
  `,
  styleUrl: './ui-tip-trigger.component.scss',
})
export class UiTipTriggerComponent implements OnDestroy {
  readonly tip = input<string>('');
  readonly align = input<UiTipAlign>('center');
  /**
   * Por padrão renderiza no `document.body` (portal) para ficar acima de
   * overflow/stacking dos painéis. Use `[floating]="false"` só se precisar do
   * balão inline relativo ao trigger.
   */
  readonly floating = input(true, { transform: booleanAttribute });
  readonly tipOpen = signal(false);

  @ViewChild('anchor', { static: true })
  private anchorRef!: ElementRef<HTMLElement>;

  private suppressed = false;
  private panel: HTMLElement | null = null;
  private panelLabel: HTMLElement | null = null;
  private hideTimer: ReturnType<typeof setTimeout> | null = null;
  private showTimer: ReturnType<typeof setTimeout> | null = null;

  @HostListener('mouseenter')
  onMouseEnter(): void {
    this.scheduleShow();
  }

  @HostListener('focusin')
  onFocusIn(): void {
    this.clearShowTimer();
    this.openTipNow();
  }

  @HostListener('mouseleave')
  onMouseLeave(): void {
    this.clearShowTimer();
    if (this.floating()) {
      this.scheduleHideFloating();
      return;
    }
    this.tipOpen.set(false);
    this.suppressed = false;
  }

  @HostListener('focusout')
  onFocusOut(): void {
    this.clearShowTimer();
    if (this.floating()) {
      this.scheduleHideFloating();
      return;
    }
    this.tipOpen.set(false);
    this.suppressed = false;
  }

  private scheduleShow(): void {
    if (this.suppressed) return;
    this.clearShowTimer();
    this.showTimer = setTimeout(() => {
      this.showTimer = null;
      if (this.suppressed) return;
      this.openTipNow();
    }, UI_TIP_SHOW_DELAY_MS);
  }

  private openTipNow(): void {
    if (this.suppressed) return;
    if (this.floating()) {
      this.showFloating();
      return;
    }
    this.tipOpen.set(true);
  }

  private clearShowTimer(): void {
    if (this.showTimer != null) {
      clearTimeout(this.showTimer);
      this.showTimer = null;
    }
  }

  onTriggerClick(ev: Event): void {
    this.clearShowTimer();
    this.suppressed = true;
    if (this.floating()) {
      this.hideFloating();
    } else {
      this.tipOpen.set(false);
    }
    const btn = (ev.target as HTMLElement | null)?.closest('button');
    btn?.blur();
  }

  ngOnDestroy(): void {
    this.clearShowTimer();
    this.clearHideTimer();
    this.destroyPanel();
  }

  private showFloating(): void {
    const text = this.tip().trim();
    if (!text) return;
    this.clearHideTimer();
    if (!this.panel) {
      this.panel = this.buildPanel(text);
      this.panelLabel = this.panel.querySelector('.ui-tip-portal__label');
    } else if (this.panelLabel) {
      this.panelLabel.textContent = text;
    }
    if (!this.panel.isConnected) {
      document.body.appendChild(this.panel);
    }
    this.panel.classList.add('is-visible');
    requestAnimationFrame(() => {
      this.positionPanel();
      requestAnimationFrame(() => this.positionPanel());
    });
  }

  private scheduleHideFloating(): void {
    this.clearHideTimer();
    this.hideTimer = setTimeout(() => this.hideFloating(), 100);
  }

  private hideFloating(): void {
    this.panel?.classList.remove('is-visible');
    this.suppressed = false;
  }

  private clearHideTimer(): void {
    if (this.hideTimer != null) {
      clearTimeout(this.hideTimer);
      this.hideTimer = null;
    }
  }

  private buildPanel(text: string): HTMLElement {
    const panel = document.createElement('span');
    panel.className = 'ui-tip-portal';

    const label = document.createElement('span');
    label.className = 'ui-tip-portal__label';
    label.textContent = text;
    panel.appendChild(label);

    const arrow = document.createElement('span');
    arrow.className = 'ui-tip-portal__arrow';
    arrow.setAttribute('aria-hidden', 'true');
    panel.appendChild(arrow);

    panel.setAttribute('role', 'tooltip');
    panel.addEventListener('mouseenter', () => this.clearHideTimer());
    panel.addEventListener('mouseleave', () => this.scheduleHideFloating());
    return panel;
  }

  private triggerRect(): DOMRect {
    const anchor = this.anchorRef?.nativeElement;
    if (!anchor) {
      return new DOMRect();
    }
    const el =
      anchor.querySelector<HTMLElement>(
        'button, a, [role="button"], .drawer-switch',
      ) ?? anchor;
    return el.getBoundingClientRect();
  }

  private positionPanel(): void {
    const panel = this.panel;
    if (!panel) return;

    const triggerRect = this.triggerRect();
    const gap = 10; // = --ui-tip-gap (ui-tooltip.scss)
    const margin = 12;

    panel.style.display = 'block';
    panel.style.visibility = 'hidden';
    const panelW = panel.offsetWidth;
    const panelH = panel.offsetHeight;

    let top = triggerRect.top - panelH - gap;
    let placeBelow = false;
    if (top < margin) {
      top = triggerRect.bottom + gap;
      placeBelow = true;
    }

    let left: number;
    const align = this.align();
    if (align === 'end') {
      left = triggerRect.right - panelW;
    } else if (align === 'start') {
      left = triggerRect.left;
    } else {
      left = triggerRect.left + triggerRect.width / 2 - panelW / 2;
    }
    left = Math.max(margin, Math.min(left, window.innerWidth - panelW - margin));

    panel.style.top = `${top}px`;
    panel.style.left = `${left}px`;
    panel.style.visibility = 'visible';
    panel.classList.toggle('ui-tip-portal--below', placeBelow);

    const arrow = panel.querySelector('.ui-tip-portal__arrow') as HTMLElement | null;
    if (arrow) {
      const tipCenter = triggerRect.left + triggerRect.width / 2;
      let arrowLeft = tipCenter - left - 7;
      arrowLeft = Math.max(12, Math.min(panelW - 24, arrowLeft));
      arrow.style.left = `${arrowLeft}px`;
    }
  }

  private destroyPanel(): void {
    this.panel?.remove();
    this.panel = null;
    this.panelLabel = null;
  }
}
