import {
  Component,
  DestroyRef,
  effect,
  inject,
  input,
  output,
  signal,
} from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { FormsModule } from '@angular/forms';
import type {
  CategoriaFinanceiraItem,
  Cliente,
  FinFormaPagamentoOpcaoItem,
  ProfissionalListaItem,
} from '../../../../core/models/api.models';
import { SheetsApiService } from '../../../../core/services/sheets-api.service';
import {
  METODOS_NOME_FALLBACK,
  mapFormasParaNomes,
  taxaPorNomeForma,
} from '../../../../core/utils/fin-formas-pagamento.util';
import { calcularTaxaReais } from '../../../../core/utils/fin-taxa.util';
import type { FinTransacaoLinhaUi } from './fin-transacoes.mapper';

export interface FinTransacaoEditarSubmit {
  movimentacaoId: number;
  valor: number;
  categoria_id: number;
  metodo_pagamento: string;
  descricao?: string;
  data_mov?: string;
  pago_em?: string | null;
}

function ymdParaExibicao(ymd: string): string {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(ymd.trim().slice(0, 10));
  if (!m) return '';
  return `${m[3]}/${m[2]}/${m[1]}`;
}

function profissionalIdFromTitular(
  titular: string,
  profissionais: ProfissionalListaItem[],
): number | null {
  const nome = titular.trim().toLowerCase();
  if (!nome) return null;
  const hit = profissionais.find((p) => p.nome.trim().toLowerCase() === nome);
  return hit?.id ?? null;
}

@Component({
  selector: 'app-fin-transacao-editar-drawer',
  standalone: true,
  imports: [FormsModule],
  templateUrl: './fin-transacao-editar-drawer.component.html',
  styleUrl: './fin-transacao-editar-drawer.component.scss',
})
export class FinTransacaoEditarDrawerComponent {
  private readonly api = inject(SheetsApiService);
  private readonly destroyRef = inject(DestroyRef);

  readonly linha = input<FinTransacaoLinhaUi | null>(null);
  readonly aberto = input(false);
  readonly salvando = input(false);

  readonly fechar = output<void>();
  readonly salvar = output<FinTransacaoEditarSubmit>();

  readonly metodos = signal<string[]>([...METODOS_NOME_FALLBACK]);
  readonly formasOpcoes = signal<FinFormaPagamentoOpcaoItem[]>([]);
  readonly categorias = signal<CategoriaFinanceiraItem[]>([]);
  readonly clientes = signal<Cliente[]>([]);
  readonly profissionais = signal<ProfissionalListaItem[]>([]);
  readonly carregandoOpcoes = signal(false);
  readonly erroOpcoes = signal<string | null>(null);

  ajustarCompetencia = false;
  valorBrutoDigitos = '';
  taxasDigitos = '';
  valorDigitos = '';
  descricao = '';
  dataVencimentoYmd = '';
  dataBaixaYmd = '';
  metodoPagamento = '';
  categoriaId: number | null = null;
  clienteId = '';
  fornecedorId = '';
  profissionalId: number | null = null;
  erroForm = '';

  constructor() {
    effect(() => {
      if (!this.aberto()) return;
      const row = this.linha();
      if (!row) return;
      this.erroForm = '';
      this.ajustarCompetencia = false;
      const valorCentavos = String(Math.round(row.valorBruto * 100));
      this.valorBrutoDigitos = valorCentavos;
      this.valorDigitos = valorCentavos;
      const taxaReais = Math.max(0, row.valorBruto - row.valorLiquido);
      this.taxasDigitos = String(Math.round(taxaReais * 100));
      this.descricao = String(row.descricao ?? row.subtitulo ?? '').trim();
      this.dataVencimentoYmd = row.dataYmd;
      this.dataBaixaYmd = row.pagoEmYmd ?? (row.status === 'pago' ? row.dataYmd : '');
      this.metodoPagamento =
        row.formaPagamento !== '—' ? row.formaPagamento : '';
      this.categoriaId = row.categoriaId ?? null;
      this.clienteId = row.clienteId?.trim() ?? '';
      this.fornecedorId = '';
      this.profissionalId = null;
      this.carregarOpcoes(row);
    });
  }

  get titulo(): string {
    return this.linha()?.linhaReceita
      ? 'Editando recebimento'
      : 'Editando despesa';
  }

  get categoriasFiltradas(): CategoriaFinanceiraItem[] {
    const nat = this.linha()?.linhaReceita ? 'receita' : 'despesa';
    return this.categorias().filter((c) => c.natureza === nat);
  }

  rotuloData(ymd: string): string {
    const y = ymd.trim();
    return y ? ymdParaExibicao(y) : 'DD/MM/AAAA';
  }

  dataPlaceholder(ymd: string): boolean {
    return !ymd.trim();
  }

  rotuloMoeda(digitos: string): string {
    if (!digitos.trim()) return 'R$ 0,00';
    const v = (parseInt(digitos, 10) || 0) / 100;
    return new Intl.NumberFormat('pt-BR', {
      style: 'currency',
      currency: 'BRL',
    }).format(v);
  }

