import {
  Component,
  DestroyRef,
  ElementRef,
  HostListener,
  OnInit,
  effect,
  inject,
  input,
  output,
  viewChild,
} from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { FormControl, ReactiveFormsModule, Validators } from '@angular/forms';
import { catchError, of } from 'rxjs';
import { SheetsApiService } from '../../core/services/sheets-api.service';
import type {
  ComandaPagamentoItem,
  ComandaResumoPagamentos,
  CriarComandaPagamentoPayload,
  MetodoPagamentoComanda,
} from '../../core/models/api.models';

function formataMoedaBrl(n: number): string {
  return new Intl.NumberFormat('pt-BR', {
    style: 'currency',
    currency: 'BRL',
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(n);
}

function parsePtDecimal(s: string): number {
  const t = String(s ?? '')
    .trim()
    .replace(/R\$/gi, '')
    .replace(/\u00a0/g, ' ')
    .replace(/\s/g, '')
    .replace(/\./g, '')
    .replace(',', '.');
  const n = parseFloat(t);
  return Number.isFinite(n) ? n : 0;
}

function formatarInputPt(n: number): string {
  return n.toLocaleString('pt-BR', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
}

function ymdHoje(): string {
  const n = new Date();
  const m = n.getMonth() + 1;
  const d = n.getDate();
  return `${n.getFullYear()}-${m < 10 ? `0${m}` : m}-${d < 10 ? `0${d}` : d}`;
}

function ymdToDdMmYyyy(ymd: string): string {
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(ymd);
  if (!m) return ymd;
  return `${m[3]}/${m[2]}/${m[1]}`;
}

function ddMmYyyyToYmd(s: string): string | null {
  const t = s.trim();
  const m = /^(\d{1,2})[\/\-](\d{1,2})[\/\-](\d{4})$/.exec(t);
  if (!m) return null;
  const day = parseInt(m[1], 10);
  const month = parseInt(m[2], 10);
  const year = parseInt(m[3], 10);
  if (month < 1 || month > 12 || day < 1 || day > 31) return null;
  const dd = String(day).padStart(2, '0');
  const mm = String(month).padStart(2, '0');
  return `${year}-${mm}-${dd}`;
}

interface MetodoOpcao {
  value: MetodoPagamentoComanda;
  rotulo: string;
  /** Ícone / agrupamento na grelha principal ou no modal. */
  grupo: 'dinheiro' | 'cartao' | 'pix' | 'outros';
}

/** Ordem na grelha: dinheiro → cartão (picker) → pix. */
type MetodoSlotPrincipal =
  | { kind: 'opcao'; opcao: MetodoOpcao }
  | { kind: 'cartao' };

const METODOS: MetodoOpcao[] = [
  { value: 'dinheiro', rotulo: 'Dinheiro', grupo: 'dinheiro' },
  { value: 'cartao_credito', rotulo: 'Cartão de crédito', grupo: 'cartao' },
  { value: 'cartao_debito', rotulo: 'Cartão de débito', grupo: 'outros' },
  { value: 'pix', rotulo: 'Pix', grupo: 'pix' },
  { value: 'transferencia', rotulo: 'Transferência', grupo: 'outros' },
  { value: 'outros', rotulo: 'Outros', grupo: 'outros' },
];

/**
 * Sub-drawer Faturar — abre por cima do drawer de Comanda.
 * Permite registar 1..N pagamentos parciais (cada um vira 1 movimentação financeira).
 */
@Component({
  selector: 'app-faturar-drawer',
  standalone: true,
  imports: [ReactiveFormsModule],
  templateUrl: './faturar-drawer.component.html',
  styleUrl: './faturar-drawer.component.scss',
})
export class FaturarDrawerComponent implements OnInit {
  private readonly api = inject(SheetsApiService);
  private readonly destroyRef = inject(DestroyRef);

  readonly idAtendimento = input.required<string>();
  /** Resumo enviado pelo pai ao abrir; é refrescado pela API ao montar. */
  readonly resumoInicial = input<ComandaResumoPagamentos | null>(null);

  readonly fechar = output<void>();

  resumo: ComandaResumoPagamentos = {
    total_bruto: 0,
    desconto: 0,
    total: 0,
    total_pago: 0,
    saldo: 0,
    status: 'aberto',
    cobranca_status: null,
  };
  pagamentos: ComandaPagamentoItem[] = [];
  carregando = false;
  salvando = false;
  erro = '';

  readonly valorCtrl = new FormControl('', { nonNullable: true });
  readonly parcelasCtrl = new FormControl(1, {
    nonNullable: true,
    validators: [Validators.min(1)],
  });
  readonly dataCtrl = new FormControl(ymdToDdMmYyyy(ymdHoje()), {
    nonNullable: true,
  });

  /** Sheet «Outros» (lista expandida de métodos). */
  outrosAberto = false;

  /** Dropdown crédito vs débito (âncora no botão Cartão). */
  cartaoDropdownAberto = false;

  readonly cartaoWrap = viewChild<ElementRef<HTMLElement>>('cartaoWrap');

  /** Modal local de calcular troco. */
  trocoAberto = false;
  readonly recebidoCtrl = new FormControl('', { nonNullable: true });

  /** Confirmação de excluir pagamento. */
  pagamentoParaExcluir: ComandaPagamentoItem | null = null;
  excluindoPagamentoId: number | null = null;

  constructor() {
    /** Pré-carrega valor com o saldo restante quando o resumo muda. */
    effect(() => {
      const r = this.resumoInicial();
      if (r) {
        this.resumo = r;
        if (r.saldo > 0 && !this.valorCtrl.value.trim()) {
          this.valorCtrl.setValue(formatarInputPt(r.saldo), {
            emitEvent: false,
          });
        }
      }
    });
  }

  ngOnInit(): void {
    this.recarregar();
  }

  // ----- Data -------------------------------------------------------------

  private recarregar(): void {
    const id = this.idAtendimento();
    if (!id) return;
    this.carregando = true;
    this.api
      .listComandaPagamentos(id)
      .pipe(
        takeUntilDestroyed(this.destroyRef),
        catchError(() => {
          this.erro = 'Não foi possível carregar os pagamentos da comanda.';
          return of(null);
        }),
      )
      .subscribe({
        next: (r) => {
          this.carregando = false;
          if (!r) return;
          this.pagamentos = r.items ?? [];
          this.resumo = r.resumo;
          if (this.resumo.saldo > 0 && !this.valorCtrl.value.trim()) {
            this.valorCtrl.setValue(formatarInputPt(this.resumo.saldo), {
              emitEvent: false,
            });
          } else if (this.resumo.saldo <= 0) {
            this.valorCtrl.setValue('', { emitEvent: false });
          }
        },
      });
  }

  // ----- Métodos / botões --------------------------------------------------

  metodoSlotsPrincipais(): MetodoSlotPrincipal[] {
    const dinheiro = METODOS.find((m) => m.value === 'dinheiro');
    const pix = METODOS.find((m) => m.value === 'pix');
    const slots: MetodoSlotPrincipal[] = [];
    if (dinheiro) slots.push({ kind: 'opcao', opcao: dinheiro });
    slots.push({ kind: 'cartao' });
    if (pix) slots.push({ kind: 'opcao', opcao: pix });
    return slots;
  }

  trackMetodoPrincipalSlot(slot: MetodoSlotPrincipal): string {
    return slot.kind === 'cartao' ? 'cartao' : slot.opcao.value;
  }

  /** Opções do dropdown «Cartão» (rótulos com capitalização do UI). */
  metodosCartaoDropdown(): Array<{ value: MetodoPagamentoComanda; rotulo: string }> {
    return [
      { value: 'cartao_credito', rotulo: 'Cartão de Crédito' },
      { value: 'cartao_debito', rotulo: 'Cartão de Débito' },
    ];
  }

  metodoBotoesOutros(): MetodoOpcao[] {
    return METODOS.filter(
      (m) =>
        m.value === 'transferencia' ||
        m.value === 'outros',
    );
  }

  abrirOutros(): void {
    this.outrosAberto = true;
  }

  fecharOutros(): void {
    this.outrosAberto = false;
  }

  toggleCartaoDropdown(ev: MouseEvent): void {
    ev.stopPropagation();
    if (this.cartaoDropdownAberto) {
      this.fecharCartaoDropdown();
      return;
    }
    this.cartaoDropdownAberto = true;
  }

  fecharCartaoDropdown(): void {
    this.cartaoDropdownAberto = false;
  }

  @HostListener('document:click', ['$event'])
  onDocumentClickFecharCartao(ev: MouseEvent): void {
    if (!this.cartaoDropdownAberto) return;
    const wrap = this.cartaoWrap()?.nativeElement;
    if (wrap?.contains(ev.target as Node)) return;
    this.fecharCartaoDropdown();
  }

  onFatBodyScrollFecharCartao(): void {
    if (this.cartaoDropdownAberto) {
      this.fecharCartaoDropdown();
    }
  }

  podeRegistrar(): boolean {
    if (this.salvando) return false;
    if (this.resumo.saldo <= 0) return false;
    const v = parsePtDecimal(this.valorCtrl.value);
    return v > 0;
  }

  registrarPagamento(metodo: MetodoPagamentoComanda): void {
    this.fecharCartaoDropdown();
    if (this.salvando) return;
    const valor = parsePtDecimal(this.valorCtrl.value);
    if (!Number.isFinite(valor) || valor <= 0) {
      this.erro = 'Informe um valor maior que zero.';
      return;
    }
    const dataYmd =
      ddMmYyyyToYmd(this.dataCtrl.value) ?? ymdHoje();
    const parcelas = Math.max(1, Math.floor(this.parcelasCtrl.value || 1));

    const payload: CriarComandaPagamentoPayload = {
      data_pagamento: dataYmd,
      valor,
      metodo,
      parcelas,
      observacao: null,
    };

    this.salvando = true;
    this.erro = '';
    this.api
      .criarComandaPagamento(this.idAtendimento(), payload)
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: (r) => {
          this.salvando = false;
          this.outrosAberto = false;
          this.cartaoDropdownAberto = false;
          this.parcelasCtrl.setValue(1);
          this.resumo = r.resumo;
          this.pagamentos = [...this.pagamentos, r.pagamento];
          if (this.resumo.saldo > 0) {
            this.valorCtrl.setValue(formatarInputPt(this.resumo.saldo), {
              emitEvent: false,
            });
          } else {
            this.valorCtrl.setValue('', { emitEvent: false });
          }
        },
        error: (e: Error) => {
          this.salvando = false;
          this.erro =
            e.message ||
            'Não foi possível gravar o pagamento. Tente novamente.';
        },
      });
  }

  // ----- Excluir pagamento ------------------------------------------------

  pedirExcluir(p: ComandaPagamentoItem): void {
    this.pagamentoParaExcluir = p;
  }

  cancelarExcluir(): void {
    this.pagamentoParaExcluir = null;
  }

  confirmarExcluir(): void {
    const p = this.pagamentoParaExcluir;
    if (!p) return;
    this.excluindoPagamentoId = p.id;
    this.api
      .excluirComandaPagamento(this.idAtendimento(), p.id)
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: (r) => {
          this.excluindoPagamentoId = null;
          this.pagamentoParaExcluir = null;
          this.pagamentos = this.pagamentos.filter((x) => x.id !== p.id);
          this.resumo = r.resumo;
          if (this.resumo.saldo > 0) {
            this.valorCtrl.setValue(formatarInputPt(this.resumo.saldo), {
              emitEvent: false,
            });
          }
        },
        error: (e: Error) => {
          this.excluindoPagamentoId = null;
          this.erro = e.message || 'Não foi possível remover o pagamento.';
        },
      });
  }

  // ----- Calcular troco ---------------------------------------------------

  abrirCalcularTroco(): void {
    this.recebidoCtrl.setValue('');
    this.trocoAberto = true;
  }

  fecharCalcularTroco(): void {
    this.trocoAberto = false;
  }

  trocoCalculado(): number {
    const recebido = parsePtDecimal(this.recebidoCtrl.value);
    const total = parsePtDecimal(this.valorCtrl.value);
    return Math.max(0, Math.round((recebido - total) * 100) / 100);
  }

  // ----- Helpers UI -------------------------------------------------------

  brl(n: number | string): string {
    const num = typeof n === 'number' ? n : parseFloat(String(n));
    return formataMoedaBrl(Number.isFinite(num) ? num : 0);
  }

  rotuloMetodoPagamento(p: ComandaPagamentoItem): string {
    return p.metodo_rotulo;
  }

  dataExibicao(p: ComandaPagamentoItem): string {
    return ymdToDdMmYyyy(p.data_pagamento);
  }

  onValorBlur(): void {
    const v = parsePtDecimal(this.valorCtrl.value);
    if (v > 0) {
      this.valorCtrl.setValue(formatarInputPt(v), { emitEvent: false });
    }
  }

  onDataBlur(): void {
    const ymd = ddMmYyyyToYmd(this.dataCtrl.value);
    if (ymd) {
      this.dataCtrl.setValue(ymdToDdMmYyyy(ymd), { emitEvent: false });
    }
  }

  @HostListener('document:keydown.escape', ['$event'])
  onEsc(ev: KeyboardEvent): void {
    if (this.trocoAberto) {
      ev.preventDefault();
      this.fecharCalcularTroco();
      return;
    }
    if (this.pagamentoParaExcluir) {
      ev.preventDefault();
      this.cancelarExcluir();
      return;
    }
    if (this.cartaoDropdownAberto) {
      ev.preventDefault();
      this.fecharCartaoDropdown();
      return;
    }
    if (this.outrosAberto) {
      ev.preventDefault();
      this.fecharOutros();
      return;
    }
  }
}
