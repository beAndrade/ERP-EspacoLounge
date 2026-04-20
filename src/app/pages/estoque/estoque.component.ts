import { CurrencyPipe, DecimalPipe } from '@angular/common';
import { Component, inject, LOCALE_ID, OnInit } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { ProdutoCatalogoItem } from '../../core/models/api.models';
import { SheetsApiService } from '../../core/services/sheets-api.service';

@Component({
  selector: 'app-estoque',
  standalone: true,
  imports: [FormsModule, CurrencyPipe, DecimalPipe],
  providers: [{ provide: LOCALE_ID, useValue: 'pt-BR' }],
  templateUrl: './estoque.component.html',
  styleUrl: './estoque.component.scss',
})
export class EstoqueComponent implements OnInit {
  private readonly api = inject(SheetsApiService);

  carregando = false;
  erro = '';
  itens: ProdutoCatalogoItem[] = [];

  editandoEstoque = false;
  /** Rascunho por `id`: quantidade inteira a somar ao estoque. */
  entradaPorId: Record<number, string> = {};
  aplicandoId: number | null = null;
  erroEntrada = '';

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

  toggleEdicaoEstoque(): void {
    this.editandoEstoque = !this.editandoEstoque;
    this.erroEntrada = '';
    if (!this.editandoEstoque) {
      this.entradaPorId = {};
    }
  }

  aplicarEntrada(p: ProdutoCatalogoItem): void {
    const raw = String(this.entradaPorId[p.id] ?? '').trim();
    const n = parseInt(raw, 10);
    if (!Number.isFinite(n) || n <= 0) {
      this.erroEntrada = 'Indique um número inteiro maior que zero.';
      return;
    }
    this.erroEntrada = '';
    this.aplicandoId = p.id;
    this.api.incrementarEstoqueProduto(p.id, n).subscribe({
      next: (item) => {
        const row = this.itens.find((x) => x.id === p.id);
        if (row) {
          row.estoque = item.estoque;
        }
        this.entradaPorId[p.id] = '';
        this.aplicandoId = null;
      },
      error: (e: Error) => {
        this.aplicandoId = null;
        this.erroEntrada =
          e.message || 'Não foi possível atualizar o estoque.';
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

  /** Unidades em stock (texto da BD). */
  estoqueUnidades(p: ProdutoCatalogoItem): number {
    const v = p.estoque;
    if (v == null || v === '') return 0;
    if (typeof v === 'number' && Number.isFinite(v)) return v;
    let t = String(v)
      .replace(/\s/g, '')
      .trim();
    if (!t) return 0;
    if (t.includes(',')) {
      t = t.replace(/\./g, '').replace(',', '.');
    }
    const n = parseFloat(t.replace(/[^\d.-]/g, ''));
    return Number.isFinite(n) ? n : 0;
  }
}
