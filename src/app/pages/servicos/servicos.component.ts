import { Component, inject, OnInit } from '@angular/core';
import { RouterLink } from '@angular/router';
import { DecimalPipe } from '@angular/common';
import { SheetsApiService } from '../../core/services/sheets-api.service';
import { Servico } from '../../core/models/api.models';

@Component({
  selector: 'app-servicos',
  standalone: true,
  imports: [RouterLink, DecimalPipe],
  templateUrl: './servicos.component.html',
  styleUrl: './servicos.component.scss',
})
export class ServicosComponent implements OnInit {
  private readonly api = inject(SheetsApiService);

  carregando = false;
  erro = '';
  itens: Servico[] = [];

  ngOnInit(): void {
    this.carregar();
  }

  carregar(): void {
    this.carregando = true;
    this.erro = '';
    this.api.listServicos().subscribe({
      next: (items) => {
        this.itens = items;
        this.carregando = false;
      },
      error: (e: Error) => {
        this.erro =
          e.message ||
          'Não foi possível carregar serviços. Tente novamente.';
        this.carregando = false;
      },
    });
  }

  rotuloServico(s: Servico): string {
    return String(s['Serviço'] ?? '').trim();
  }

  tipoServico(s: Servico): string {
    return String(s['Tipo'] ?? '').trim();
  }

  valorBaseNum(s: Servico): number | null {
    return this.num(s['Valor Base']);
  }

  private num(v: unknown): number | null {
    if (v == null || v === '') return null;
    const n = Number(v);
    return Number.isFinite(n) ? n : null;
  }
}
