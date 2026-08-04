import {
  Directive,
  ElementRef,
  Injector,
  afterNextRender,
  inject,
  input,
} from '@angular/core';
import { applyDropdownFlipClasses } from '../../core/utils/dropdown-flip.util';

/**
 * No mount do painel, mede o espaço na viewport e aplica
 * `dropdown-flip--above` / `dropdown-flip--below`.
 *
 * Uso: no elemento do painel (filho do wrapper `position: relative` do trigger).
 */
@Directive({
  selector: '[appFlipDropdownPanel]',
  standalone: true,
})
export class FlipDropdownPanelDirective {
  private readonly el = inject(ElementRef<HTMLElement>);
  private readonly injector = inject(Injector);

  /**
   * Seletor CSS do âncora (ex.: `.list-footer__per-page`).
   * Default: `parentElement` do painel.
   */
  readonly flipAnchor = input<string | null>(null);

  /** Altura mínima estimada antes do layout (px). */
  readonly flipEstimateH = input(160, { transform: (v) => Number(v) || 160 });

  constructor() {
    afterNextRender(
      () => {
        this.measure();
        requestAnimationFrame(() => this.measure());
      },
      { injector: this.injector },
    );
  }

  private measure(): void {
    const panel = this.el.nativeElement;
    const sel = this.flipAnchor()?.trim();
    const anchor = sel
      ? (panel.closest(sel) as HTMLElement | null)
      : panel.parentElement;
    if (!anchor) return;

    applyDropdownFlipClasses(panel, anchor, {
      estimatedHeight: this.flipEstimateH(),
    });
  }
}
