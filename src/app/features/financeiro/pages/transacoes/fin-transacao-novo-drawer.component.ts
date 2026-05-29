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
  ProfissionalListaItem,
} from '../../../../core/models/api.models';
import { SheetsApiService } from '../../../../core/services/sheets-api.service';
import {
  METODOS_NOME_FALLBACK,
  mapFormasParaNomes,
} from '../../../../core/utils/fin-formas-pagamento.util';

export type FinTransacaoNovoTipo = 'receita' | 'despesa' | 'vale';

export interface FinTransacaoNovoSubmit {
  tipo: FinTransacaoNovoTipo;
  data_mov: string;
  valor: number;
  categoria_id: number;
  metodo_pagamento: string;
  descricao?: string;
  profissional_id?: number | null;
}

function ymdHoje(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

function ymdParaExibicao(ymd: string): string {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(ymd.trim().slice(0, 10));
  if (!m) return '';
  return `${m[3]}/${m[2]}/${m[1]}`;
}

@Component({
  selector: 'app-fin-transacao-novo-drawer',
  standalone: true,
  imports: [FormsModule],
  templateUrl: './fin-transacao-novo-drawer.component.html',
  styleUrl: './fin-transacao-editar-drawer.component.scss',
})
export class FinTransacaoNovoDrawerComponent {
  private readonly api = inject(SheetsApiService);
  private readonly destroyRef = inject(DestroyRef);

  readonly aberto = input(false);
  readonly tipo = input<FinTransacaoNovoTipo>('despesa');
  readonly salvando = input(false);

  readonly fechar = output<void>();
  readonly confirmar = output<FinTransacaoNovoSubmit>();

  readonly metodos = signal<string[]>([...METODOS_NOME_FALLBACK]);
  readonly categorias = signal<CategoriaFinanceiraItem[]>([]);
  readonly clientes = signal<Cliente[]>([]);
  readonly profissionais = signal<ProfissionalListaItem[]>([]);
  readonly carregandoOpcoes = signal(false);
  readonly erroOpcoes = signal<string | null>(null);

  organizacional = false;
  ajustarCompetenciaBaixa = false;
  adicionarRecorrencia = false;
  adiantamentoComissao = true;
  gerarMovimentacao = true;

  valorBrutoDigitos = '';
  taxasDigitos = '';
  valorDigitos = '';
  descricao = '';
  dataVencimentoYmd = ymdHoje();
  dataBaixaYmd = '';
  metodoPagamento = '';
  conta: 'Caixa' | 'Banco' = 'Caixa';
  categoriaId: number | null = null;
  clienteId = '';
  fornecedorId = '';
  profissionalId: number | null = null;
  erroForm = '';

  constructor() {
    effect(() => {
      if (!this.aberto()) return;
      this.resetForm();
      this.carregarOpcoes();
    });
  }

  get titulo(): string {
    const t = this.tipo();
    if (t === 'receita') return 'Novo recebimento';
    if (t === 'vale') return 'Novo vale';
    return 'Nova despesa';
  }

  get hintOrganizacional(): string {
    const t = this.tipo();
    if (t === 'receita') return 'Se ativo, não vincula a nenhum caixa';
    if (t === 'vale') return '';
    return 'Se ativo, não vincula a nenhum caixa';
  }

  get categoriasFiltradas(): CategoriaFinanceiraItem[] {
    const t = this.tipo();
    if (t === 'vale') {
      const vales = this.categorias().filter((c) =>
        c.nome.toLowerCase().includes('vale'),
      );
      if (vales.length) return vales;
      return this.categorias().filter((c) => c.natureza === 'despesa');
    }
    const nat = t === 'receita' ? 'receita' : 'despesa';
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

  valorSimplesReais(): number {
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
    if (qual === 'bruto') this.valorBrutoDigitos = d;
    else if (qual === 'taxas') this.taxasDigitos = d;
    else this.valorDigitos = d;
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

  private resetForm(): void {
    this.erroForm = '';
    this.organizacional = false;
    this.ajustarCompetenciaBaixa = false;
    this.adicionarRecorrencia = false;
    this.adiantamentoComissao = true;
    this.gerarMovimentacao = true;
    this.dataVencimentoYmd = ymdHoje();
    this.dataBaixaYmd = '';
    this.valorBrutoDigitos = '';
    this.taxasDigitos = '';
    this.valorDigitos = '';
    this.descricao = '';
    this.metodoPagamento = '';
    this.conta = 'Caixa';
    this.categoriaId = null;
    this.clienteId = '';
    this.fornecedorId = '';
    this.profissionalId = null;
  }

  private aplicarCategoriaPadrao(): void {
    const cats = this.categoriasFiltradas;
    const vale = cats.find((c) => c.nome.toLowerCase().includes('vale'));
    this.categoriaId = vale?.id ?? cats[0]?.id ?? null;
  }

  private carregarOpcoes(): void {
    this.carregandoOpcoes.set(true);
    this.erroOpcoes.set(null);

    this.api
      .listCategoriasFinanceiras()
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: (items) => {
          this.categorias.set(items);
          this.aplicarCategoriaPadrao();
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
        next: (items) => this.profissionais.set(items),
        error: () => this.profissionais.set([]),
      });
  }

  submit(): void {
    const d = this.dataVencimentoYmd.trim().slice(0, 10);
    if (!/^\d{4}-\d{2}-\d{2}$/.test(d)) {
      this.erroForm = 'Informe uma data de vencimento válida.';
      return;
    }
    if (this.categoriaId == null) {
      this.erroForm = 'Escolha uma categoria.';
      return;
    }
    const metodo = this.metodoPagamento.trim();
    if (!metodo) {
      this.erroForm = 'Selecione a forma de pagamento.';
      return;
    }

    const t = this.tipo();
    const v =
      t === 'receita' ? this.valorLiquidoReais() : this.valorSimplesReais();
    if (v <= 0) {
      this.erroForm = 'Informe um valor maior que zero.';
      return;
    }

    this.erroForm = '';
    this.confirmar.emit({
      tipo: t,
      data_mov: d,
      valor: v,
      categoria_id: this.categoriaId,
      metodo_pagamento: metodo,
      descricao: this.descricao.trim() || undefined,
      profissional_id:
        t === 'vale' || t === 'despesa' ? this.profissionalId : undefined,
    });
  }
}
