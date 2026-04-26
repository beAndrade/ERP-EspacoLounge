import {
  Component,
  ElementRef,
  forwardRef,
  HostListener,
  inject,
  Input,
} from '@angular/core';
import { ControlValueAccessor, NG_VALUE_ACCESSOR } from '@angular/forms';
import { AGENDA_STATUS_META, type AgendaStatusId } from '../../core/utils/agenda-status-card';

@Component({
  selector: 'app-agenda-status-select',
  standalone: true,
  templateUrl: './agenda-status-select.component.html',
  styleUrl: './agenda-status-select.component.scss',
  host: {
    '[class.agenda-status-select--open]': 'panelOpen',
  },
  providers: [
    {
      provide: NG_VALUE_ACCESSOR,
      useExisting: forwardRef(() => AgendaStatusSelectComponent),
      multi: true,
    },
  ],
})
export class AgendaStatusSelectComponent implements ControlValueAccessor {
  private readonly host = inject(ElementRef<HTMLElement>);

  @Input('aria-label') ariaFieldLabel: string | null = null;

  readonly opcoes = AGENDA_STATUS_META;

  panelOpen = false;
  inner: AgendaStatusId = 'confirmado';
  private onChange: (v: string) => void = () => {};
  private onTouched: () => void = () => {};
  disabled = false;

  get value(): AgendaStatusId {
    return this.inner;
  }

  get opcaoAtual() {
    return this.opcoes.find((o) => o.id === this.inner) ?? this.opcoes[0];
  }

  writeValue(v: unknown): void {
    const s = String(v ?? '').trim();
    this.inner = (this.opcoes.some((o) => o.id === s) ? s : 'confirmado') as AgendaStatusId;
  }

  registerOnChange(fn: (v: string) => void): void {
    this.onChange = fn;
  }

  registerOnTouched(fn: () => void): void {
    this.onTouched = fn;
  }

  setDisabledState(isDisabled: boolean): void {
    this.disabled = isDisabled;
  }

  togglePanel(): void {
    if (this.disabled) return;
    this.panelOpen = !this.panelOpen;
    if (this.panelOpen) this.onTouched();
  }

  fecharPanel(): void {
    this.panelOpen = false;
  }

  escolher(id: AgendaStatusId): void {
    if (this.disabled) return;
    this.inner = id;
    this.onChange(id);
    this.fecharPanel();
    this.onTouched();
  }

  trackById(_i: number, o: { id: string }): string {
    return o.id;
  }

  @HostListener('document:pointerdown', ['$event'])
  onDocPointer(ev: PointerEvent): void {
    if (!this.panelOpen) return;
    const el = this.host.nativeElement;
    if (el.contains(ev.target as Node)) return;
    this.fecharPanel();
  }
}
