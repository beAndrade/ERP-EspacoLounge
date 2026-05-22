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
  MetodoPagamentoComanda,
} from '../../core/models/api.models';
import { SheetsApiService } from '../../core/services/sheets-api.service';

export interface ClientePagarDebitosModalSubmit {
  dataYmd: string;
  metodo: MetodoPagamentoComanda;
  conta: string;
  categoriaId: number;
}

interface MetodoOpcao {
  value: MetodoPagamentoComanda;
  rotulo: string;
}

const METODOS_PAGAR: MetodoOpcao[] = [
  { value: 'dinheiro', rotulo: 'Dinheiro' },
  { value: 'cartao_credito', rotulo: 'Cartão de crédito' },
  { value: 'cartao_debito', rotulo: 'Cartão de débito' },
  { value: 'pix', rotulo: 'Pix' },
  { value: 'transferencia', rotulo: 'Transferência' },
  { value: 'outros', rotulo: 'Outros' },
];

const CONTAS_OPCOES = [
  { value: 'caixa', rotulo: 'Caixa' },
  { value: 'banco', rotulo: 'Banco' },
] as const;

function ymdParaExibicao(ymd: string): string {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(ymd.trim().slice(0, 10));
  if (!m) return '';
  return `${m[3]}/${m[2]}/${m[1]}`;
}

@Component({
  selector: 'app-cliente-pagar-debitos-modal',
  standalone: true,
  imports: [FormsModule],
  templateUrl: './cliente-pagar-debitos-modal.component.html',
  styleUrl: './cliente-pagar-debitos-modal.component.scss',
})
export class ClientePagarDebitosModalComponent {
  private readonly api = inject(SheetsApiService);
  private readonly destroyRef = inject(DestroyRef);

  readonly aberto = input(false);
  readonly salvando = input(false);

  readonly fechar = output<void>();
  readonly confirmar = output<ClientePagarDebitosModalSubmit>();

  readonly metodos = METODOS_PAGAR;
  readonly contas = CONTAS_OPCOES;

  readonly categorias = signal<CategoriaFinanceiraItem[]>([]);
  readonly carregandoOpcoes = signal(false);
  readonly erroOpcoes = signal<string | null>(null);

  dataYmd = '';
  metodo = '' as MetodoPagamentoComanda | '';
  conta = '';
  categoriaId: number | null = null;
  erroForm = '';

  constructor() {
    effect(() => {
      if (this.aberto()) {
        this.resetFormulario();
        this.carregarOpcoes();
      }
    });
  }

  rotuloData(): string {
    const y = this.dataYmd.trim().slice(0, 10);
    return y ? ymdParaExibicao(y) : 'Selecionar data';
  }

  dataPlaceholder(): boolean {
    return !/^\d{4}-\d{2}-\d{2}$/.test(this.dataYmd.trim().slice(0, 10));
  }

  abrirCalendarioData(ev: Event, input: HTMLInputElement): void {
    ev.preventDefault();
    const el = input as HTMLInputElement & { showPicker?: () => Promise<void> };
    if (typeof el.showPicker === 'function') {
      void Promise.resolve(el.showPicker()).catch(() => {
        input.focus();
        input.click();
      });
    } else {
      input.focus();
      input.click();
    }
  }

  onDataAlterada(ev: Event): void {
    const v = (ev.target as HTMLInputElement).value.trim().slice(0, 10);
    this.dataYmd = /^\d{4}-\d{2}-\d{2}$/.test(v) ? v : '';
    this.erroForm = '';
  }

  fecharModal(): void {
    if (this.salvando()) return;
    this.fechar.emit();
  }

  onOverlayClick(ev: MouseEvent): void {
    if (ev.target !== ev.currentTarget) return;
    this.fecharModal();
  }

  submeter(): void {
    if (this.salvando()) return;
    const ymd = this.dataYmd.trim().slice(0, 10);
    if (!/^\d{4}-\d{2}-\d{2}$/.test(ymd)) {
      this.erroForm = 'Selecione a data do pagamento.';
      return;
    }
    const met = String(this.metodo ?? '').trim() as MetodoPagamentoComanda;
    if (!met || !METODOS_PAGAR.some((m) => m.value === met)) {
      this.erroForm = 'Selecione a forma de pagamento.';
      return;
    }
    if (!String(this.conta ?? '').trim()) {
      this.erroForm = 'Selecione a conta.';
      return;
    }
    if (this.categoriaId == null || !Number.isFinite(this.categoriaId)) {
      this.erroForm = 'Selecione a categoria.';
      return;
    }
    this.erroForm = '';
    this.confirmar.emit({
      dataYmd: ymd,
      metodo: met,
      conta: this.conta.trim(),
      categoriaId: this.categoriaId,
    });
  }

  private resetFormulario(): void {
    this.dataYmd = '';
    this.metodo = '';
    this.conta = '';
    this.categoriaId = null;
    this.erroForm = '';
  }

  private carregarOpcoes(): void {
    this.carregandoOpcoes.set(true);
    this.erroOpcoes.set(null);
    this.api
      .listCategoriasFinanceiras()
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: (items) => {
          const receitas = items.filter(
            (c) => String(c.natureza ?? '').trim() === 'receita',
          );
          this.categorias.set(receitas);
          this.categoriaId = receitas[0]?.id ?? null;
          this.carregandoOpcoes.set(false);
        },
        error: () => {
          this.categorias.set([]);
          this.categoriaId = null;
          this.erroOpcoes.set('Não foi possível carregar categorias.');
          this.carregandoOpcoes.set(false);
        },
      });
  }
}
