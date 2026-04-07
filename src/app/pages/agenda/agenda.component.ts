import { Component, inject, OnInit } from '@angular/core';
import { RouterLink } from '@angular/router';
import { DecimalPipe } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { SheetsApiService } from '../../core/services/sheets-api.service';
import { AtendimentoListaItem } from '../../core/models/api.models';

@Component({
  selector: 'app-agenda',
  standalone: true,
  imports: [RouterLink, FormsModule, DecimalPipe],
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
    this.dataInicio = this.toYmd(hoje);
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

  valorNum(v: unknown): number | null {
    if (v == null || v === '') return null;
    const n = Number(v);
    return Number.isFinite(n) ? n : null;
  }

  private toYmd(d: Date): string {
    const y = d.getFullYear();
    const m = String(d.getMonth() + 1).padStart(2, '0');
    const day = String(d.getDate()).padStart(2, '0');
    return `${y}-${m}-${day}`;
  }
}
