import {
  Directive,
  HostListener,
  inject,
  Optional,
  Self,
  type OnInit,
} from '@angular/core';
import { NgControl } from '@angular/forms';
import { formatarTelefoneBr } from '../utils/telefone-br';

/**
 * Máscara dinâmica `(00) 0000-0000` / `(00) 00000-0000` em inputs de telefone (reactive forms).
 */
@Directive({
  selector: '[appTelefoneBrMask]',
  standalone: true,
})
export class TelefoneBrMaskDirective implements OnInit {
  @Self() @Optional() private readonly ngControl = inject(NgControl, {
    self: true,
    optional: true,
  });

  ngOnInit(): void {
    const c = this.ngControl?.control;
    if (!c) return;
    const v = String(c.value ?? '');
    if (!v.trim()) return;
    const f = formatarTelefoneBr(v);
    if (f !== v) c.setValue(f, { emitEvent: false });
  }

  @HostListener('input', ['$event.target'])
  onInput(target: HTMLInputElement): void {
    const c = this.ngControl?.control;
    if (!c) return;
    const f = formatarTelefoneBr(target.value);
    if (target.value !== f) target.value = f;
    c.setValue(f, { emitEvent: true });
  }

  @HostListener('blur')
  onBlur(): void {
    const c = this.ngControl?.control;
    if (!c) return;
    const f = formatarTelefoneBr(String(c.value ?? ''));
    if (c.value !== f) c.setValue(f, { emitEvent: true });
  }
}
