import {
  Component,
  EventEmitter,
  Input,
  Output,
} from '@angular/core';
import { CommonModule } from '@angular/common';

const DIAS_PT = ['Dom', 'Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sáb'] as const;
const MESES_CURTOS = [
  'jan',
  'fev',
  'mar',
  'abr',
  'mai',
  'jun',
  'jul',
  'ago',
  'set',
  'out',
  'nov',
  'dez',
] as const;

function ymdPartes(ymd: string): { y: number; m: number; d: number } | null {
  const t = ymd?.trim() ?? '';
  if (!/^\d{4}-\d{2}-\d{2}$/.test(t)) return null;
  const [y, m, d] = t.split('-').map((x) => parseInt(x, 10));
  if (!Number.isFinite(y) || !Number.isFinite(m) || !Number.isFinite(d)) {
    return null;
  }
  return { y, m, d };
}

function toYmd(y: number, m1: number, d: number): string {
  return `${y}-${String(m1).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
}

/** Calendário estilo “enterprise” (mês, grelha, hoje) para o modal de agenda. */
@Component({
  selector: 'app-agenda-modal-calendar',
  standalone: true,
  imports: [CommonModule],
  templateUrl: './agenda-modal-calendar.component.html',
  styleUrl: './agenda-modal-calendar.component.scss',
})
export class AgendaModalCalendarComponent {
  /** Data selecionada (AAAA-MM-DD) para realce na grelha. */
  @Input() selectedYmd = '';

  @Input() set ymd(v: string | null | undefined) {
    const p = ymdPartes(String(v ?? ''));
    if (p) {
      this.viewYear = p.y;
      this.viewMonth1 = p.m;
    }
  }
  @Output() ymdPicked = new EventEmitter<string>();
  @Output() closeRequest = new EventEmitter<void>();

  viewYear = new Date().getFullYear();
  viewMonth1 = new Date().getMonth() + 1;

  protected readonly weekDays = DIAS_PT;

  get tituloMesAno(): string {
    return `${this.viewYear} ${MESES_CURTOS[this.viewMonth1 - 1] ?? ''}`;
  }

  get cells(): { ymd: string; inMonth: boolean; d: number }[] {
    const y = this.viewYear;
    const m1 = this.viewMonth1;
    const first = new Date(y, m1 - 1, 1);
    const startPad = first.getDay();
    const out: { ymd: string; inMonth: boolean; d: number }[] = [];
    let dayIndex = 1 - startPad;
    while (out.length < 42) {
      const dt = new Date(y, m1 - 1, dayIndex);
      const yy = dt.getFullYear();
      const mm = dt.getMonth() + 1;
      const dd = dt.getDate();
      const inMonth = mm === m1 && yy === y;
      out.push({
        ymd: toYmd(yy, mm, dd),
        inMonth,
        d: dd,
      });
      dayIndex++;
    }
    return out;
  }

  hojeYmd(): string {
    const n = new Date();
    return toYmd(n.getFullYear(), n.getMonth() + 1, n.getDate());
  }

  selecionadoYmd(ymd: string): boolean {
    return String(this.selectedYmd ?? '').trim() === ymd;
  }

  stepAno(delta: number): void {
    this.viewYear += delta;
  }

  stepMes(delta: number): void {
    let m = this.viewMonth1 + delta;
    let y = this.viewYear;
    if (m < 1) {
      m = 12;
      y -= 1;
    } else if (m > 12) {
      m = 1;
      y += 1;
    }
    this.viewMonth1 = m;
    this.viewYear = y;
  }

  escolher(ymd: string): void {
    this.ymdPicked.emit(ymd);
  }

  irHoje(): void {
    const n = new Date();
    this.viewYear = n.getFullYear();
    this.viewMonth1 = n.getMonth() + 1;
    this.ymdPicked.emit(this.hojeYmd());
  }

  fecharClickOutside(ev: Event): void {
    ev.stopPropagation();
  }
}
