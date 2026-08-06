import { CurrencyPipe } from '@angular/common';
import {
  Component,
  computed,
  effect,
  HostListener,
  input,
  output,
  signal,
} from '@angular/core';
import { FormsModule } from '@angular/forms';
import { AgendaModalCalendarComponent } from '../../../../shared/components/agenda-modal-calendar/agenda-modal-calendar.component';

export interface FinComissaoPagarResumo {
  comissoes: number;
  vales: number;
  bonificacoes: number;
  bloqueado: number;
  liquido: number;
}

type MetodoComissao =
  | 'dinheiro'
  | 'cartao_credito'
  | 'cartao_debito'
  | 'pix';

interface PagamentoRascunho {
  idLocal: number;
  metodo: MetodoComissao;
  valor: number;
  dataYmd: string;
}

/** Payload emitido ao confirmar pagamento (API + Transações). */
export interface FinComissaoPagarConfirmPayload {
  dataPagamentoYmd: string;
  pagamentos: { metodo: MetodoComissao; valor: number }[];
}

const ROTULO_METODO: Record<MetodoComissao, string> = {
  dinheiro: 'Dinheiro',
  cartao_credito: 'Cartão de crédito',
  cartao_debito: 'Cartão de débito',
  pix: 'Pix',
};

function ymdHoje(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

function ymdToDdMmYyyy(ymd: string): string {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(ymd.trim().slice(0, 10));
  if (!m) return '';
  return `${m[3]}/${m[2]}/${m[1]}`;
}

function ddMmYyyyToYmd(s: string): string | null {
  const m = /^(\d{2})\/(\d{2})\/(\d{4})$/.exec(String(s ?? '').trim());
  if (!m) return null;
  return `${m[3]}-${m[2]}-${m[1]}`;
}

@Component({
  selector: 'app-fin-comissoes-pagar-drawer',
  standalone: true,
  imports: [CurrencyPipe, FormsModule, AgendaModalCalendarComponent],
  templateUrl: './fin-comissoes-pagar-drawer.component.html',
  styleUrl: './fin-comissoes-pagar-drawer.component.scss',
})
export class FinComissoesPagarDrawerComponent {
  readonly resumo = input.required<FinComissaoPagarResumo>();

  readonly fechar = output<void>();
  readonly confirmar = output<FinComissaoPagarConfirmPayload>();

  valorStr = '';
  vencimentoDdMm = ymdToDdMmYyyy(ymdHoje());
  readonly vencimentoPickerAberto = signal(false);
  readonly cartaoDropdownAberto = signal(false);
  private readonly rascunho = signal<PagamentoRascunho[]>([]);
  private nextIdLocal = 1;

  readonly pagamentoLinhas = computed(() => this.rascunho());

  readonly totalRascunho = computed(() => {
    let s = 0;
    for (const p of this.rascunho()) s += p.valor;
    return Math.round(s * 100) / 100;
  });

  readonly podeConfirmarPagar = computed(() => {
    const alvo = this.resumo().liquido;
    if (alvo <= 0) return false;
    return Math.abs(this.totalRascunho() - alvo) < 0.01;
  });

  constructor() {
    effect(() => {
      const r = this.resumo();
      this.valorStr = this.formatarMoedaInput(r.liquido);
    });
  }

  rotuloMetodo(m: MetodoComissao): string {
    return ROTULO_METODO[m] ?? m;
  }

  rotuloMetodoPrincipal(m: MetodoComissao): string {
    if (m === 'cartao_credito' || m === 'cartao_debito') return 'Cartão';
    return this.rotuloMetodo(m);
  }

  parcelaRotuloSufixo(m: MetodoComissao): string | null {
    if (m === 'cartao_credito') return 'Crédito';
    if (m === 'cartao_debito') return 'Débito';
    return null;
  }

  dataExibicaoLinha(p: PagamentoRascunho): string {
    return ymdToDdMmYyyy(p.dataYmd) || '';
  }

  vencimentoYmd(): string {
    return ddMmYyyyToYmd(this.vencimentoDdMm) ?? ymdHoje();
  }

  dataExibicaoVencimento(): string {
    const ymd = ddMmYyyyToYmd(this.vencimentoDdMm);
    return ymd ? ymdToDdMmYyyy(ymd) : 'DD/MM/AAAA';
  }

  temPagamentos(): boolean {
    return this.rascunho().length > 0;
  }

  toggleCartaoDropdown(ev: Event): void {
    ev.stopPropagation();
    this.cartaoDropdownAberto.update((v) => !v);
    this.vencimentoPickerAberto.set(false);
  }

  fecharDropdowns(): void {
    this.cartaoDropdownAberto.set(false);
    this.vencimentoPickerAberto.set(false);
  }

  onVencimentoFieldClick(ev: Event): void {
    const t = ev.target as HTMLElement;
    if (
      t.closest('app-agenda-modal-calendar') ||
      t.closest('.fat-data-field__calendar-pop')
    ) {
      return;
    }
    ev.preventDefault();
    ev.stopPropagation();
    this.cartaoDropdownAberto.set(false);
    this.vencimentoPickerAberto.update((v) => !v);
  }

  onVencimentoPicked(ymd: string): void {
    this.vencimentoDdMm = ymdToDdMmYyyy(ymd);
    this.vencimentoPickerAberto.set(false);
  }

  onFatBodyScroll(): void {
    if (this.cartaoDropdownAberto) this.cartaoDropdownAberto.set(false);
    this.vencimentoPickerAberto.set(false);
  }

  adicionarMetodo(metodo: MetodoComissao): void {
    this.fecharDropdowns();
    const valor = this.parseValorMoeda(this.valorStr);
    if (valor <= 0) return;
    const restante =
      Math.round((this.resumo().liquido - this.totalRascunho()) * 100) / 100;
    const aplicar = restante > 0 ? Math.min(valor, restante) : valor;
    if (aplicar <= 0) return;
    this.rascunho.update((lista) => [
      ...lista,
      {
        idLocal: this.nextIdLocal++,
        metodo,
        valor: aplicar,
        dataYmd: this.vencimentoYmd(),
      },
    ]);
  }

  removerRascunho(idLocal: number): void {
    this.rascunho.update((lista) => lista.filter((p) => p.idLocal !== idLocal));
  }

  onValorInput(ev: Event): void {
    const el = ev.target as HTMLInputElement;
    this.valorStr = el.value;
  }

  onValorBlur(): void {
    const n = this.parseValorMoeda(this.valorStr);
    if (n > 0) this.valorStr = this.formatarMoedaInput(n);
  }

  onConfirmar(): void {
    if (!this.podeConfirmarPagar()) return;
    this.confirmar.emit({
      dataPagamentoYmd: this.vencimentoYmd(),
      pagamentos: this.rascunho().map((p) => ({
        metodo: p.metodo,
        valor: p.valor,
      })),
    });
  }

  @HostListener('document:click')
  onDocumentClick(): void {
    this.fecharDropdowns();
  }

  private parseValorMoeda(s: string): number {
    const t = String(s ?? '')
      .replace(/[^\d,.-]/g, '')
      .replace(/\./g, '')
      .replace(',', '.');
    const n = parseFloat(t);
    return Number.isFinite(n) ? n : 0;
  }

  private formatarMoedaInput(n: number): string {
    return n.toLocaleString('pt-BR', {
      style: 'currency',
      currency: 'BRL',
    });
  }
}
