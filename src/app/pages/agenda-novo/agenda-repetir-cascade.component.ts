import {
  Component,
  ElementRef,
  EventEmitter,
  HostListener,
  Input,
  Output,
  inject,
} from '@angular/core';
import {
  ITENS_FREQUENCIA,
  ROTULO_FREQUENCIA,
  type FrequenciaRepetirAgendamento,
  type ValorRepetirAgendamento,
} from './agenda-repetir-cascade.models';
import { descricaoFrequenciaParaData } from './agenda-repetir-descricoes';

/** Fase 1: só frequências. Fase 2: repetições (após escolher frequência). */
type FaseRepetir = 'frequencia' | 'repeticoes';

@Component({
  selector: 'app-agenda-repetir-cascade',
  standalone: true,
  templateUrl: './agenda-repetir-cascade.component.html',
  styleUrl: './agenda-repetir-cascade.component.scss',
  host: {
    '[class.agenda-repetir-cascade--open]': 'aberto',
    '[class.agenda-repetir-cascade--disabled]': 'disabled',
  },
})
export class AgendaRepetirCascadeComponent {
  private readonly host = inject(ElementRef<HTMLElement>);

  @Input() disabled = false;
  /** Data do atendamento (`yyyy-MM-dd` ou `Date`) para textos do tipo "toda a(o) sábado", "todo dia 12…". */
  @Input() dataReferencia: string | Date | null = null;
  @Input() value: ValorRepetirAgendamento = { modo: 'nenhum' };
  @Output() valueChange = new EventEmitter<ValorRepetirAgendamento>();

  aberto = false;
  fase: FaseRepetir = 'frequencia';
  /** Na fase 2, frequência escolhida; na 1, null até o utilizador escolher. */
  freqAlvo: FrequenciaRepetirAgendamento | null = null;
  /** Contagem 1–60 na coluna direita, derivada de `freqAlvo`. */
  readonly vezesOpcoes = Array.from({ length: 60 }, (_, i) => i + 1);

  readonly itensFrequencia = ITENS_FREQUENCIA;
  readonly rotuloFrequencia = ROTULO_FREQUENCIA;

  get rotuloTrigger(): string {
    if (this.value.modo === 'nenhum') {
      return 'Agendamento não se repete';
    }
    const v = this.value;
    if (v.modo !== 'repetir') return 'Agendamento não se repete';
    const nome = this.rotuloFrequencia[v.frequencia];
    return `${nome} — +${v.vezes} ${
      v.vezes === 1 ? 'vez' : 'vezes'
    } além deste`;
  }

  descricaoFrequencia(f: FrequenciaRepetirAgendamento): string {
    return descricaoFrequenciaParaData(f, this.dataReferenciaParaData());
  }

  private dataReferenciaParaData(): Date {
    const r = this.dataReferencia;
    if (r instanceof Date && !isNaN(r.getTime())) {
      return r;
    }
    if (typeof r === 'string' && r.trim() !== '') {
      const d = new Date(r.includes('T') ? r : `${r}T12:00:00`);
      if (!isNaN(d.getTime())) return d;
    }
    return new Date();
  }

  toggle(ev: Event): void {
    if (this.disabled) return;
    ev.stopPropagation();
    this.aberto = !this.aberto;
    if (this.aberto) {
      this.fase = 'frequencia';
      this.freqAlvo = null;
    } else {
      this.fase = 'frequencia';
      this.freqAlvo = null;
    }
  }

  onClicFrequencia(f: FrequenciaRepetirAgendamento, ev: Event): void {
    ev.stopPropagation();
    if (this.disabled) return;
    this.freqAlvo = f;
    this.fase = 'repeticoes';
  }

  escolherVezes(n: number, ev: Event): void {
    ev.stopPropagation();
    if (this.disabled || !this.freqAlvo) return;
    this.valueChange.emit({
      modo: 'repetir',
      frequencia: this.freqAlvo,
      vezes: n,
    });
    this.aberto = false;
    this.fase = 'frequencia';
    this.freqAlvo = null;
  }

  limpar(ev: Event): void {
    ev.stopPropagation();
    this.valueChange.emit({ modo: 'nenhum' });
    this.aberto = false;
    this.fase = 'frequencia';
    this.freqAlvo = null;
  }

  @HostListener('document:pointerdown', ['$event'])
  onDocClick(ev: PointerEvent): void {
    if (!this.aberto) return;
    const t = ev.target as Node;
    if (!this.host.nativeElement.contains(t)) {
      this.aberto = false;
      this.fase = 'frequencia';
      this.freqAlvo = null;
    }
  }
}
