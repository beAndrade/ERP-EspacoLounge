import {
  Component,
  ElementRef,
  EventEmitter,
  forwardRef,
  HostListener,
  inject,
  Input,
  Output,
} from '@angular/core';
import { ControlValueAccessor, NG_VALUE_ACCESSOR } from '@angular/forms';

export type SaasSelectOption = { value: string; label: string };

@Component({
  selector: 'app-saas-select',
  standalone: true,
  templateUrl: './saas-select.component.html',
  styleUrl: './saas-select.component.scss',
  providers: [
    {
      provide: NG_VALUE_ACCESSOR,
      useExisting: forwardRef(() => SaasSelectComponent),
      multi: true,
    },
  ],
})
export class SaasSelectComponent implements ControlValueAccessor {
  private readonly host = inject(ElementRef<HTMLElement>);

  @Input() options: SaasSelectOption[] = [];
  @Input() placeholder = 'Selecione…';
  @Input() disabled = false;
  /** Se true, emite `number | null` em vez de `string` (ex.: profissional). */
  @Input() useNumericOutput = false;
  @Output() picked = new EventEmitter<void>();

  panelOpen = false;
  filterText = '';
  private inner = '';

  /** Exposto ao template para realce da opção activa. */
  get selectedValue(): string {
    return this.inner;
  }

  private onChange: (v: unknown) => void = () => {};
  private onTouched: () => void = () => {};
  private onDisabled = false;

  get displayLabel(): string {
    if (this.inner === '') return '';
    const hit = this.options.find((o) => o.value === this.inner);
    return hit?.label ?? '';
  }

  get filteredOptions(): SaasSelectOption[] {
    const q = this.filterText.trim().toLowerCase();
    if (!q) return this.options;
    return this.options.filter((o) => o.label.toLowerCase().includes(q));
  }

  writeValue(v: unknown): void {
    if (this.useNumericOutput) {
      if (v == null || v === '') this.inner = '';
      else this.inner = String(v);
    } else {
      this.inner = v == null || v === '' ? '' : String(v);
    }
  }

  registerOnChange(fn: (v: unknown) => void): void {
    this.onChange = fn;
  }

  registerOnTouched(fn: () => void): void {
    this.onTouched = fn;
  }

  setDisabledState(isDisabled: boolean): void {
    this.onDisabled = isDisabled;
    if (isDisabled) this.panelOpen = false;
  }

  get isDisabled(): boolean {
    return this.disabled || this.onDisabled;
  }

  togglePanel(ev?: Event): void {
    ev?.stopPropagation();
    if (this.isDisabled) return;
    if (this.panelOpen) {
      this.panelOpen = false;
      this.onTouched();
      return;
    }
    this.panelOpen = true;
    this.filterText = '';
  }

  choose(opt: SaasSelectOption, ev: Event): void {
    ev.stopPropagation();
    this.inner = opt.value;
    this.emitValue();
    this.panelOpen = false;
    this.onTouched();
    this.picked.emit();
  }

  onFilterInput(ev: Event): void {
    this.filterText = (ev.target as HTMLInputElement).value;
  }

  private emitValue(): void {
    if (this.useNumericOutput) {
      const out =
        this.inner === '' || this.inner === null ? null : Number(this.inner);
      this.onChange(Number.isNaN(out as number) ? null : out);
    } else {
      this.onChange(this.inner === '' ? '' : this.inner);
    }
  }

  @HostListener('document:pointerdown', ['$event'])
  onDocPointer(ev: PointerEvent): void {
    if (!this.panelOpen) return;
    const t = ev.target as Node;
    if (!this.host.nativeElement.contains(t)) {
      this.panelOpen = false;
      this.onTouched();
    }
  }
}
