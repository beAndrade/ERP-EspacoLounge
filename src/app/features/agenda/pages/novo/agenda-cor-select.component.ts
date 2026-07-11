import {
  Component,
  ElementRef,
  forwardRef,
  HostListener,
  inject,
  Input,
  ViewChild,
} from '@angular/core';
import { ControlValueAccessor, FormsModule, NG_VALUE_ACCESSOR } from '@angular/forms';
import {
  AGENDA_COR_PADRAO_ID,
  carregarCoresAgendaCustom,
  gravarCoresAgendaCustom,
  listarOpcoesCorAgenda,
  type AgendaCorOpcao,
} from '../../../../core/utils/agenda-cor-card';

@Component({
  selector: 'app-agenda-cor-select',
  standalone: true,
  imports: [FormsModule],
  templateUrl: './agenda-cor-select.component.html',
  styleUrl: './agenda-cor-select.component.scss',
  host: {
    '[class.agenda-cor-select--open]': 'panelOpen',
  },
  providers: [
    {
      provide: NG_VALUE_ACCESSOR,
      useExisting: forwardRef(() => AgendaCorSelectComponent),
      multi: true,
    },
  ],
})
export class AgendaCorSelectComponent implements ControlValueAccessor {
  private readonly host = inject(ElementRef<HTMLElement>);

  @Input('aria-label') ariaFieldLabel: string | null = null;

  @ViewChild('nomeCriar') nomeCriarInput?: ElementRef<HTMLInputElement>;

  opcoes: AgendaCorOpcao[] = listarOpcoesCorAgenda();

  panelOpen = false;
  inner = AGENDA_COR_PADRAO_ID;
  private onChange: (v: string) => void = () => {};
  private onTouched: () => void = () => {};
  disabled = false;

  criando = false;
  novoNome = '';
  novaCorHex = '#505afb';

  get opcaoAtual(): AgendaCorOpcao {
    return this.opcoes.find((o) => o.id === this.inner) ?? this.opcoes[0];
  }

  /** «Padrão» fica só no trigger; não entra na lista do painel. */
  get opcoesDropdown(): AgendaCorOpcao[] {
    return this.opcoes.filter((o) => o.id !== AGENDA_COR_PADRAO_ID);
  }

  get podeConfirmarCriar(): boolean {
    return this.novoNome.trim().length > 0 && /^#[0-9A-Fa-f]{6}$/.test(this.novaCorHex);
  }

  writeValue(v: unknown): void {
    const s = String(v ?? '').trim();
    this.inner = this.opcoes.some((o) => o.id === s) ? s : AGENDA_COR_PADRAO_ID;
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
    if (this.panelOpen) {
      this.onTouched();
    } else {
      this.cancelarCriar();
    }
  }

  fecharPanel(): void {
    this.panelOpen = false;
    this.cancelarCriar();
  }

  escolher(id: string): void {
    if (this.disabled) return;
    this.inner = id;
    this.onChange(id);
    this.fecharPanel();
    this.onTouched();
  }

  abrirCriar(ev: Event): void {
    ev.stopPropagation();
    this.criando = true;
    this.novoNome = '';
    this.novaCorHex = '#505afb';
    queueMicrotask(() => this.nomeCriarInput?.nativeElement.focus());
  }

  cancelarCriar(): void {
    this.criando = false;
    this.novoNome = '';
  }

  confirmarCriar(): void {
    if (!this.podeConfirmarCriar) return;
    const label = this.novoNome.trim();
    const cor = this.novaCorHex.trim();
    const id = `custom_${Date.now().toString(36)}`;
    const nova: AgendaCorOpcao = { id, label, cor };
    const extras = [...carregarCoresAgendaCustom(), nova];
    gravarCoresAgendaCustom(extras);
    this.opcoes = listarOpcoesCorAgenda();
    this.escolher(id);
  }

  trackById(_i: number, o: AgendaCorOpcao): string {
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
