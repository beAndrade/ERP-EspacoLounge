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
import {
  CaixaDiaResumo,
  CategoriaFinanceiraItem,
  MovimentacaoListaItem,
} from '../../core/models/api.models';
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
  categorias: CategoriaFinanceiraItem[] = [];
  despesaCategorias: CategoriaFinanceiraItem[] = [];

  caixa: CaixaDiaResumo | null = null;
  movimentacoes: MovimentacaoListaItem[] = [];

  despesaCategoriaId: number | null = null;
  despesaValor = '';
  despesaMetodo = '';
  despesaDescricao = '';
  despesaTipo = '';
  despesaCategoriaLivre = '';
  salvandoDespesa = false;
  despesaFormErro = '';

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
        this.categorias = categorias;
        this.despesaCategorias = categorias.filter(
          (c) => c.natureza === 'despesa',
        );
        this.nomeCategoria.clear();
        for (const c of categorias) {
          this.nomeCategoria.set(c.id, c.nome);
        }
        if (
          this.despesaCategoriaId == null ||
          !this.despesaCategorias.some((c) => c.id === this.despesaCategoriaId)
        ) {
          this.despesaCategoriaId = this.despesaCategorias[0]?.id ?? null;
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
    if (o === 'despesa_cadastro') return 'Despesa (cadastro)';
    return o || '—';
  }

  detalheDespesa(m: MovimentacaoListaItem): string {
    const partes: string[] = [];
    const t = String(m.despesa_tipo ?? '').trim();
    const cl = String(m.despesa_categoria_livre ?? '').trim();
    if (t) partes.push(t);
    if (cl) partes.push(cl);
    return partes.length ? partes.join(' · ') : '—';
  }

  cadastrarDespesa(): void {
    const d = String(this.dataYmd || '').trim().slice(0, 10);
    if (!/^\d{4}-\d{2}-\d{2}$/.test(d)) {
      this.despesaFormErro = 'Defina uma data válida acima.';
      return;
    }
    if (this.despesaCategoriaId == null) {
      this.despesaFormErro = 'Escolha uma categoria de despesa.';
      return;
    }
    const v = parseFloat(String(this.despesaValor).replace(',', '.'));
    if (!Number.isFinite(v) || v <= 0) {
      this.despesaFormErro = 'Informe um valor maior que zero.';
      return;
    }
    this.despesaFormErro = '';
    this.salvandoDespesa = true;
    this.api
      .createDespesa({
        data_mov: d,
        valor: v,
        categoria_id: this.despesaCategoriaId,
        descricao: this.despesaDescricao.trim() || undefined,
        metodo_pagamento: this.despesaMetodo.trim() || undefined,
        tipo: this.despesaTipo.trim() || undefined,
        categoria_livre: this.despesaCategoriaLivre.trim() || undefined,
      })
      .subscribe({
        next: () => {
          this.despesaValor = '';
          this.despesaDescricao = '';
          this.despesaMetodo = '';
          this.despesaTipo = '';
          this.despesaCategoriaLivre = '';
          this.salvandoDespesa = false;
          this.carregar();
        },
        error: (e: Error) => {
          this.despesaFormErro =
            e.message || 'Não foi possível registar a despesa.';
          this.salvandoDespesa = false;
        },
      });
  }
}
