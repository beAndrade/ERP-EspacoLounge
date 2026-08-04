import {
  AfterViewInit,
  Component,
  ElementRef,
  EventEmitter,
  forwardRef,
  HostListener,
  Injector,
  afterNextRender,
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
import { resolveDropdownVerticalPlacement } from '../../../../core/utils/dropdown-flip.util';

export type SaasSelectOption = { value: string; label: string; hint?: string };

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
    '[class.saas-select-host--icon-search]': 'triggerIcon === "search"',
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
  private readonly injector = inject(Injector);
  @ViewChild('triggerBtn', { static: true })
  private readonly triggerBtn?: ElementRef<HTMLButtonElement>;
  @ViewChild('triggerInput')
  private readonly triggerInput?: ElementRef<HTMLInputElement>;
  @ViewChild('triggerInputBtn')
  private readonly triggerInputBtn?: ElementRef<HTMLInputElement>;
  @ViewChild('panelFilterInput')
  private readonly panelFilterInput?: ElementRef<HTMLInputElement>;

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
  /**
   * Com painel aberto, troca o chevron pelo ícone de lupa
   * (mesmo sem barra de filtro — trial nos drawers).
   */
  @Input() showSearchIconOnOpen = false;
  @Input() showCriarCliente = false;
  /** Texto do botão no rodapé do painel (ex.: «Criar profissional»). */
  @Input() criarButtonLabel = 'Criar cliente';
  /** Coluna esquerda do hub modal (busca). O “Cliente” da grelha usa o estilo padrão. */
  @Input() layout: 'default' | 'sidebar' = 'default';
  /** Ícone à direita do gatilho (`search` no campo Cliente do drawer). */
  @Input() triggerIcon: 'chevron' | 'search' = 'chevron';
  /** Cursor do gatilho (`text` na sidebar de comissões). */
  @Input() triggerCursor: 'pointer' | 'text' = 'pointer';
  /** Acessibilidade: nome do campo (evita depender de `<label>` a envolver o gatilho). */
  @Input('aria-label') ariaFieldLabel: string | null = null;
  @Output() picked = new EventEmitter<void>();
  @Output() criarCliente = new EventEmitter<void>();
  /** Painel de opções abriu (fechar calendário / outros no hub). */
  @Output() painelAberto = new EventEmitter<void>();

  panelOpen = false;
  /** Painel absoluto abre para cima (espaço insuficiente abaixo). */
  panelOpenAbove = false;
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
    const hit = this.options.find(
      (o) => String(o.value) === String(this.inner),
    );
    return hit?.label ?? '';
  }

  get displayHint(): string {
    const hit = this.options.find(
      (o) => String(o.value) === String(this.inner),
    );
    return hit?.hint?.trim() ?? '';
  }

  /** Compara valor da opção com o interno (evita falha número vs string). */
  optionIsSelected(opt: SaasSelectOption): boolean {
    return String(opt.value) === String(this.inner);
  }

  /** Lupa no gatilho enquanto o painel está aberto. */
  get showTriggerSearchIcon(): boolean {
    return this.panelOpen && (this.showFilter || this.showSearchIconOnOpen);
  }

  /** Campo editável no gatilho (filtrar opções ao digitar). */
  get typeInTriggerWhenOpen(): boolean {
    return this.showFilter || this.showSearchIconOnOpen;
  }

  get filteredOptions(): SaasSelectOption[] {
    const q = this.filterText.trim().toLowerCase();
    if (!q) return this.options;
    return this.options.filter((o) => {
      const label = o.label.toLowerCase();
      const hint = (o.hint ?? '').toLowerCase();
      return label.includes(q) || hint.includes(q);
    });
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
      this.panelOpenAbove = false;
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

  /**
   * Evita que o `<button>` roube o foco no 1.º clique — o input de pesquisa
   * (filho do gatilho) só existe depois de abrir o painel.
   */
  onTriggerMouseDown(ev: MouseEvent): void {
    if (this.isDisabled || this.panelOpen) return;
    if ((ev.target as HTMLElement).closest('.saas-select__trigger-input')) {
      return;
    }
    ev.preventDefault();
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
      ev.stopImmediatePropagation();
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
    afterNextRender(
      () => {
        if (!this.panelOpen) return;
        this.syncPanelPlacement();
        requestAnimationFrame(() => this.syncPanelPlacement());
      },
      { injector: this.injector },
    );
    if (this.panelFixedMode) {
      this.attachFixedPanelScrollListeners();
    }
    this.focusSearchFieldAfterOpen();
  }

  /**
   * O input de pesquisa só existe no DOM depois do `@if (panelOpen)` renderizar.
   * `queueMicrotask` sozinho falha no 1.º clique — o utilizador tinha de clicar de novo.
   */
  private focusSearchFieldAfterOpen(): void {
    if (!this.typeInTriggerWhenOpen && this.layout !== 'sidebar') return;
    afterNextRender(
      () => {
        if (!this.panelOpen || this.isDisabled) return;
        const el =
          this.triggerInput?.nativeElement ??
          this.triggerInputBtn?.nativeElement ??
          this.panelFilterInput?.nativeElement ??
          (this.host.nativeElement.querySelector(
            '.saas-select__trigger-input, .saas-select__filter-input',
          ) as HTMLInputElement | null);
        if (!el) return;
        el.focus({ preventScroll: true });
      },
      { injector: this.injector },
    );
  }

  private closePanel(): void {
    this.panelOpen = false;
    this.panelOpenAbove = false;
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
    this.panelOpenAbove = false;
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
    this.panelOpenAbove = false;
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
      if (this.panelOpen) {
        this.focusSearchFieldAfterOpen();
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
        requestAnimationFrame(() => this.syncPanelPlacement());
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

  private syncPanelPlacement(): void {
    if (!this.panelOpen || !this.triggerBtn?.nativeElement) return;
    const el = this.triggerBtn.nativeElement;
    const r = el.getBoundingClientRect();
    const gap = 4;
    const panelElev = this.host.nativeElement.querySelector(
      '.saas-select__panel-elev',
    ) as HTMLElement | null;
    const measuredH = panelElev?.offsetHeight ?? 0;
    const estPanelH = Math.max(
      measuredH,
      Math.min(320, window.innerHeight * 0.5),
    );
    const placement = resolveDropdownVerticalPlacement(r, estPanelH, { gap });
    this.panelOpenAbove = placement === 'above';

    if (!this.panelFixedMode) return;

    let topPx =
      placement === 'above' ? r.top - estPanelH - gap : r.bottom + gap;
    topPx = Math.max(
      gap,
      Math.min(topPx, window.innerHeight - estPanelH - gap),
    );

    /** Piso só quando o trigger encolhe abaixo do padrão (CSS var resolvida). */
    const minRaw = getComputedStyle(this.host.nativeElement)
      .getPropertyValue('--saas-select-panel-min-width')
      .trim();
    let widthPx = r.width;
    if (minRaw && minRaw !== '100%') {
      const parsed = Number.parseFloat(minRaw);
      if (Number.isFinite(parsed) && parsed > widthPx) {
        widthPx = parsed;
      }
    }
    widthPx = Math.min(widthPx, window.innerWidth - 16);
    /** Alinha à esquerda do input; se não couber, desloca para caber na VW. */
    let leftPx = r.left;
    if (leftPx + widthPx > window.innerWidth - 8) {
      leftPx = Math.max(8, window.innerWidth - widthPx - 8);
    }
    leftPx = Math.max(8, leftPx);
    this.fixedPanelStyle = {
      position: 'fixed',
      top: `${topPx}px`,
      left: `${leftPx}px`,
      width: `${widthPx}px`,
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
