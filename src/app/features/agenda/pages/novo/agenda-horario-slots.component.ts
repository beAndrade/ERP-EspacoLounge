import {
  afterNextRender,
  Component,
  ElementRef,
  EventEmitter,
  forwardRef,
  HostListener,
  inject,
  Injector,
  Input,
  Output,
  ViewChild,
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
  /** Mantido por compatibilidade; conflito passa a ser tratado no Salvar. */
  @Output() conflitoHorario = new EventEmitter<string>();
  @Output() painelAberto = new EventEmitter<void>();

  @ViewChild('triggerInput') triggerInput?: ElementRef<HTMLInputElement>;

  private readonly host = inject(ElementRef<HTMLElement>);
  private readonly injector = inject(Injector);

  private _intervalos: IntervaloMinutosDia[] = [];
  panelOpen = false;
  filterText = '';
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

  get opcoesFiltradas(): { min: number; hhmm: string; indisponivel: boolean }[] {
    const q = this.filterText.trim().toLowerCase().replace(/\s+/g, '');
    if (!q) return this.opcoes;
    return this.opcoes.filter((o) =>
      o.hhmm.toLowerCase().replace(/\s+/g, '').includes(q),
    );
  }

  /** Rótulo do trigger: inclui «(Indisponível)» se o horário escolhido estiver ocupado. */
  get displayLabel(): string {
    if (!this.inner) return '';
    const m = this.hhmmParaMinutos(this.inner);
    if (m != null && this.minutoOcupado(m)) {
      return `${this.inner} (Indisponível)`;
    }
    return this.inner;
  }

  private hhmmParaMinutos(hhmm: string): number | null {
    const m = /^(\d{1,2}):(\d{2})$/.exec(hhmm.trim());
    if (!m) return null;
    const h = Number(m[1]);
    const mi = Number(m[2]);
    if (!Number.isFinite(h) || !Number.isFinite(mi)) return null;
    return h * 60 + mi;
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
    if (isDisabled) {
      this.panelOpen = false;
      this.filterText = '';
    }
  }

  get isDisabled(): boolean {
    return this.disabled;
  }

  fecharPainel(): void {
    this.panelOpen = false;
    this.filterText = '';
  }

  onTriggerMouseDown(ev: MouseEvent): void {
    if (this.isDisabled || this.panelOpen) return;
    if ((ev.target as HTMLElement).closest('.ahs__trigger-input')) return;
    ev.preventDefault();
  }

  toggle(ev: Event): void {
    ev.preventDefault();
    ev.stopPropagation();
    if (this.isDisabled) return;
    if ((ev.target as HTMLElement).closest('.ahs__trigger-input')) return;
    if (this.panelOpen) {
      this.fecharPainel();
      this.onTouched();
      return;
    }
    this.panelOpen = true;
    this.filterText = '';
    this.painelAberto.emit();
    this.focusSearchAfterOpen();
  }

  onTriggerFilterInput(ev: Event): void {
    this.filterText = (ev.target as HTMLInputElement).value;
  }

  onTriggerFilterKeydown(ev: KeyboardEvent): void {
    if (ev.key === 'Escape') {
      ev.preventDefault();
      ev.stopImmediatePropagation();
      this.fecharPainel();
      this.onTouched();
      return;
    }
    if (ev.key === 'Enter') {
      ev.preventDefault();
      const first = this.opcoesFiltradas[0];
      if (first) {
        this.escolher(first.hhmm, first.indisponivel, ev);
      }
    }
  }

  escolher(hhmm: string, _indisponivel: boolean, ev: Event): void {
    ev.preventDefault();
    ev.stopPropagation();
    if (this.isDisabled) return;
    // Indisponível continua selecionável; o aviso de conflito é no Salvar.
    this.inner = hhmm;
    this.onChange(hhmm);
    this.onTouched();
    this.panelOpen = false;
    this.filterText = '';
  }

  private focusSearchAfterOpen(): void {
    afterNextRender(
      () => {
        if (!this.panelOpen || this.isDisabled) return;
        const el = this.triggerInput?.nativeElement;
        if (!el) return;
        el.focus({ preventScroll: true });
      },
      { injector: this.injector },
    );
  }

  @HostListener('document:pointerdown', ['$event'])
  onDocPointer(ev: PointerEvent): void {
    if (!this.panelOpen) return;
    const t = ev.target;
    if (!(t instanceof Node)) return;
    if (this.host.nativeElement.contains(t)) return;
    this.fecharPainel();
    this.onTouched();
  }
}
