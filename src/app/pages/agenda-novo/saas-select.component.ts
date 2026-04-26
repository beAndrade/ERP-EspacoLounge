import {
  Component,
  ElementRef,
  EventEmitter,
  forwardRef,
  HostListener,
  inject,
  Input,
  OnChanges,
  OnDestroy,
  Output,
  SimpleChanges,
} from '@angular/core';
import {
  ControlValueAccessor,
  FormControl,
  NG_VALUE_ACCESSOR,
} from '@angular/forms';
import { Subscription } from 'rxjs';

export type SaasSelectOption = { value: string; label: string };

@Component({
  selector: 'app-saas-select',
  standalone: true,
  templateUrl: './saas-select.component.html',
  styleUrl: './saas-select.component.scss',
  host: {
    /** Permite ao pai elevar o `z-index` da linha/bloco (painel absoluto por cima das linhas seguintes). */
    '[class.saas-select-host--open]': 'panelOpen',
    '[class.saas-select-host--layout-sidebar]': 'layout === "sidebar"',
  },
  providers: [
    {
      provide: NG_VALUE_ACCESSOR,
      useExisting: forwardRef(() => SaasSelectComponent),
      multi: true,
    },
  ],
})
export class SaasSelectComponent
  implements ControlValueAccessor, OnChanges, OnDestroy
{
  private readonly host = inject(ElementRef<HTMLElement>);

  /**
   * Espelha um `FormControl` sem `formControlName` / `[formControl]` neste elemento,
   * para não registar um segundo `ControlValueAccessor` no mesmo controlo.
   * O campo “oficial” no formulário deve continuar a usar `formControlName` noutro `app-saas-select`.
   */
  @Input() bindToControl: FormControl | null = null;

  @Input() options: SaasSelectOption[] = [];
  @Input() placeholder = 'Selecione…';
  @Input() disabled = false;
  /** Se true, emite `number | null` em vez de `string` (ex.: profissional). */
  @Input() useNumericOutput = false;
  /** Quando falso, o painel mostra a lista completa (sem barra "Pesquisar"). */
  @Input() showFilter = true;
  @Input() showCriarCliente = false;
  /** Coluna esquerda do hub modal (busca). O “Cliente” da grelha usa o estilo padrão. */
  @Input() layout: 'default' | 'sidebar' = 'default';
  @Output() picked = new EventEmitter<void>();
  @Output() criarCliente = new EventEmitter<void>();
  /** Painel de opções abriu (fechar calendário / outros no hub). */
  @Output() painelAberto = new EventEmitter<void>();

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
  private bindSyncSub: Subscription | null = null;

  ngOnChanges(changes: SimpleChanges): void {
    if (!changes['bindToControl']) return;
    this.bindSyncSub?.unsubscribe();
    this.bindSyncSub = null;
    const c = this.bindToControl;
    if (c) {
      this.writeValue(c.value);
      this.bindSyncSub = c.valueChanges.subscribe((v) => this.writeValue(v));
    }
  }

  ngOnDestroy(): void {
    this.bindSyncSub?.unsubscribe();
    this.bindSyncSub = null;
  }

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

  /** Fecha a lista (uso pelo pai no hub). */
  fecharPainel(): void {
    this.panelOpen = false;
  }

  togglePanel(ev?: Event): void {
    ev?.stopPropagation();
    if (this.isDisabled) return;
    if (this.panelOpen) {
      this.panelOpen = false;
      this.notifyTouched();
      return;
    }
    this.panelOpen = true;
    this.filterText = '';
    this.painelAberto.emit();
  }

  choose(opt: SaasSelectOption, ev: Event): void {
    ev.stopPropagation();
    this.inner = opt.value;
    this.emitValue();
    this.panelOpen = false;
    this.notifyTouched();
    this.picked.emit();
  }

  onCriarClienteClick(ev: Event): void {
    ev.stopPropagation();
    ev.preventDefault();
    this.panelOpen = false;
    this.criarCliente.emit();
  }

  onFilterInput(ev: Event): void {
    this.filterText = (ev.target as HTMLInputElement).value;
  }

  @HostListener('document:pointerdown', ['$event'])
  onDocPointer(ev: PointerEvent): void {
    if (!this.panelOpen) return;
    const t = ev.target as Node;
    if (!this.host.nativeElement.contains(t)) {
      this.panelOpen = false;
      this.notifyTouched();
    }
  }

  private notifyTouched(): void {
    if (this.bindToControl) {
      this.bindToControl.markAsTouched();
    }
    this.onTouched();
  }

  private emitValue(): void {
    if (this.bindToControl) {
      if (this.useNumericOutput) {
        const out =
          this.inner === '' || this.inner === null ? null : Number(this.inner);
        const v = Number.isNaN(out as number) ? null : out;
        this.bindToControl.setValue(v as never, { emitEvent: true });
      } else {
        const v = this.inner === '' ? '' : this.inner;
        this.bindToControl.setValue(v as never, { emitEvent: true });
      }
      this.bindToControl.markAsDirty();
      return;
    }
    this.emitValueThroughCva();
  }

  private emitValueThroughCva(): void {
    if (this.useNumericOutput) {
      const out =
        this.inner === '' || this.inner === null ? null : Number(this.inner);
      this.onChange(Number.isNaN(out as number) ? null : out);
    } else {
      this.onChange(this.inner === '' ? '' : this.inner);
    }
  }
}
