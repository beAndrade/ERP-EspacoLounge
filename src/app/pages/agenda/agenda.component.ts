import { Component, inject, LOCALE_ID, OnInit } from '@angular/core';
import { RouterLink } from '@angular/router';
import { DecimalPipe, registerLocaleData } from '@angular/common';
import localePt from '@angular/common/locales/pt';
import { FormsModule } from '@angular/forms';
import { SheetsApiService } from '../../core/services/sheets-api.service';
import { AtendimentoListaItem } from '../../core/models/api.models';

registerLocaleData(localePt);

@Component({
  selector: 'app-agenda',
  standalone: true,
  imports: [RouterLink, FormsModule, DecimalPipe],
  providers: [{ provide: LOCALE_ID, useValue: 'pt-BR' }],
  templateUrl: './agenda.component.html',
  styleUrl: './agenda.component.scss',
})
export class AgendaComponent implements OnInit {
  private readonly api = inject(SheetsApiService);

  dataInicio = '';
  dataFim = '';
  carregando = false;
  erro = '';
  itens: AtendimentoListaItem[] = [];

  ngOnInit(): void {
    const hoje = new Date();
    const inicio = new Date(hoje);
    inicio.setDate(hoje.getDate() - 90);
    this.dataInicio = this.toDdMmYyyy(inicio);
    this.dataFim = this.toDdMmYyyy(hoje);
    this.carregar();
  }

  carregar(): void {
    this.carregando = true;
    this.erro = '';
    const di = this.parseFiltroData(this.dataInicio);
    const df = this.parseFiltroData(this.dataFim);
    if (!di || !df) {
      this.carregando = false;
      this.erro =
        'Use o formato dia-mês-ano nas duas datas (ex.: 09-04-2026). Também aceita barras: 09/04/2026.';
      return;
    }
    if (di > df) {
      this.carregando = false;
      this.erro = 'A data “De” não pode ser depois da data “Até”.';
      return;
    }
    this.api
      .listAgendamentos(di, df)
      .subscribe({
        next: (items) => {
          this.itens = items.slice().sort((a, b) => {
            const c = a.data.localeCompare(b.data);
            return c !== 0 ? c : a.nomeCliente.localeCompare(b.nomeCliente);
          });
          this.carregando = false;
        },
        error: (e: Error) => {
          this.erro =
            e.message ||
            'Não foi possível carregar a agenda. Tente novamente.';
          this.carregando = false;
        },
      });
  }

  /** Mostra data no formato dia-mês-ano (ex.: 09-04-2026). */
  dataDdMmAaaa(ymd: string): string {
    const s = (ymd || '').trim();
    const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(s);
    if (!m) return s || '—';
    return `${m[3]}-${m[2]}-${m[1]}`;
  }

  /**
   * Aceita número, texto da planilha (R$, 1.234,56, vírgula decimal) e alguns formatos estranhos do Excel.
   */
  valorNum(v: unknown): number | null {
    if (v == null || v === '') return null;
    if (typeof v === 'number') return Number.isFinite(v) ? v : null;
    if (typeof v === 'boolean') return null;

    let t = String(v).trim();
    if (!t || t === '—' || t === '-') return null;
    if (/^#(REF|N\/A|VALUE|DIV)!?$/i.test(t)) return null;

    t = t.replace(/\u00a0/g, ' ').replace(/\s+/g, ' ').trim();
    t = t
      .replace(/R\$\s*/gi, '')
      .replace(/\s*BRL\s*/gi, '')
      .replace(/[$€£]/g, '')
      .replace(/\s/g, '');

    const lastComma = t.lastIndexOf(',');
    const lastDot = t.lastIndexOf('.');
    if (lastComma >= 0 && lastComma > lastDot) {
      const intPart = t.slice(0, lastComma).replace(/\./g, '');
      const decPart = t.slice(lastComma + 1).replace(/[^\d]/g, '');
      t = decPart.length > 0 ? `${intPart}.${decPart}` : intPart;
    } else if (lastDot >= 0 && lastDot > lastComma) {
      const parts = t.split('.');
      if (parts.length > 2) {
        const dec = parts.pop() ?? '';
        t = `${parts.join('')}.${dec.replace(/[^\d]/g, '')}`;
      }
    }

    const n = parseFloat(t.replace(/[^\d.-]/g, ''));
    return Number.isFinite(n) ? n : null;
  }

  /** Exibição e filtros: dd-mm-aaaa */
  private toDdMmYyyy(d: Date): string {
    const day = String(d.getDate()).padStart(2, '0');
    const m = String(d.getMonth() + 1).padStart(2, '0');
    const y = d.getFullYear();
    return `${day}-${m}-${y}`;
  }

  /** dd-mm-aaaa ou dd/mm/aaaa → AAAA-MM-DD para a API */
  private parseFiltroData(s: string): string | null {
    const t = s.trim();
    const m = /^(\d{1,2})[\/\-](\d{1,2})[\/\-](\d{4})$/.exec(t);
    if (!m) return null;
    const day = parseInt(m[1], 10);
    const month = parseInt(m[2], 10);
    const year = parseInt(m[3], 10);
    if (month < 1 || month > 12 || day < 1 || day > 31) return null;
    const d = new Date(year, month - 1, day);
    if (
      d.getFullYear() !== year ||
      d.getMonth() !== month - 1 ||
      d.getDate() !== day
    ) {
      return null;
    }
    return `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
  }
}
