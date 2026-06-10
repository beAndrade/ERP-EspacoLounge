import {
  Directive,
  HostListener,
  inject,
  Optional,
  Self,
  type OnInit,
} from '@angular/core';
import { NgControl } from '@angular/forms';
import {
  formatarCelularBr,
  telefoneBrDigitos,
} from '../utils/telefone-br';

/** Máscara de celular BR: `(00) 00000-0000`, máx. 11 dígitos. */
@Directive({
  selector: 'input[appCelularBrMask]',
  standalone: true,
})
export class CelularBrMaskDirective implements OnInit {
  @Self() @Optional() private readonly ngControl = inject(NgControl, {
    self: true,
    optional: true,
  });

  ngOnInit(): void {
    const c = this.ngControl?.control;
    if (!c) return;
    const v = String(c.value ?? '');
    if (!v.trim()) return;
    const f = formatarCelularBr(v);
    if (f !== v) c.setValue(f, { emitEvent: false });
  }

  @HostListener('beforeinput', ['$event'])
  onBeforeInput(ev: InputEvent): void {
    if (ev.isComposing) return;
    const data = ev.data;
    if (!data || !/\d/.test(data)) return;
    const el = ev.target as HTMLInputElement;
    const digitos = telefoneBrDigitos(el.value);
    const start = el.selectionStart ?? 0;
    const end = el.selectionEnd ?? 0;
    const selDigitos = telefoneBrDigitos(el.value.slice(start, end)).length;
    if (digitos.length - selDigitos + 1 > 11) ev.preventDefault();
  }

  @HostListener('input', ['$event.target'])
  onInput(target: HTMLInputElement): void {
    const c = this.ngControl?.control;
    const f = formatarCelularBr(target.value);
    if (target.value !== f) target.value = f;
    if (c) c.setValue(f, { emitEvent: true });
  }

  @HostListener('blur')
  onBlur(): void {
    const c = this.ngControl?.control;
    if (!c) return;
    const f = formatarCelularBr(String(c.value ?? ''));
    if (c.value !== f) c.setValue(f, { emitEvent: true });
  }
}
