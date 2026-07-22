import {
  Component,
  DestroyRef,
  HostListener,
  effect,
  inject,
  input,
  output,
  signal,
} from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { FormsModule } from '@angular/forms';
import type { CategoriaFinanceiraItem } from '../../../../core/models/api.models';
import { SheetsApiService } from '../../../../core/services/sheets-api.service';
import {
  METODOS_NOME_FALLBACK,
  mapFormasParaNomes,
} from '../../../../core/utils/fin-formas-pagamento.util';
import { formataMoedaBrl } from '../../../../core/utils/brl-digit-input';

export interface FinTransacaoNovoSubmit {
  natureza: 'receita' | 'despesa';
  data_mov: string;
  valor: number;
  categoria_id: number;
  metodo_pagamento: string;
  descricao?: string;
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
  selector: 'app-fin-transacao-novo-modal',
  standalone: true,
  imports: [FormsModule],
  templateUrl: './fin-transacao-novo-modal.component.html',
  styleUrl: './fin-transacao-novo-modal.component.scss',
})
export class FinTransacaoNovoModalComponent {
  private readonly api = inject(SheetsApiService);
  private readonly destroyRef = inject(DestroyRef);

  readonly aberto = input(false);
  readonly naturezaInicial = input<'receita' | 'despesa' | null>(null);
  readonly salvando = input(false);

  readonly fechar = output<void>();
  readonly confirmar = output<FinTransacaoNovoSubmit>();

  readonly metodos = signal<string[]>([...METODOS_NOME_FALLBACK]);
  readonly categorias = signal<CategoriaFinanceiraItem[]>([]);
  readonly carregandoOpcoes = signal(false);
  readonly erroOpcoes = signal<string | null>(null);

  natureza: 'receita' | 'despesa' = 'despesa';
  dataYmd = ymdHoje();
  valorDigitos = '';
  categoriaId: number | null = null;
  metodoPagamento = '';
  descricao = '';
  erroForm = '';

  constructor() {
    effect(() => {
      if (!this.aberto()) return;
      this.erroForm = '';
      this.dataYmd = ymdHoje();
      this.valorDigitos = '';
      this.metodoPagamento = '';
      this.descricao = '';
      const ini = this.naturezaInicial();
      this.natureza = ini === 'receita' || ini === 'despesa' ? ini : 'despesa';
      this.carregarCategorias();
      this.carregarFormasPagamento();
    });
  }

  get categoriasFiltradas(): CategoriaFinanceiraItem[] {
    return this.categorias().filter((c) => c.natureza === this.natureza);
  }

  rotuloData(): string {
    const y = this.dataYmd.trim();
    return y ? ymdParaExibicao(y) : 'DD/MM/AAAA';
  }

  dataPlaceholder(): boolean {
    return !this.dataYmd.trim();
  }

  rotuloValor(): string {
    if (!this.valorDigitos.trim()) return 'R$ 0,00';
    const v = (parseInt(this.valorDigitos, 10) || 0) / 100;
    return formataMoedaBrl(v);
  }

  onOverlayClick(ev: MouseEvent): void {
    if ((ev.target as HTMLElement).classList.contains('fin-trans-modal-overlay')) {
      this.fechar.emit();
    }
  }

  @HostListener('document:keydown.escape', ['$event'])
  onEscape(ev: KeyboardEvent): void {
    if (!this.aberto() || this.salvando()) return;
    ev.preventDefault();
    this.fechar.emit();
  }

  onNaturezaChange(): void {
    const cats = this.categoriasFiltradas;
    if (
      this.categoriaId == null ||
      !cats.some((c) => c.id === this.categoriaId)
    ) {
      this.categoriaId = cats[0]?.id ?? null;
    }
  }

  onValorInput(ev: Event): void {
    const el = ev.target as HTMLInputElement;
    this.valorDigitos = el.value.replace(/\D/g, '').slice(0, 15);
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

  onDataAlterada(ev: Event): void {
    const v = (ev.target as HTMLInputElement).value.trim().slice(0, 10);
    if (/^\d{4}-\d{2}-\d{2}$/.test(v)) this.dataYmd = v;
  }

  private valorReais(): number {
    return (parseInt(this.valorDigitos || '0', 10) || 0) / 100;
  }

  private carregarCategorias(): void {
    this.carregandoOpcoes.set(true);
    this.erroOpcoes.set(null);
    this.api
      .listCategoriasFinanceiras()
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: (items) => {
          this.categorias.set(items);
          this.onNaturezaChange();
          this.carregandoOpcoes.set(false);
        },
        error: (e: Error) => {
          this.erroOpcoes.set(
            e.message || 'Não foi possível carregar categorias.',
          );
          this.carregandoOpcoes.set(false);
        },
      });
  }

  private carregarFormasPagamento(): void {
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
  }

  submit(): void {
    const d = this.dataYmd.trim().slice(0, 10);
    if (!/^\d{4}-\d{2}-\d{2}$/.test(d)) {
      this.erroForm = 'Informe uma data válida.';
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
    const v = this.valorReais();
    if (v <= 0) {
      this.erroForm = 'Informe um valor maior que zero.';
      return;
    }
    this.erroForm = '';
    this.confirmar.emit({
      natureza: this.natureza,
      data_mov: d,
      valor: v,
      categoria_id: this.categoriaId,
      metodo_pagamento: metodo,
      descricao: this.descricao.trim() || undefined,
    });
  }
}
