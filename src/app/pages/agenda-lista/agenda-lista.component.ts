import { Component, inject, LOCALE_ID, OnInit } from '@angular/core';
import { RouterLink } from '@angular/router';
import { DecimalPipe, registerLocaleData } from '@angular/common';
import localePt from '@angular/common/locales/pt';
import { FormsModule } from '@angular/forms';
import { SheetsApiService } from '../../core/services/sheets-api.service';
import { AtendimentoListaItem } from '../../core/models/api.models';
import {
  dataDdMmAaaa,
  parseFiltroDataDdMm,
  toDdMmYyyy,
  valorMonetarioParaNumero,
} from '../../core/utils/atendimento-display';

registerLocaleData(localePt);

@Component({
  selector: 'app-agenda-lista',
  standalone: true,
  imports: [RouterLink, FormsModule, DecimalPipe],
  providers: [{ provide: LOCALE_ID, useValue: 'pt-BR' }],
  templateUrl: './agenda-lista.component.html',
  styleUrl: './agenda-lista.component.scss',
})
export class AgendaListaComponent implements OnInit {
  private readonly api = inject(SheetsApiService);

  readonly dataDdMmAaaa = dataDdMmAaaa;
  readonly valorNum = valorMonetarioParaNumero;

  dataInicio = '';
  dataFim = '';
  carregando = false;
  erro = '';
  itens: AtendimentoListaItem[] = [];

  ngOnInit(): void {
    const hoje = new Date();
    const inicio = new Date(hoje);
    inicio.setDate(hoje.getDate() - 90);
    this.dataInicio = toDdMmYyyy(inicio);
    this.dataFim = toDdMmYyyy(hoje);
    this.carregar();
  }

  carregar(): void {
    this.carregando = true;
    this.erro = '';
    const di = parseFiltroDataDdMm(this.dataInicio);
    const df = parseFiltroDataDdMm(this.dataFim);
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
    this.api.listAgendamentos(di, df).subscribe({
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
}
