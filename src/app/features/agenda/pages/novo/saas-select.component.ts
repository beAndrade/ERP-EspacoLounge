import {
  AfterViewInit,
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
  ViewChild,
} from '@angular/core';
import { NgStyle } from '@angular/common';
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
  imports: [NgStyle],
  templateUrl: './saas-select.component.html',
  styleUrl: './saas-select.component.scss',
  host: {
    /** Permite ao pai elevar o `z-index` da linha/bloco (painel absoluto por cima das linhas seguintes). */
    '[class.saas-select-host--open]': 'panelOpen',
    '[class.saas-select-host--layout-sidebar]': 'layout === "sidebar"',
    '[class.saas-select-host--trigger-cursor-text]': 'triggerCursor === "text"',
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
  implements AfterViewInit, ControlValueAccessor, OnChanges, OnDestroy
{
  private readonly host = inject(ElementRef<HTMLElement>);
  @ViewChild('triggerBtn', { static: true })
  private readonly triggerBtn?: ElementRef<HTMLButtonElement>;
  @ViewChild('triggerInput')
  private readonly triggerInput?: ElementRef<HTMLInputElement>;

  /** Busca digitada no gatilho (layout sidebar / combobox). */
  get inlineSearchInTrigger(): boolean {
    return this.layout === 'sidebar';
  }

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
  /** Texto do botão no rodapé do painel (ex.: «Criar profissional»). */
  @Input() criarButtonLabel = 'Criar cliente';
  /** Coluna esquerda do hub modal (busca). O “Cliente” da grelha usa o estilo padrão. */
  @Input() layout: 'default' | 'sidebar' = 'default';
  /** Cursor do gatilho (`text` na sidebar de comissões). */
  @Input() triggerCursor: 'pointer' | 'text' = 'pointer';
  /** Acessibilidade: nome do campo (evita depender de `<label>` a envolver o gatilho). */
  @Input('aria-label') ariaFieldLabel: string | null = null;
  @Output() picked = new EventEmitter<void>();
  @Output() criarCliente = new EventEmitter<void>();
  /** Painel de opções abriu (fechar calendário / outros no hub). */
  @Output() painelAberto = new EventEmitter<void>();

  panelOpen = false;
  filterText = '';
  private inner = '';

  /**
   * Dentro de `.nc-itens--panel-fixed` (comanda no hub): painel em `position: fixed`
   * para não ser recortado por `overflow` dos ascendentes.
   */
  panelFixedMode = false;
  fixedPanelStyle: Record<string, string> = {};
  private scrollResizeUnsub?: () => void;

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

  ngAfterViewInit(): void {
    this.panelFixedMode = !!this.host.nativeElement.closest(
      '.nc-itens--panel-fixed',
    );
  }

  ngOnDestroy(): void {
    this.detachFixedPanelScrollListeners();
    this.bindSyncSub?.unsubscribe();
    this.bindSyncSub = null;
  }

  get displayLabel(): string {
    if (this.inner === '') return '';
    const hit = this.options.find(
      (o) => String(o.value) === String(this.inner),
    );
    return hit?.label ?? '';
  }

  /** Compara valor da opção com o interno (evita falha número vs string). */
  optionIsSelected(opt: SaasSelectOption): boolean {
    if (this.inner === '') return false;
    return String(opt.value) === String(this.inner);
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
    if (isDisabled) {
      this.panelOpen = false;
      this.fixedPanelStyle = {};
      this.detachFixedPanelScrollListeners();
    }
  }

  get isDisabled(): boolean {
    return this.disabled || this.onDisabled;
  }

  /** Fecha a lista (uso pelo pai no hub). */
  fecharPainel(): void {
    this.closePanel();
  }

  togglePanel(ev?: Event): void {
    ev?.stopPropagation();
    if (this.isDisabled) return;
    if (this.panelOpen) {
      this.closePanel();
      return;
    }
    this.openPanel();
  }

  onComboboxTriggerClick(ev: Event): void {
    ev.stopPropagation();
    if (this.isDisabled) return;
    if ((ev.target as HTMLElement).closest('.saas-select__trigger-input')) return;
    if (!this.panelOpen) {
      this.openPanel();
    }
  }

  onTriggerFilterInput(ev: Event): void {
    this.filterText = (ev.target as HTMLInputElement).value;
    if (!this.panelOpen) {
      this.openPanel(false);
    }
  }

  onTriggerFilterKeydown(ev: KeyboardEvent): void {
    if (ev.key === 'Escape') {
      ev.preventDefault();
      this.closePanel();
      return;
    }
    if (ev.key === 'Enter') {
      ev.preventDefault();
      const first = this.filteredOptions[0];
      if (first) {
        this.choose(first, ev);
      }
    }
  }

  private openPanel(resetFilter = true): void {
    this.panelOpen = true;
    if (resetFilter) {
      this.filterText = '';
    }
    this.painelAberto.emit();
    if (this.panelFixedMode) {
      queueMicrotask(() => {
        this.syncFixedPanelPosition();
        requestAnimationFrame(() => this.syncFixedPanelPosition());
      });
      this.attachFixedPanelScrollListeners();
    }
    if (this.inlineSearchInTrigger) {
      queueMicrotask(() => this.triggerInput?.nativeElement?.focus());
    }
  }

  private closePanel(): void {
    this.panelOpen = false;
    this.filterText = '';
    this.fixedPanelStyle = {};
    this.detachFixedPanelScrollListeners();
    this.notifyTouched();
    this.focusTriggerSoon();
  }

  choose(opt: SaasSelectOption, ev: Event): void {
    ev.stopPropagation();
    this.inner =
      opt.value === null || opt.value === undefined || opt.value === ''
        ? ''
        : String(opt.value);
    this.emitValue();
    this.panelOpen = false;
    this.filterText = '';
    this.fixedPanelStyle = {};
    this.detachFixedPanelScrollListeners();
    this.notifyTouched();
    this.picked.emit();
    this.focusTriggerSoon();
  }

  onCriarClienteClick(ev: Event): void {
    ev.stopPropagation();
    ev.preventDefault();
    this.panelOpen = false;
    this.fixedPanelStyle = {};
    this.detachFixedPanelScrollListeners();
    this.criarCliente.emit();
    this.focusTriggerSoon();
  }

  onFilterInput(ev: Event): void {
    this.filterText = (ev.target as HTMLInputElement).value;
  }

  @HostListener('document:pointerdown', ['$event'])
  onDocPointer(ev: PointerEvent): void {
    if (!this.panelOpen) return;
    const t = ev.target as Node;
    if (!this.host.nativeElement.contains(t)) {
      this.closePanel();
    }
  }

  private focusTriggerSoon(): void {
    queueMicrotask(() => {
      if (this.inlineSearchInTrigger && this.panelOpen) {
        this.triggerInput?.nativeElement?.focus();
        return;
      }
      this.triggerBtn?.nativeElement?.focus();
    });
  }

  private notifyTouched(): void {
    if (this.bindToControl) {
      this.bindToControl.markAsTouched();
    }
    this.onTouched();
  }

  private attachFixedPanelScrollListeners(): void {
    this.detachFixedPanelScrollListeners();
    if (!this.panelFixedMode) return;
    const fn = () => {
      if (this.panelOpen) {
        requestAnimationFrame(() => this.syncFixedPanelPosition());
      }
    };
    document.addEventListener('scroll', fn, true);
    window.addEventListener('resize', fn);
    this.scrollResizeUnsub = () => {
      document.removeEventListener('scroll', fn, true);
      window.removeEventListener('resize', fn);
    };
  }

  private detachFixedPanelScrollListeners(): void {
    this.scrollResizeUnsub?.();
    this.scrollResizeUnsub = undefined;
  }

  private syncFixedPanelPosition(): void {
    if (!this.panelFixedMode || !this.panelOpen || !this.triggerBtn?.nativeElement) {
      return;
    }
    const el = this.triggerBtn.nativeElement;
    const r = el.getBoundingClientRect();
    const gap = 4;
    const estPanelH = Math.min(320, window.innerHeight * 0.5);
    const spaceBelow = window.innerHeight - r.bottom - gap;
    let topPx = r.bottom + gap;
    if (spaceBelow < Math.min(estPanelH, 200) && r.top > estPanelH + gap) {
      topPx = Math.max(gap, r.top - estPanelH - gap);
    }
    const leftPx = Math.max(8, Math.min(r.left, window.innerWidth - r.width - 8));
    this.fixedPanelStyle = {
      position: 'fixed',
      top: `${topPx}px`,
      left: `${leftPx}px`,
      width: `${r.width}px`,
      'z-index': '10060',
    };
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
