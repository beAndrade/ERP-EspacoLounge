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
    this.dataInicio = this.toYmd(inicio);
    this.dataFim = this.toYmd(hoje);
    this.carregar();
  }

  carregar(): void {
    this.carregando = true;
    this.erro = '';
    this.api
      .listAgendamentos(this.dataInicio || undefined, this.dataFim || undefined)
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

  valorNum(v: unknown): number | null {
    if (v == null || v === '') return null;
    if (typeof v === 'number') return Number.isFinite(v) ? v : null;
    let t = String(v).trim().replace(/\s/g, '');
    if (t.includes(',') && /\d,\d{2}$/.test(t)) {
      t = t.replace(/\./g, '').replace(',', '.');
    }
    const n = Number(t);
    return Number.isFinite(n) ? n : null;
  }

  private toYmd(d: Date): string {
    const y = d.getFullYear();
    const m = String(d.getMonth() + 1).padStart(2, '0');
    const day = String(d.getDate()).padStart(2, '0');
    return `${y}-${m}-${day}`;
  }
}
