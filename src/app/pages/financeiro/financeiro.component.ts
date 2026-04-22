import {
  CurrencyPipe,
  DatePipe,
  registerLocaleData,
} from '@angular/common';
import {
  Component,
  DestroyRef,
  inject,
  LOCALE_ID,
  OnInit,
} from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { FormsModule } from '@angular/forms';
import localePt from '@angular/common/locales/pt';
import { forkJoin } from 'rxjs';
import {
  CaixaDiaResumo,
  CategoriaFinanceiraItem,
  MovimentacaoListaItem,
} from '../../core/models/api.models';
import { SheetsApiService } from '../../core/services/sheets-api.service';
import { FinanceiroResumoUiService } from '../financeiro-shell/financeiro-resumo-ui.service';

registerLocaleData(localePt);

/** Métodos gravados em `movimentacoes.metodo_pagamento` (consistente com o resto do app). */
const METODOS_PAGAMENTO_DESPESA = [
  'Débito',
  'Crédito',
  'Dinheiro',
  'Pix',
] as const;

/** Edição de movimentações (receita ou despesa). */
const METODOS_PAGAMENTO_EDICAO = METODOS_PAGAMENTO_DESPESA;

interface MovimentacaoRascunho {
  categoria_id: number;
  valorStr: string;
  metodo: string;
  descricao: string;
}

@Component({
  selector: 'app-financeiro',
  standalone: true,
  imports: [FormsModule, CurrencyPipe, DatePipe],
  providers: [{ provide: LOCALE_ID, useValue: 'pt-BR' }],
  templateUrl: './financeiro.component.html',
  styleUrl: './financeiro.component.scss',
})
export class FinanceiroComponent implements OnInit {
  private readonly api = inject(SheetsApiService);
  private readonly resumoUi = inject(FinanceiroResumoUiService);
  private readonly destroyRef = inject(DestroyRef);

  carregando = false;
  erro = '';

  private nomeCategoria = new Map<number, string>();
  despesaCategorias: CategoriaFinanceiraItem[] = [];

  caixa: CaixaDiaResumo | null = null;
  movimentacoes: MovimentacaoListaItem[] = [];

  editandoMovimentacoes = false;
  private rascunhoMovPorId = new Map<number, MovimentacaoRascunho>();
  salvandoMovId: number | null = null;
  excluindoMovId: number | null = null;
  editarMovErro = '';

  despesaCategoriaId: number | null = null;
  /** Apenas dígitos; valor em reais = int/100 (entrada ordem caixa/POS). */
  despesaValorDigitos = '';
  despesaMetodo = '';
  despesaDescricao = '';
  despesaTipo = '';
  despesaCategoriaLivre = '';
  salvandoDespesa = false;
  despesaFormErro = '';

  ngOnInit(): void {
    this.resumoUi.solicitacaoAtualizacao$
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe(() => this.carregar());
    this.carregar();
  }

