import { DecimalPipe } from '@angular/common';
import { Component, inject, OnInit } from '@angular/core';
import { RouterLink } from '@angular/router';
import { ProdutoCatalogoItem } from '../../core/models/api.models';
import { SheetsApiService } from '../../core/services/sheets-api.service';

@Component({
  selector: 'app-estoque',
  standalone: true,
  imports: [RouterLink, DecimalPipe],
  templateUrl: './estoque.component.html',
  styleUrl: './estoque.component.scss',
})
export class EstoqueComponent implements OnInit {
  private readonly api = inject(SheetsApiService);

  carregando = false;
  erro = '';
  itens: ProdutoCatalogoItem[] = [];

  ngOnInit(): void {
    this.carregar();
  }

  carregar(): void {
    this.carregando = true;
    this.erro = '';
    this.api.listProdutos().subscribe({
      next: (items) => {
        this.itens = items;
        this.carregando = false;
      },
      error: (e: Error) => {
        this.erro =
          e.message ||
          'Não foi possível carregar o catálogo de produtos. Tente novamente.';
        this.carregando = false;
      },
    });
  }

  precoNum(p: ProdutoCatalogoItem): number | null {
    const v = p.preco;
    if (v == null || v === '') return null;
    if (typeof v === 'number' && Number.isFinite(v)) return v;
    let t = String(v)
      .replace(/R\$/gi, '')
      .replace(/\u00a0/g, ' ')
      .replace(/\s/g, '')
      .trim();
    if (!t) return null;
    if (t.includes(',')) {
      t = t.replace(/\./g, '').replace(',', '.');
    }
    const n = parseFloat(t.replace(/[^\d.-]/g, ''));
    return Number.isFinite(n) ? n : null;
  }

  estoqueRotulo(p: ProdutoCatalogoItem): string {
    const e = p.estoque;
    if (e == null || e === '') return '—';
    return String(e).trim();
  }
}
