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
} from '../../../../core/models/api.models';
import { SheetsApiService } from '../../../../core/services/sheets-api.service';
import {
  contaFromMetodo,
  type FinTransacaoLinhaUi,
} from './fin-transacoes.mapper';

export interface FinTransacaoEditarSubmit {
  movimentacaoId: number;
  valor: number;
  categoria_id: number;
  metodo_pagamento: string;
  descricao?: string;
}

const METODOS = ['Débito', 'Crédito', 'Dinheiro', 'Pix', 'Transferência'] as const;

function ymdParaExibicao(ymd: string): string {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(ymd.trim().slice(0, 10));
  if (!m) return '';
  return `${m[3]}/${m[2]}/${m[1]}`;
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

  readonly metodos = METODOS;
  readonly categorias = signal<CategoriaFinanceiraItem[]>([]);
  readonly clientes = signal<Cliente[]>([]);
  readonly carregandoOpcoes = signal(false);
  readonly erroOpcoes = signal<string | null>(null);

  receitaOrganizacional = false;
  ajustarCompetencia = false;
  valorBrutoDigitos = '';
  taxasDigitos = '';
  descricao = '';
  dataVencimentoYmd = '';
  dataBaixaYmd = '';
  metodoPagamento = '';
  conta: 'Caixa' | 'Banco' = 'Caixa';
  categoriaId: number | null = null;
  clienteId = '';
  erroForm = '';

  constructor() {
    effect(() => {
      if (!this.aberto()) return;
      const row = this.linha();
      if (!row) return;
      this.erroForm = '';
      this.receitaOrganizacional = false;
      this.ajustarCompetencia = false;
      this.valorBrutoDigitos = String(Math.round(row.valorBruto * 100));
      this.taxasDigitos = '0';
      this.descricao = String(row.descricao ?? row.subtitulo ?? '').trim();
      this.dataVencimentoYmd = row.dataYmd;
      this.dataBaixaYmd = row.dataYmd;
      this.metodoPagamento =
        row.formaPagamento !== '—' ? row.formaPagamento : '';
      this.conta = row.conta;
      this.categoriaId = row.categoriaId ?? null;
      this.clienteId = row.clienteId?.trim() ?? '';
      this.carregarOpcoes();
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

  valorLiquidoReais(): number {
    const bruto = (parseInt(this.valorBrutoDigitos || '0', 10) || 0) / 100;
    const taxas = (parseInt(this.taxasDigitos || '0', 10) || 0) / 100;
    return Math.max(0, bruto - taxas);
  }

  rotuloValorLiquido(): string {
    return new Intl.NumberFormat('pt-BR', {
      style: 'currency',
      currency: 'BRL',
    }).format(this.valorLiquidoReais());
  }

  onMetodoChange(): void {
    this.conta = contaFromMetodo(this.metodoPagamento);
  }

  onValorInput(ev: Event, qual: 'bruto' | 'taxas'): void {
    const el = ev.target as HTMLInputElement;
    const d = el.value.replace(/\D/g, '').slice(0, 15);
    if (qual === 'bruto') this.valorBrutoDigitos = d;
    else this.taxasDigitos = d;
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

  private carregarOpcoes(): void {
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
      .listClientes()
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: (items) => this.clientes.set(items),
        error: () => this.clientes.set([]),
      });
  }

  submit(): void {
    const row = this.linha();
    const movId = row?.movimentacaoId;
    if (movId == null || movId <= 0) return;

    if (this.categoriaId == null) {
      this.erroForm = 'Escolha uma categoria.';
      return;
    }
    const metodo = this.metodoPagamento.trim();
    if (!metodo) {
      this.erroForm = 'Selecione a forma de pagamento.';
      return;
    }
    const v = this.valorLiquidoReais();
    if (v <= 0) {
      this.erroForm = 'Informe um valor líquido maior que zero.';
      return;
    }

    this.erroForm = '';
    this.salvar.emit({
      movimentacaoId: movId,
      valor: v,
      categoria_id: this.categoriaId,
      metodo_pagamento: metodo,
      descricao: this.descricao.trim() || undefined,
    });
  }
}