  carregar(): void {
    const d = String(this.resumoUi.dataYmd || '').trim().slice(0, 10);
    if (!/^\d{4}-\d{2}-\d{2}$/.test(d)) {
      this.erro = 'Use uma data válida (aaaa-mm-dd).';
      return;
    }
    this.resumoUi.dataYmd = d;
    this.carregando = true;
    this.erro = '';
    forkJoin({
      categorias: this.api.listCategoriasFinanceiras(),
      caixa: this.api.getCaixaDia(d),
      movs: this.api.listMovimentacoes({ dataInicio: d, dataFim: d }),
    }).subscribe({
      next: ({ categorias, caixa, movs }) => {
        this.resumoUi.categorias = categorias;
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
        if (this.editandoMovimentacoes) {
          this.repovoarRascunhosMovimentacoes();
        }
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

  /** Ex.: `20260420-…712e6` — ID completo no `title` ao passar o rato. */
  rotuloIdAtendimento(id: string | null | undefined): string {
    const t = String(id ?? '').trim();
    if (!t) return '—';
    if (t.length <= 22) return t;
    return `${t.slice(0, 9)}…${t.slice(-8)}`;
  }

  readonly metodosPagamentoDespesa = METODOS_PAGAMENTO_DESPESA;
  readonly metodosPagamentoEdicao = METODOS_PAGAMENTO_EDICAO;

  formatBrlFromDigitos(digits: string): string {
    if (!digits?.trim()) return '';
    const v = (parseInt(digits, 10) || 0) / 100;
    return new Intl.NumberFormat('pt-BR', {
      style: 'currency',
      currency: 'BRL',
    }).format(v);
  }

  onDespesaValorInput(ev: Event): void {
    const el = ev.target as HTMLInputElement;
    const digits = el.value.replace(/\D/g, '').slice(0, 15);
    this.despesaValorDigitos = digits;
  }

  private despesaValorReais(): number {
    return (parseInt(this.despesaValorDigitos || '0', 10) || 0) / 100;
  }

  /** Linhas da tabela respeitam o filtro de categoria. */
  get movimentacoesTabela(): MovimentacaoListaItem[] {
    const f = this.resumoUi.filtroCategoriaMovimentos;
    if (f == null) return this.movimentacoes;
    return this.movimentacoes.filter((m) => m.categoria_id === f);
  }

  agregadosPorNatureza(
    natureza: 'receita' | 'despesa',
  ): { nome: string; valor: number }[] {
    const map = new Map<number, number>();
    for (const m of this.movimentacoes) {
      if (m.natureza !== natureza) continue;
      const id = m.categoria_id;
      map.set(id, (map.get(id) ?? 0) + this.valorNum(m.valor));
    }
    return Array.from(map.entries())
      .map(([id, valor]) => ({ nome: this.categoriaNome(id), valor }))
      .filter((x) => x.valor > 0)
      .sort((a, b) => b.valor - a.valor);
  }

  maxValorLista(rows: { valor: number }[]): number {
    const m = Math.max(0, ...rows.map((r) => r.valor));
    return m > 0 ? m : 1;
  }

  pctBarra(valor: number, max: number): number {
    if (max <= 0) return 0;
    return Math.min(100, (valor / max) * 100);
  }

  get comparativoReceitaDespesa(): {
    receitas: number;
    despesas: number;
    pctReceita: number;
    pctDespesa: number;
  } {
    const r = this.caixa ? this.valorNum(this.caixa.total_receitas) : 0;
    const d = this.caixa ? this.valorNum(this.caixa.total_despesas) : 0;
    const max = Math.max(r, d, 1);
    return {
      receitas: r,
      despesas: d,
      pctReceita: (r / max) * 100,
      pctDespesa: (d / max) * 100,
    };
  }

  get receitasPorMetodoBarras(): { metodo: string; valor: number; pct: number }[] {
    const rows = this.caixa?.receitas_por_metodo ?? [];
    const parsed = rows.map((x) => ({
      metodo: x.metodo,
      valor: this.valorNum(x.total),
    }));
    const max = this.maxValorLista(parsed);
    return parsed.map((row) => ({
      ...row,
      pct: this.pctBarra(row.valor, max),
    }));
  }

  get agregadosReceitaCategoriaRows(): { nome: string; valor: number }[] {
    return this.agregadosPorNatureza('receita');
  }

  get agregadosDespesaCategoriaRows(): { nome: string; valor: number }[] {
    return this.agregadosPorNatureza('despesa');
  }

  detalheDespesa(m: MovimentacaoListaItem): string {
    const partes: string[] = [];
    const t = String(m.despesa_tipo ?? '').trim();
    const cl = String(m.despesa_categoria_livre ?? '').trim();
    if (t) partes.push(t);
    if (cl) partes.push(cl);
    return partes.length ? partes.join(' · ') : '—';
  }

  categoriasPorNatureza(natureza: 'receita' | 'despesa'): CategoriaFinanceiraItem[] {
    return this.resumoUi.categorias.filter((c) => c.natureza === natureza);
  }

  private novoRascunhoDeM(m: MovimentacaoListaItem): MovimentacaoRascunho {
    return {
      categoria_id: m.categoria_id,
      valorStr: this.valorNum(m.valor).toFixed(2),
      metodo: m.metodo_pagamento ?? '',
      descricao: m.descricao ?? '',
    };
  }

  private repovoarRascunhosMovimentacoes(): void {
    this.rascunhoMovPorId.clear();
    for (const m of this.movimentacoes) {
      this.rascunhoMovPorId.set(m.id, this.novoRascunhoDeM(m));
    }
  }

  rascunhoDe(m: MovimentacaoListaItem): MovimentacaoRascunho {
    let r = this.rascunhoMovPorId.get(m.id);
    if (!r) {
      r = this.novoRascunhoDeM(m);
      this.rascunhoMovPorId.set(m.id, r);
    }
    return r;
  }

  toggleEdicaoMovimentacoes(): void {
    this.editandoMovimentacoes = !this.editandoMovimentacoes;
    this.editarMovErro = '';
    if (this.editandoMovimentacoes) {
      this.repovoarRascunhosMovimentacoes();
    } else {
      this.rascunhoMovPorId.clear();
    }
  }

  reporRascunhoMovimentacao(m: MovimentacaoListaItem): void {
    this.rascunhoMovPorId.set(m.id, this.novoRascunhoDeM(m));
    this.editarMovErro = '';
  }

  guardarMovimentacao(m: MovimentacaoListaItem): void {
    const r = this.rascunhoDe(m);
    const valor = this.valorNum(r.valorStr);
    if (!Number.isFinite(valor) || valor === 0) {
      this.editarMovErro = 'Informe um valor válido (diferente de zero).';
      return;
    }
    const metodoTrim = r.metodo.trim();
    this.editarMovErro = '';
    this.salvandoMovId = m.id;
    this.api
      .patchMovimentacao(m.id, {
        valor,
        categoria_id: r.categoria_id,
        descricao: r.descricao.trim() || null,
        metodo_pagamento: metodoTrim ? metodoTrim : null,
      })
      .subscribe({
        next: () => {
          this.salvandoMovId = null;
          this.carregar();
        },
        error: (e: Error) => {
          this.editarMovErro =
            e.message || 'Não foi possível guardar a movimentação.';
          this.salvandoMovId = null;
        },
      });
  }

  excluirMovimentacao(m: MovimentacaoListaItem): void {
    if (
      !confirm(
        'Eliminar esta movimentação? Esta ação não pode ser desfeita pelo app.',
      )
    ) {
      return;
    }
    this.editarMovErro = '';
    this.excluindoMovId = m.id;
    this.api.deleteMovimentacao(m.id).subscribe({
      next: () => {
        this.excluindoMovId = null;
        this.carregar();
      },
      error: (e: Error) => {
        this.editarMovErro =
          e.message || 'Não foi possível eliminar a movimentação.';
        this.excluindoMovId = null;
      },
    });
  }

  cadastrarDespesa(): void {
    const d = String(this.resumoUi.dataYmd || '').trim().slice(0, 10);
    if (!/^\d{4}-\d{2}-\d{2}$/.test(d)) {
      this.despesaFormErro = 'Defina uma data válida acima.';
      return;
    }
    if (this.despesaCategoriaId == null) {
      this.despesaFormErro = 'Escolha uma categoria de despesa.';
      return;
    }
    const metodo = String(this.despesaMetodo ?? '').trim();
    if (!metodo) {
      this.despesaFormErro = 'Selecione o método de pagamento.';
      return;
    }
    const v = this.despesaValorReais();
    if (v <= 0) {
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
        metodo_pagamento: metodo,
        tipo: this.despesaTipo.trim() || undefined,
        categoria_livre: this.despesaCategoriaLivre.trim() || undefined,
      })
      .subscribe({
        next: () => {
          this.despesaValorDigitos = '';
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
