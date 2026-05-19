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
import { CommonModule } from '@angular/common';
import {
  ControlValueAccessor,
  NG_VALUE_ACCESSOR,
} from '@angular/forms';

/** Minutos do dia [início, fim) onde já existe marcação (salão). */
export type IntervaloMinutosDia = { a: number; b: number };

function pad2(n: number): string {
  return String(n).padStart(2, '0');
}

/** HH:mm a partir de minutos desde meia-noite. */
export function minutosParaHHmm(m: number): string {
  const h = Math.floor(m / 60);
  const mi = m % 60;
  return `${pad2(h)}:${pad2(mi)}`;
}

/** Dropdown de horários 8:00–23:00 de 5 em 5 min; marca indisponíveis. */
@Component({
  selector: 'app-agenda-horario-slots',
  standalone: true,
  imports: [CommonModule],
  templateUrl: './agenda-horario-slots.component.html',
  styleUrl: './agenda-horario-slots.component.scss',
  providers: [
    {
      provide: NG_VALUE_ACCESSOR,
      useExisting: forwardRef(() => AgendaHorarioSlotsComponent),
      multi: true,
    },
  ],
  host: {
    '[class.ahs-host--open]': 'panelOpen',
  },
})
export class AgendaHorarioSlotsComponent implements ControlValueAccessor {
  @Input('aria-label') ariaFieldLabel: string | null = null;

  @Input() set intervalosOcupados(v: IntervaloMinutosDia[]) {
    this._intervalos = Array.isArray(v) ? v : [];
  }
  @Output() conflitoHorario = new EventEmitter<string>();
  @Output() painelAberto = new EventEmitter<void>();

  private readonly host = inject(ElementRef<HTMLElement>);

  private _intervalos: IntervaloMinutosDia[] = [];
  panelOpen = false;
  private inner = '';
  private onChange: (v: string) => void = () => {};
  private onTouched: () => void = () => {};
  private disabled = false;

  get opcoes(): { min: number; hhmm: string; indisponivel: boolean }[] {
    const out: { min: number; hhmm: string; indisponivel: boolean }[] = [];
    for (let m = 8 * 60; m <= 23 * 60; m += 5) {
      const hhmm = minutosParaHHmm(m);
      out.push({
        min: m,
        hhmm,
        indisponivel: this.minutoOcupado(m),
      });
    }
    return out;
  }

  get displayLabel(): string {
    return this.inner;
  }

  private minutoOcupado(m: number): boolean {
    for (const r of this._intervalos) {
      if (m >= r.a && m < r.b) return true;
    }
    return false;
  }

  writeValue(v: string | null): void {
    this.inner = v == null || v === '' ? '' : String(v).trim();
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

  get isDisabled(): boolean {
    return this.disabled;
  }

  fecharPainel(): void {
    this.panelOpen = false;
  }

  toggle(ev: Event): void {
    ev.preventDefault();
    ev.stopPropagation();
    if (this.isDisabled) return;
    const willOpen = !this.panelOpen;
    this.panelOpen = willOpen;
    if (willOpen) {
      this.painelAberto.emit();
    }
  }

  escolher(hhmm: string, indisponivel: boolean, ev: Event): void {
    ev.preventDefault();
    ev.stopPropagation();
    if (this.isDisabled) return;
    if (indisponivel) {
      this.conflitoHorario.emit(hhmm);
      this.panelOpen = false;
      this.onTouched();
      return;
    }
    this.inner = hhmm;
    this.onChange(hhmm);
    this.onTouched();
    this.panelOpen = false;
  }

  @HostListener('document:click', ['$event'])
  onDocClick(ev: MouseEvent): void {
    if (!this.panelOpen) return;
    const t = ev.target;
    if (!(t instanceof Node)) return;
    if (this.host.nativeElement.contains(t)) return;
    this.panelOpen = false;
  }
}