  valorBrutoReais(): number {
    return (parseInt(this.valorBrutoDigitos || '0', 10) || 0) / 100;
  }

  valorLiquidoReais(): number {
    const bruto = this.valorBrutoReais();
    const taxas = (parseInt(this.taxasDigitos || '0', 10) || 0) / 100;
    return Math.max(0, bruto - taxas);
  }

  valorDespesaReais(): number {
    return (parseInt(this.valorDigitos || '0', 10) || 0) / 100;
  }

  rotuloValorLiquido(): string {
    return new Intl.NumberFormat('pt-BR', {
      style: 'currency',
      currency: 'BRL',
    }).format(this.valorLiquidoReais());
  }

  onValorInput(ev: Event, qual: 'bruto' | 'taxas' | 'valor'): void {
    const el = ev.target as HTMLInputElement;
    const d = el.value.replace(/\D/g, '').slice(0, 15);
    if (qual === 'bruto') {
      this.valorBrutoDigitos = d;
      if (this.linha()?.linhaReceita) this.aplicarTaxasDoCadastro();
    } else if (qual === 'taxas') this.taxasDigitos = d;
    else this.valorDigitos = d;
  }

  onMetodoPagamentoAlterado(): void {
    if (this.linha()?.linhaReceita) this.aplicarTaxasDoCadastro();
  }

  private aplicarTaxasDoCadastro(): void {
    const nome = this.metodoPagamento.trim();
    if (!nome) return;
    const { pct, fixa } = taxaPorNomeForma(this.formasOpcoes(), nome);
    const bruto = this.valorBrutoReais();
    const taxa = calcularTaxaReais(bruto, pct, fixa);
    this.taxasDigitos = String(Math.round(taxa * 100));
  }

  abrirCalendarioData(ev: Event, input: HTMLInputElement): void {
    ev.preventDefault();
    ev.stopPropagation();
    try {
      input.showPicker?.();
    } catch {
      input.focus();
    }
  }

  onDataAlterada(ev: Event, qual: 'venc' | 'baixa'): void {
    const v = (ev.target as HTMLInputElement).value.trim().slice(0, 10);
    if (!/^\d{4}-\d{2}-\d{2}$/.test(v)) return;
    if (qual === 'venc') this.dataVencimentoYmd = v;
    else this.dataBaixaYmd = v;
  }

  private carregarOpcoes(row: FinTransacaoLinhaUi): void {
    this.carregandoOpcoes.set(true);
    this.erroOpcoes.set(null);
    this.api
      .listCategoriasFinanceiras()
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: (cats) => {
          this.categorias.set(cats);
          if (
            this.categoriaId == null ||
            !cats.some((c) => c.id === this.categoriaId)
          ) {
            const fil = this.categoriasFiltradas;
            this.categoriaId = fil[0]?.id ?? null;
          }
          this.carregandoOpcoes.set(false);
        },
        error: (e: Error) => {
          this.erroOpcoes.set(
            e.message || 'Não foi possível carregar categorias.',
          );
          this.carregandoOpcoes.set(false);
        },
      });

    this.api
      .listFinFormasPagamentoOpcoes()
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: (items) => {
          this.formasOpcoes.set(items);
          const nomes = mapFormasParaNomes(items);
          if (nomes.length) this.metodos.set(nomes);
        },
        error: () => {
          /* mantém fallback */
        },
      });

    this.api
      .listClientes()
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: (items) => this.clientes.set(items),
        error: () => this.clientes.set([]),
      });

    this.api
      .listProfissionais()
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: (items) => {
          this.profissionais.set(items);
          if (!row.linhaReceita) {
            this.profissionalId = profissionalIdFromTitular(row.titular, items);
          }
        },
        error: () => this.profissionais.set([]),
      });
  }

  submit(): void {
    const row = this.linha();
    const movId = row?.movimentacaoId;
    if (!row || movId == null || movId <= 0) return;

    if (this.categoriaId == null) {
      this.erroForm = 'Escolha uma categoria.';
      return;
    }
    const metodo = this.metodoPagamento.trim();
    if (!metodo) {
      this.erroForm = 'Selecione a forma de pagamento.';
      return;
    }
    if (!this.dataVencimentoYmd.trim()) {
      this.erroForm = 'Informe a data de vencimento.';
      return;
    }

    const v = row.linhaReceita ? this.valorBrutoReais() : this.valorDespesaReais();
    if (v <= 0) {
      this.erroForm = 'Informe um valor maior que zero.';
      return;
    }

    const dataMov = this.ajustarCompetencia
      ? this.dataBaixaYmd || this.dataVencimentoYmd
      : this.dataVencimentoYmd;
    const pagoEm = this.dataBaixaYmd.trim() || null;

    this.erroForm = '';
    this.salvar.emit({
      movimentacaoId: movId,
      valor: v,
      categoria_id: this.categoriaId,
      metodo_pagamento: metodo,
      descricao: this.descricao.trim() || undefined,
      data_mov: dataMov,
      pago_em: pagoEm,
    });
  }
}
