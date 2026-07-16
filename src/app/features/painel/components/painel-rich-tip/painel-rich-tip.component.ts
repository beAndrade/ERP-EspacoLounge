import {
  Component,
  ElementRef,
  HostListener,
  OnDestroy,
  ViewEncapsulation,
  signal,
  viewChild,
} from '@angular/core';

/**
 * Popover branco rico (título + HTML projetado) — hover no ícone «?».
 * Renderiza no `document.body` para não ser clipado por overflow/transform dos painéis.
 */
@Component({
  selector: 'app-painel-rich-tip',
  standalone: true,
  encapsulation: ViewEncapsulation.None,
  templateUrl: './painel-rich-tip.component.html',
  styleUrl: './painel-rich-tip.component.scss',
})
export class PainelRichTipComponent implements OnDestroy {
  /** Painel no DOM (permite fade-out antes de destruir). */
  readonly mounted = signal(false);
  /** Classe de visibilidade (entrada / fade). */
  readonly visible = signal(false);

  private readonly anchorRef =
    viewChild.required<ElementRef<HTMLElement>>('anchor');
  private readonly panelRef = viewChild<ElementRef<HTMLElement>>('panel');

  private showTimer: ReturnType<typeof setTimeout> | null = null;
  private hideTimer: ReturnType<typeof setTimeout> | null = null;
  private unmountTimer: ReturnType<typeof setTimeout> | null = null;

  private readonly gap = 8;
  private readonly fadeMs = 180;

  private readonly onScrollCapture = (): void => {
    if (this.mounted()) this.position();
  };

  constructor() {
    document.addEventListener('scroll', this.onScrollCapture, true);
  }

  @HostListener('document:keydown.escape')
  onEsc(): void {
    this.scheduleHide();
  }

  @HostListener('window:resize')
  onViewportChange(): void {
    if (this.mounted()) this.position();
  }

  onEnter(): void {
    this.clearHide();
    this.clearUnmount();
    this.clearShow();
    this.showTimer = setTimeout(() => {
      this.showTimer = null;
      this.openNow();
    }, 220);
  }

  onLeave(): void {
    this.clearShow();
    this.scheduleHide();
  }

  onPanelEnter(): void {
    this.clearHide();
    this.clearUnmount();
    this.visible.set(true);
  }

  onPanelLeave(): void {
    this.scheduleHide();
  }

  ngOnDestroy(): void {
    document.removeEventListener('scroll', this.onScrollCapture, true);
    this.clearShow();
    this.clearHide();
    this.clearUnmount();
    this.detachFromBody();
  }

  private openNow(): void {
    this.mounted.set(true);
    this.visible.set(false);
    requestAnimationFrame(() => {
      this.attachToBody();
      this.position();
      requestAnimationFrame(() => {
        this.position();
        this.visible.set(true);
      });
    });
  }

  private scheduleHide(): void {
    this.clearHide();
    this.hideTimer = setTimeout(() => {
      this.hideTimer = null;
      this.visible.set(false);
      this.clearUnmount();
      this.unmountTimer = setTimeout(() => {
        this.unmountTimer = null;
        this.mounted.set(false);
      }, this.fadeMs);
    }, 100);
  }

  private clearShow(): void {
    if (this.showTimer != null) {
      clearTimeout(this.showTimer);
      this.showTimer = null;
    }
  }

  private clearHide(): void {
    if (this.hideTimer != null) {
      clearTimeout(this.hideTimer);
      this.hideTimer = null;
    }
  }

  private clearUnmount(): void {
    if (this.unmountTimer != null) {
      clearTimeout(this.unmountTimer);
      this.unmountTimer = null;
    }
  }

  private attachToBody(): void {
    const panel = this.panelRef()?.nativeElement;
    if (panel && panel.parentElement !== document.body) {
      document.body.appendChild(panel);
    }
  }

  private detachFromBody(): void {
    const panel = this.panelRef()?.nativeElement;
    panel?.remove();
  }

  private triggerRect(): DOMRect {
    const anchor = this.anchorRef()?.nativeElement;
    if (!anchor) return new DOMRect();
    const el = anchor.querySelector<HTMLElement>('button') ?? anchor;
    return el.getBoundingClientRect();
  }

  private position(): void {
    const panel = this.panelRef()?.nativeElement;
    if (!panel) return;

    this.attachToBody();

    const triggerRect = this.triggerRect();
    const margin = 12;
    const pw = panel.offsetWidth;

    // Sempre abaixo do ícone; balão centrado no ícone; seta no meio do balão (CSS).
    const tipCenter = triggerRect.left + triggerRect.width / 2;
    let left = tipCenter - pw / 2;
    left = Math.max(margin, Math.min(left, window.innerWidth - pw - margin));

    const top = triggerRect.bottom + this.gap;

    panel.style.top = `${top}px`;
    panel.style.left = `${left}px`;
  }
}
