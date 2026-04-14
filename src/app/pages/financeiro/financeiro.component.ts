import {
  CurrencyPipe,
  DatePipe,
  registerLocaleData,
} from '@angular/common';
import { Component, inject, LOCALE_ID, OnInit } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { RouterLink } from '@angular/router';
import localePt from '@angular/common/locales/pt';
import { forkJoin } from 'rxjs';
import { CaixaDiaResumo, MovimentacaoListaItem } from '../../core/models/api.models';
import { SheetsApiService } from '../../core/services/sheets-api.service';

registerLocaleData(localePt);

function hojeYmd(): string {
  const d = new Date();
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

@Component({
  selector: 'app-financeiro',
  standalone: true,
  imports: [RouterLink, FormsModule, CurrencyPipe, DatePipe],
  providers: [{ provide: LOCALE_ID, useValue: 'pt-BR' }],
  templateUrl: './financeiro.component.html',
  styleUrl: './financeiro.component.scss',
})
export class FinanceiroComponent implements OnInit {
  private readonly api = inject(SheetsApiService);

  dataYmd = hojeYmd();
  carregando = false;
  erro = '';

  private nomeCategoria = new Map<number, string>();

  caixa: CaixaDiaResumo | null = null;
  movimentacoes: MovimentacaoListaItem[] = [];

  ngOnInit(): void {
    this.carregar();
  }

  carregar(): void {
    const d = String(this.dataYmd || '').trim().slice(0, 10);
    if (!/^\d{4}-\d{2}-\d{2}$/.test(d)) {
      this.erro = 'Use uma data válida (aaaa-mm-dd).';
      return;
    }
    this.dataYmd = d;
    this.carregando = true;
    this.erro = '';
    forkJoin({
      categorias: this.api.listCategoriasFinanceiras(),
      caixa: this.api.getCaixaDia(d),
      movs: this.api.listMovimentacoes({ dataInicio: d, dataFim: d }),
    }).subscribe({
      next: ({ categorias, caixa, movs }) => {
        this.nomeCategoria.clear();
        for (const c of categorias) {
          this.nomeCategoria.set(c.id, c.nome);
        }
        this.caixa = caixa;
        this.movimentacoes = movs;
        this.carregando = false;
      },
      error: (e: Error) => {
        this.erro =
          e.message ||
          'Não foi possível carregar o financeiro. Confirme a API e a migração das tabelas.';
        this.carregando = false;
        this.caixa = null;
        this.movimentacoes = [];
      },
    });
  }

  valorNum(s: string): number {
    const n = parseFloat(String(s).replace(',', '.'));
    return Number.isFinite(n) ? n : 0;
  }

  categoriaNome(id: number): string {
    return this.nomeCategoria.get(id) ?? `Id ${id}`;
  }

  rotuloOrigem(origem: string): string {
    const o = String(origem || '').trim();
    if (o === 'atendimento_confirmacao') return 'Confirmação atendimento';
    if (o === 'manual') return 'Manual';
    return o || '—';
  }
}
