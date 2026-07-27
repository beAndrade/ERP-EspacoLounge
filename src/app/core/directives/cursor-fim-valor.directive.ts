import {
  Directive,
  ElementRef,
  OnDestroy,
  OnInit,
  inject,
} from '@angular/core';

/**
 * No clique/foco: se o campo estiver vazio e houver placeholder numérico
 * (ex.: 0,00 / 0), copia o placeholder para o valor real e coloca o caret
 * no fim dos dígitos. Com valor já preenchido, só manda o caret para o fim.
 */
@Directive({
  selector: 'input[appCursorFimValor]',
  standalone: true,
})
export class CursorFimValorDirective implements OnInit, OnDestroy {
  private readonly el = inject(ElementRef<HTMLInputElement>).nativeElement;
  private readonly ac = new AbortController();

  private garantirValorReal(): void {
    const input = this.el;
    if (input.value.length > 0) return;
    const seed = (input.getAttribute('placeholder') || '').trim();
    if (!seed) return;
    input.value = seed;
    input.dispatchEvent(new Event('input', { bubbles: true }));
  }

  private caretAoFim(): void {
    const input = this.el;
    this.garantirValorReal();
    const len = input.value.length;
    if (len === 0) return;
    try {
      input.setSelectionRange(len, len);
    } catch {
      /* ignore */
    }
  }

  ngOnInit(): void {
    const opts: AddEventListenerOptions = { signal: this.ac.signal };
    const afterClick = () => {
      this.caretAoFim();
      requestAnimationFrame(() => this.caretAoFim());
      setTimeout(() => this.caretAoFim(), 0);
    };

    this.el.addEventListener('click', afterClick, opts);
    this.el.addEventListener('focus', afterClick, opts);
    this.el.addEventListener(
      'mouseup',
      (ev: MouseEvent) => {
        ev.preventDefault();
        afterClick();
      },
      opts,
    );
  }

  ngOnDestroy(): void {
    this.ac.abort();
  }
}
