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
import { AgendaModalCalendarComponent } from '../novo/agenda-modal-calendar.component';
import { SheetsApiService } from '../../../../core/services/sheets-api.service';
import {
  METODOS_COMANDA_FALLBACK,
  mapFormasParaMetodosComanda,
  rotulosMetodoComandaFromFormas,
  type MetodoComandaOpcaoUi,
} from '../../../../core/utils/fin-formas-pagamento.util';
import type {
  ComandaPagamentoItem,
  ComandaResumoPagamentos,
  CriarComandaPagamentoPayload,
  FaturarComandaPayload,
  MetodoPagamentoComanda,
} from '../../../../core/models/api.models';
import { dataYmdAnteriorAHoje } from '../../../../core/utils/comanda-status.util';

function formataMoedaBrl(n: number): string {
  const num = n.toLocaleString('pt-BR', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
  /** Espaço explícito entre «R$» e o valor (evita NBSP apertado / placeholder sem gap). */
  return `R$ ${num}`;
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

const PLACEHOLDER_MOEDA = 'R$ 0,00';

/** Máscara por dígitos (centavos), igual aos outros campos de valor do sistema. */
function moedaAPartirDosDigitos(raw: string): string {
  const digits = String(raw ?? '').replace(/\D/g, '');
  const trimmed = digits.length > 12 ? digits.slice(-12) : digits;
  const centInt =
    trimmed === '' ? 0 : Math.min(parseInt(trimmed, 10), 999999999999);
  const n =
    Number.isFinite(centInt) && centInt >= 0 ? Math.round(centInt) / 100 : 0;
  return formataMoedaBrl(n);
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

/** Soma meses a `AAAA-MM-DD` (mesmo dia, ajuste automático de fim de mês). */
function ymdAddMonths(ymd: string, months: number): string {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(ymd);
  if (!m) return ymd;
  const y = parseInt(m[1], 10);
  const mo = parseInt(m[2], 10) - 1;
  const d = parseInt(m[3], 10);
  const dt = new Date(y, mo + months, d);
  const mm = dt.getMonth() + 1;
  const dd = dt.getDate();
  return `${dt.getFullYear()}-${mm < 10 ? `0${mm}` : mm}-${dd < 10 ? `0${dd}` : dd}`;
}

/** Divide valor total em N parcelas (centavos repartidos nas primeiras). */
function dividirValorEmParcelas(total: number, n: number): number[] {
  const parcelas = Math.max(1, Math.floor(n));
  const cents = Math.round(Math.max(0, total) * 100);
  const base = Math.floor(cents / parcelas);
  const resto = cents % parcelas;
  return Array.from({ length: parcelas }, (_, i) => {
    const c = base + (i < resto ? 1 : 0);
    return Math.round(c) / 100;
  });
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

const ROTULO_METODO_UI_FALLBACK: Record<MetodoPagamentoComanda, string> = {
  dinheiro: 'Dinheiro',
  cartao_credito: 'Cartão de crédito',
  cartao_debito: 'Cartão de débito',
  pix: 'Pix',
  pendente: 'Pendente',
  transferencia: 'Transferência',
  outros: 'Outros',
};

export interface RascunhoPagamento {
  idLocal: string;
  data_pagamento: string;
  metodo: MetodoPagamentoComanda;
  valor: number;
  /** Sempre 1 por linha após split; gravado na API por parcela. */
  parcelas: number;
  destino: 'comanda' | 'credito';
  /** Método do botão (ex. «Pix» na linha 2/2 agendada como `pendente`). */
  metodoRotulo?: MetodoPagamentoComanda;
  parcelaNumero?: number;
  parcelasTotal?: number;
}

export type PagamentoLinhaUi =
  | { kind: 'api'; row: ComandaPagamentoItem }
  | { kind: 'rasc'; row: RascunhoPagamento };

const EPS_SALDO = 0.02;

/**
 * Sub-drawer Faturar — abre por cima do drawer de Comanda.
 * Permite registar 1..N pagamentos parciais (cada um vira 1 movimentação financeira).
 */
@Component({
  selector: 'app-faturar-drawer',
  standalone: true,
  imports: [ReactiveFormsModule, AgendaModalCalendarComponent],
  templateUrl: './faturar-drawer.component.html',
  styleUrl: './faturar-drawer.component.scss',
})
export class FaturarDrawerComponent implements OnInit {
  private readonly api = inject(SheetsApiService);
  private readonly destroyRef = inject(DestroyRef);

  readonly idAtendimento = input.required<string>();
  /** Resumo enviado pelo pai ao abrir; é refrescado pela API ao montar. */
  readonly resumoInicial = input<ComandaResumoPagamentos | null>(null);
  /**
   * Data da comanda (`AAAA-MM-DD`) alinhada ao campo do drawer da comanda;
   * sincroniza «Data do pagamento» e o rótulo «Atrasado» em linhas «Pendente».
   */
  readonly dataComanda = input<string | null>(null);
  /** Comanda finalizada: edição de pagamentos gravados (rótulo «Gravar»). */
  readonly modoVerPagamentos = input(false);
  /**
   * Crédito indicado no drawer da comanda (só exibido no resumo; aplica na API ao «Faturar»).
   */
  readonly creditoComandaAplicado = input(0);
  /**
   * Quando false, o ESC é gerido pelo pai (ex.: pilha do drawer de cliente).
   * Evita fechar dois níveis no mesmo Escape.
   */
  readonly gerenciarEscape = input(true);

  readonly fechar = output<void>();
  /** Após gravar com sucesso na API (pai fecha drawers e actualiza a lista). */
  readonly faturado = output<void>();

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
  /** Alocações ainda não gravadas até «Faturar». */
  rascunho: RascunhoPagamento[] = [];
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

  /** Dropdown crédito vs débito (âncora no botão Cartão). */
  cartaoDropdownAberto = false;

  /** Calendário «Data do pagamento» (reutiliza `app-agenda-modal-calendar`). */
  pagamentoDataPickerOpen = false;
  /** Calendário por linha da lista (`a-{id}` / `r-{idLocal}`). */
  linhaDataPickerKey: string | null = null;
  /** Preview YMD enquanto o rato passa nas células do calendário da linha. */
  linhaDataPreviewYmd: string | null = null;
  salvandoDataLinhaKey: string | null = null;

  readonly placeholderMoeda = PLACEHOLDER_MOEDA;

  readonly cartaoWrap = viewChild<ElementRef<HTMLElement>>('cartaoWrap');

  /** Modal local de calcular troco. */
  trocoAberto = false;
  readonly recebidoCtrl = new FormControl('', { nonNullable: true });

  excluindoPagamentoId: number | null = null;

  /** Formas de pagamento (cadastro financeiro ou fallback). */
  formasMetodos: MetodoComandaOpcaoUi[] = [...METODOS_COMANDA_FALLBACK];
  private rotulosMetodoUi: Partial<Record<MetodoPagamentoComanda, string>> = {
    ...ROTULO_METODO_UI_FALLBACK,
  };

  constructor() {
    /** Pré-carrega valor com o saldo restante quando o resumo muda. */
    effect(() => {
      const r = this.resumoInicial();
      if (r) {
        this.resumo = r;
        const cred = this.creditoComandaAplicado();
        const saldo = Math.max(
          0,
          Math.round(
            (r.total - (r.total_pago ?? 0) - cred) * 100,
          ) / 100,
        );
        if (saldo > 0.001 && !this.valorCtrl.dirty) {
          this.valorCtrl.setValue(formataMoedaBrl(saldo), {
            emitEvent: false,
          });
        }
      }
    });
    effect(() => {
      const y = (this.dataComanda() ?? '').trim();
      if (!/^\d{4}-\d{2}-\d{2}$/.test(y)) return;
      this.dataCtrl.setValue(ymdToDdMmYyyy(y), { emitEvent: false });
    });
    effect(() => {
      const cred = this.creditoComandaAplicado();
      const ini = this.resumoInicial();
      if (!ini) return;
      const total = ini.total;
      const saldo = Math.max(
        0,
        Math.round(
          (total - (ini.total_pago ?? 0) - cred) * 100,
        ) / 100,
      );
      if (saldo > 0.001 && !this.valorCtrl.dirty) {
        this.valorCtrl.setValue(formataMoedaBrl(saldo), { emitEvent: false });
      }
    });
  }

  ngOnInit(): void {
    this.recarregar();
    this.carregarFormasPagamento();
  }

  private carregarFormasPagamento(): void {
    this.api.listFinFormasPagamentoOpcoes().subscribe({
      next: (items) => {
        const mapped = mapFormasParaMetodosComanda(items);
        if (mapped.length > 0) {
          this.formasMetodos = mapped;
          this.rotulosMetodoUi = {
            ...ROTULO_METODO_UI_FALLBACK,
            ...rotulosMetodoComandaFromFormas(items),
          };
        }
      },
      error: () => {
        /* mantém fallback */
      },
    });
  }

  rotuloMetodoUi(m: MetodoPagamentoComanda): string {
    return this.rotulosMetodoUi[m] ?? ROTULO_METODO_UI_FALLBACK[m] ?? m;
  }

  // ----- Data -------------------------------------------------------------

  /**
   * O resumo da API pode vir com `desconto` 0 quando o desconto ainda só existe
   * nos campos do drawer da comanda (`descontoResumoCtrl`). Ao abrir Faturar,
   * o pai envia `resumoInicial` alinhado a essa UI — mantemos desconto e totais
   * da comanda a partir dali; `total_pago`, `saldo`, `status` e `cobranca_status`
   * vêm sempre da API (evita saldo stale após excluir pagamentos).
   */
  private mesclarResumoComInicial(api: ComandaResumoPagamentos): ComandaResumoPagamentos {
    const ini = this.resumoInicial();
    if (!ini) {
      return api;
    }
    const totalPago = api.total_pago;
    const total = ini.total;
    const totalBruto = ini.total_bruto;
    const desconto = ini.desconto;
    const cred = this.creditoComandaAplicado();
    const saldoApi = api.saldo;
    const saldo =
      saldoApi != null && Number.isFinite(saldoApi)
        ? Math.max(0, Math.round(saldoApi * 100) / 100)
        : Math.max(
            0,
            Math.round((total - totalPago - cred) * 100) / 100,
          );
    return {
      ...api,
      total_bruto: totalBruto,
      desconto,
      total,
      total_pago: totalPago,
      saldo,
      status: api.status,
      cobranca_status: api.cobranca_status,
    };
  }

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
          this.rascunho = [];
          this.resumo = this.mesclarResumoComInicial(r.resumo);
          const saldoPagar = this.saldoRestante();
          if (saldoPagar > 0.001 && !this.valorCtrl.dirty) {
            this.valorCtrl.setValue(formataMoedaBrl(saldoPagar), {
              emitEvent: false,
            });
          } else if (saldoPagar <= 0.001) {
            this.valorCtrl.setValue('', { emitEvent: false });
          }
        },
      });
  }

  // ----- Métodos / botões --------------------------------------------------

  metodoSlotsPrincipais(): MetodoSlotPrincipal[] {
    const dinheiro = this.formasMetodos.find((m) => m.value === 'dinheiro');
    const pix = this.formasMetodos.find((m) => m.value === 'pix');
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
    return this.formasMetodos
      .filter(
        (m) => m.value === 'cartao_credito' || m.value === 'cartao_debito',
      )
      .map((m) => ({ value: m.value, rotulo: m.rotulo }));
  }

  /**
   * Métodos de pagamento clicáveis (validação de valor ao adicionar ao rascunho).
   * «Pendente» só com saldo em aberto na comanda.
   */
  podeRegistrarParaMetodo(m: MetodoPagamentoComanda): boolean {
    if (this.salvando) return false;
    if (m === 'pendente') return this.saldoRestante() > 0.001;
    return true;
  }

  /** Botão «Cartão» (abrir dropdown): critério de um método não pendente. */
  podeAbrirCartao(): boolean {
    return this.podeRegistrarParaMetodo('dinheiro');
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

  /**
   * O `app-drawer` do pai faz `stopPropagation` — cliques não chegam ao `document`.
   * Fecha calendário/cartão em cliques dentro do drawer, fora dos respectivos âncoras.
   */
  @HostListener('click', ['$event'])
  onHostClickFecharUi(ev: MouseEvent): void {
    const el = ev.target as HTMLElement | null;
    if (
      this.pagamentoDataPickerOpen &&
      el &&
      !el.closest('.fat-data-field__wrap')
    ) {
      this.pagamentoDataPickerOpen = false;
    }
    if (
      this.linhaDataPickerKey &&
      el &&
      !el.closest('.fat-pag-data-row')
    ) {
      this.fecharLinhaDataPicker();
    }
    if (this.cartaoDropdownAberto) {
      const wrap = this.cartaoWrap()?.nativeElement;
      if (wrap && !wrap.contains(ev.target as Node)) {
        this.fecharCartaoDropdown();
      }
    }
  }

  onFatBodyScrollFecharCartao(): void {
    if (this.cartaoDropdownAberto) {
      this.fecharCartaoDropdown();
    }
    this.pagamentoDataPickerOpen = false;
    this.fecharLinhaDataPicker();
  }

  dataPagamentoYmd(): string {
    return ddMmYyyyToYmd(this.dataCtrl.value) ?? ymdHoje();
  }

  dataExibicaoPagamento(): string {
    const ymd = ddMmYyyyToYmd(this.dataCtrl.value);
    return ymd ? ymdToDdMmYyyy(ymd) : 'DD/MM/AAAA';
  }

  onPagamentoDataFieldClick(ev: Event): void {
    const t = ev.target as HTMLElement;
    if (
      t.closest('app-agenda-modal-calendar') ||
      t.closest('.fat-data-field__calendar-pop')
    ) {
      return;
    }
    ev.preventDefault();
    this.fecharCartaoDropdown();
    this.fecharLinhaDataPicker();
    this.pagamentoDataPickerOpen = !this.pagamentoDataPickerOpen;
  }

  onPagamentoDataPicked(ymd: string): void {
    this.dataCtrl.setValue(ymdToDdMmYyyy(ymd), { emitEvent: false });
    this.pagamentoDataPickerOpen = false;
  }

  chaveLinha(l: PagamentoLinhaUi): string {
    return this.trackPagamentoLinha(0, l);
  }

  dataYmdLinha(l: PagamentoLinhaUi): string {
    const y = l.row.data_pagamento.trim();
    return /^\d{4}-\d{2}-\d{2}$/.test(y) ? y : ymdHoje();
  }

  linhaDataPickerAberto(l: PagamentoLinhaUi): boolean {
    return this.linhaDataPickerKey === this.chaveLinha(l);
  }

  private fecharLinhaDataPicker(): void {
    this.linhaDataPickerKey = null;
    this.linhaDataPreviewYmd = null;
  }

  toggleLinhaDataPicker(ev: Event, l: PagamentoLinhaUi): void {
    ev.preventDefault();
    ev.stopPropagation();
    this.fecharCartaoDropdown();
    this.pagamentoDataPickerOpen = false;
    const key = this.chaveLinha(l);
    if (this.linhaDataPickerKey === key) {
      this.fecharLinhaDataPicker();
      return;
    }
    this.linhaDataPreviewYmd = null;
    this.linhaDataPickerKey = key;
  }

  onLinhaDataHover(ymd: string | null): void {
    this.linhaDataPreviewYmd = ymd;
  }

  onLinhaDataPicked(l: PagamentoLinhaUi, ymd: string): void {
    const y = String(ymd ?? '').trim();
    if (!/^\d{4}-\d{2}-\d{2}$/.test(y)) return;

    if (l.kind === 'rasc') {
      const idLocal = l.row.idLocal;
      this.rascunho = this.rascunho.map((r) =>
        r.idLocal === idLocal ? { ...r, data_pagamento: y } : r,
      );
      this.fecharLinhaDataPicker();
      return;
    }

    const key = this.chaveLinha(l);
    const pagId = l.row.id;
    this.salvandoDataLinhaKey = key;
    this.erro = '';
    this.api
      .atualizarDataComandaPagamento(this.idAtendimento(), pagId, y)
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: ({ pagamento, resumo }) => {
          this.pagamentos = this.pagamentos.map((p) =>
            p.id === pagamento.id ? pagamento : p,
          );
          this.resumo = resumo;
          this.salvandoDataLinhaKey = null;
          this.fecharLinhaDataPicker();
        },
        error: (e: Error) => {
          this.salvandoDataLinhaKey = null;
          this.erro = e.message || 'Não foi possível actualizar a data.';
        },
      });
  }

  onValorMoedaInput(ev: Event): void {
    const el = ev.target as HTMLInputElement | null;
    if (!el) return;
    const formatted = moedaAPartirDosDigitos(el.value);
    if (this.valorCtrl.value !== formatted) {
      this.valorCtrl.setValue(formatted, { emitEvent: true });
    }
    queueMicrotask(() => {
      const len = el.value.length;
      el.setSelectionRange(len, len);
    });
  }

  onRecebidoMoedaInput(ev: Event): void {
    const el = ev.target as HTMLInputElement | null;
    if (!el) return;
    const formatted = moedaAPartirDosDigitos(el.value);
    if (this.recebidoCtrl.value !== formatted) {
      this.recebidoCtrl.setValue(formatted, { emitEvent: true });
    }
    queueMicrotask(() => {
      const len = el.value.length;
      el.setSelectionRange(len, len);
    });
  }

  stepParcelas(delta: number): void {
    const atual = Math.max(1, Math.floor(this.parcelasCtrl.value || 1));
    this.parcelasCtrl.setValue(Math.max(1, atual + delta), { emitEvent: true });
  }

  /** Tudo que aloca na comanda (inclui parcelas futuras «Pendente»). */
  private somaRascunhoComanda(): number {
    return this.rascunho
      .filter((x) => x.destino === 'comanda')
      .reduce((s, x) => s + x.valor, 0);
  }

  /** Só parcelas já recebidas (exclui agendadas como `pendente`). */
  private somaRascunhoComandaPago(): number {
    return this.rascunho
      .filter((x) => x.destino === 'comanda' && x.metodo !== 'pendente')
      .reduce((s, x) => s + x.valor, 0);
  }

  private criarLinhasRascunhoParceladas(
    valorTotal: number,
    parcelas: number,
    dataYmd: string,
    metodo: MetodoPagamentoComanda,
    destino: 'comanda' | 'credito',
  ): RascunhoPagamento[] {
    const n = Math.max(1, Math.floor(parcelas));
    const valores = dividirValorEmParcelas(valorTotal, n);
    const grupo = `g-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
    return valores.map((valor, i) => {
      const parcelaNumero = i + 1;
      const parcelaFutura =
        destino === 'comanda' &&
        n > 1 &&
        metodo !== 'pendente' &&
        parcelaNumero > 1;
      return {
        idLocal: `${grupo}-p${parcelaNumero}`,
        data_pagamento: ymdAddMonths(dataYmd, i),
        metodo: parcelaFutura ? 'pendente' : metodo,
        metodoRotulo: metodo,
        valor,
        parcelas: 1,
        parcelaNumero,
        parcelasTotal: n,
        destino,
      };
    });
  }

  private somaRascunhoCredito(): number {
    return this.rascunho
      .filter((x) => x.destino === 'credito')
      .reduce((s, x) => s + x.valor, 0);
  }

  /** Total pago exibido: API + parcelas já recebidas no rascunho + crédito cliente. */
  totalPagoResumoExibicao(): number {
    return (
      Math.round(
        (this.resumo.total_pago +
          this.somaRascunhoComandaPago() +
          this.somaRascunhoCredito()) *
          100,
      ) / 100
    );
  }

  /** Linha «Créditos» (saldo pré-pago usado na comanda). */
  mostrarLinhaCreditosComandaResumo(): boolean {
    return this.creditoComandaAplicado() > 0.001;
  }

  valorCreditosComandaResumo(): number {
    return Math.round(this.creditoComandaAplicado() * 100) / 100;
  }

  /** Linha «Crédito para o cliente» no resumo: só quando há excesso no rascunho. */
  mostrarLinhaCreditoClienteResumo(): boolean {
    return this.somaRascunhoCredito() > 0.001;
  }

  /** Valor do excesso (rascunho) mostrado na linha de crédito. */
  valorCreditoClienteResumo(): number {
    return Math.round(this.somaRascunhoCredito() * 100) / 100;
  }

  /** `total_pago` da API + linhas do rascunho que liquidam a comanda. */
  totalAlocado(): number {
    return (
      Math.round((this.resumo.total_pago + this.somaRascunhoComanda()) * 100) /
      100
    );
  }

  /** Quanto falta alocar (total comanda − pago − crédito previsto na comanda). */
  saldoRestante(): number {
    const cred = this.creditoComandaAplicado();
    return Math.max(
      0,
      Math.round(
        (this.resumo.total - this.totalAlocado() - cred) * 100,
      ) / 100,
    );
  }

  /** Total líquido exibido no resumo (após crédito previsto da comanda). */
  totalLiquidoResumo(): number {
    const cred = this.valorCreditosComandaResumo();
    if (cred <= 0.001) return this.resumo.total;
    return Math.max(
      0,
      Math.round((this.resumo.total - cred) * 100) / 100,
    );
  }

  pagamentoLinhasUi(): PagamentoLinhaUi[] {
    const api = this.pagamentos.map((p) => ({ kind: 'api' as const, row: p }));
    const rasc = this.rascunho.map((row) => ({ kind: 'rasc' as const, row }));
    return [...api, ...rasc];
  }

  trackPagamentoLinha(_i: number, l: PagamentoLinhaUi): string {
    return l.kind === 'api' ? `a-${l.row.id}` : `r-${l.row.idLocal}`;
  }

  rotuloMetodoPrincipal(l: PagamentoLinhaUi): string {
    if (l.kind === 'api') {
      return l.row.metodo_rotulo;
    }
    return this.rotuloMetodoUi(l.row.metodoRotulo ?? l.row.metodo);
  }

  /** Ex.: `1/2` ao lado do método (rascunho ou linhas gravadas parceladas). */
  parcelaRotuloSufixo(l: PagamentoLinhaUi): string | null {
    if (l.kind === 'rasc') {
      const total = l.row.parcelasTotal ?? 0;
      if (total <= 1 || l.row.parcelaNumero == null) return null;
      return `${l.row.parcelaNumero}/${total}`;
    }
    const total = l.row.parcelas_total ?? 0;
    if (total <= 1 || l.row.parcela_numero == null) return null;
    return `${l.row.parcela_numero}/${total}`;
  }

  dataExibicaoLinha(l: PagamentoLinhaUi): string {
    if (this.linhaDataPickerAberto(l) && this.linhaDataPreviewYmd) {
      return ymdToDdMmYyyy(this.linhaDataPreviewYmd);
    }
    return l.kind === 'api'
      ? this.dataExibicao(l.row)
      : ymdToDdMmYyyy(l.row.data_pagamento);
  }

  valorLinhaNum(l: PagamentoLinhaUi): number {
    return l.kind === 'api' ? parseFloat(l.row.valor) || 0 : l.row.valor;
  }

  badgePagamentoLinha(l: PagamentoLinhaUi): 'pago' | 'pendente' | 'credito' | 'atrasado' {
    if (l.kind === 'rasc' && l.row.destino === 'credito') return 'credito';
    const metodo = l.kind === 'api' ? l.row.metodo : l.row.metodo;
    if (metodo === 'pendente' && this.linhaPagamentoPendenteEmAtraso(l)) {
      return 'atrasado';
    }
    return metodo === 'pendente' ? 'pendente' : 'pago';
  }

  /** Linha «Pendente» vencida: `data_pagamento` da parcela anterior a hoje. */
  private linhaPagamentoPendenteEmAtraso(l: PagamentoLinhaUi): boolean {
    const y = (
      l.kind === 'api' ? l.row.data_pagamento : l.row.data_pagamento
    ).trim();
    if (!/^\d{4}-\d{2}-\d{2}$/.test(y)) return false;
    return dataYmdAnteriorAHoje(y);
  }

  podeMostrarFaturar(): boolean {
    if (this.salvando) return false;
    if (this.excluindoPagamentoId !== null) return false;
    const credComanda = this.creditoComandaAplicado();
    if (this.rascunho.length === 0 && credComanda <= 0.001) return false;
    const temComanda = this.rascunho.some((r) => r.destino === 'comanda');
    const temCred = this.rascunho.some((r) => r.destino === 'credito');
    const quitadoComRascunho = this.saldoRestante() <= 0.001;
    const baseQuitada =
      this.resumo.total_pago + EPS_SALDO >= this.resumo.total;
    if (temComanda && !quitadoComRascunho) return false;
    if (temCred && !temComanda && !baseQuitada) return false;
    if (
      credComanda > 0.001 &&
      this.rascunho.length === 0 &&
      !quitadoComRascunho
    ) {
      return false;
    }
    return true;
  }

  rotuloBotaoConfirmar(): string {
    const verPag = this.modoVerPagamentos();
    if (this.salvando) {
      return verPag ? 'A gravar…' : 'A faturar…';
    }
    return verPag ? 'Gravar' : 'Faturar';
  }

  /** Bloqueia fecho enquanto um DELETE de pagamento ainda corre. */
  podeFecharDrawer(): boolean {
    return this.excluindoPagamentoId === null && !this.salvando;
  }

  pedirFechar(): void {
    if (!this.podeFecharDrawer()) return;
    this.fechar.emit();
  }

  adicionarAoRascunho(metodo: MetodoPagamentoComanda): void {
    this.fecharCartaoDropdown();
    if (this.salvando) return;
    const valor = parsePtDecimal(this.valorCtrl.value);
    if (!Number.isFinite(valor) || valor <= 0) {
      this.erro = 'Informe um valor maior que zero.';
      return;
    }
    const valorArred = Math.round(valor * 100) / 100;
    const saldoAntes = this.saldoRestante();

    if (metodo === 'pendente') {
      if (saldoAntes <= 0.001) {
        this.erro =
          '«Pendente» só se aplica ao valor em falta da comanda, não ao crédito de cliente.';
        return;
      }
      if (valorArred > saldoAntes + 0.005) {
        this.erro = `Com «Pendente», o valor não pode exceder o saldo restante (${formatarInputPt(saldoAntes)}).`;
        return;
      }
    }

    const dataYmd = ddMmYyyyToYmd(this.dataCtrl.value) ?? ymdHoje();
    const parcelas = Math.max(1, Math.floor(this.parcelasCtrl.value || 1));
    this.erro = '';

    const novas: RascunhoPagamento[] = [];

    if (saldoAntes > 0.001 && metodo !== 'pendente') {
      const partC = Math.min(valorArred, saldoAntes);
      const partCArred = Math.round(partC * 100) / 100;
      const partCr = Math.round((valorArred - partCArred) * 100) / 100;
      if (partCArred > 0.001) {
        novas.push(
          ...this.criarLinhasRascunhoParceladas(
            partCArred,
            parcelas,
            dataYmd,
            metodo,
            'comanda',
          ),
        );
      }
      if (partCr > 0.001) {
        novas.push({
          idLocal: `d-${Date.now()}-r-${Math.random().toString(36).slice(2, 9)}`,
          data_pagamento: dataYmd,
          metodo,
          valor: partCr,
          parcelas: 1,
          destino: 'credito',
        });
      }
    } else {
      const destino: 'comanda' | 'credito' =
        saldoAntes > 0.001 ? 'comanda' : 'credito';
      novas.push(
        ...this.criarLinhasRascunhoParceladas(
          valorArred,
          parcelas,
          dataYmd,
          metodo,
          destino,
        ),
      );
    }

    this.rascunho = [...this.rascunho, ...novas];
    this.parcelasCtrl.setValue(1);
    const rest = this.saldoRestante();
    if (rest > 0.001) {
      this.valorCtrl.setValue(formataMoedaBrl(rest), { emitEvent: false });
    } else {
      this.valorCtrl.setValue('', { emitEvent: false });
    }
  }

  removerRascunho(idLocal: string): void {
    const linha = this.rascunho.find((x) => x.idLocal === idLocal);
    const valorRemovido =
      linha != null && Number.isFinite(linha.valor)
        ? Math.round(linha.valor * 100) / 100
        : 0;
    this.rascunho = this.rascunho.filter((x) => x.idLocal !== idLocal);
    const atual = parsePtDecimal(this.valorCtrl.value);
    const base = Number.isFinite(atual) && atual > 0 ? atual : 0;
    const novo = Math.round((base + valorRemovido) * 100) / 100;
    if (novo > 0.001) {
      this.valorCtrl.setValue(formataMoedaBrl(novo), { emitEvent: false });
    } else {
      this.valorCtrl.setValue('', { emitEvent: false });
    }
  }

  confirmarFaturamento(): void {
    if (this.salvando) return;
    const credComanda = this.creditoComandaAplicado();
    if (this.rascunho.length === 0 && credComanda <= 0.001) return;
    const comanda = this.rascunho.filter((r) => r.destino === 'comanda');
    const credito = this.rascunho.filter((r) => r.destino === 'credito');
    const descResumo = this.resumo.desconto;
    const payload: FaturarComandaPayload = {
      pagamentos: comanda.map((r): CriarComandaPagamentoPayload => {
        const parcelado =
          r.parcelasTotal != null &&
          r.parcelasTotal > 1 &&
          r.parcelaNumero != null;
        return {
          data_pagamento: r.data_pagamento,
          valor: r.valor,
          metodo: r.metodo,
          parcelas: r.parcelas,
          ...(parcelado
            ? {
                parcela_numero: r.parcelaNumero,
                parcelas_total: r.parcelasTotal,
                metodo_rotulo: this.rotuloMetodoUi(r.metodoRotulo ?? r.metodo),
              }
            : {}),
          observacao: null,
        };
      }),
      credito_excesso:
        credito.length > 0
          ? credito.map(
              (r): CriarComandaPagamentoPayload => ({
                data_pagamento: r.data_pagamento,
                valor: r.valor,
                metodo: r.metodo,
                parcelas: r.parcelas,
                observacao: null,
              }),
            )
          : undefined,
      ...(descResumo > 0.005
        ? { desconto: formataMoedaBrl(descResumo) }
        : {}),
      ...(credComanda > 0.005
        ? { credito_cliente_usado: credComanda }
        : {}),
    };
    this.salvando = true;
    this.erro = '';
    this.api
      .faturarComanda(this.idAtendimento(), payload)
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: (r) => {
          this.salvando = false;
          this.rascunho = [];
          this.pagamentos = r.items ?? [];
          this.resumo = this.mesclarResumoComInicial(r.resumo);
          this.faturado.emit();
        },
        error: (e: Error) => {
          this.salvando = false;
          this.erro =
            e.message ||
            'Não foi possível faturar a comanda. Tente novamente.';
        },
      });
  }

  // ----- Excluir pagamento ------------------------------------------------

  excluirPagamento(p: ComandaPagamentoItem): void {
    if (this.excluindoPagamentoId !== null) return;
    this.excluindoPagamentoId = p.id;
    this.api
      .excluirComandaPagamento(this.idAtendimento(), p.id)
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: (r) => {
          this.excluindoPagamentoId = null;
          this.pagamentos = this.pagamentos.filter((x) => x.id !== p.id);
          this.resumo = this.mesclarResumoComInicial(r.resumo);
          const saldo = this.resumo.saldo;
          if (saldo > 0.001) {
            this.valorCtrl.setValue(formataMoedaBrl(saldo), {
              emitEvent: false,
            });
          } else {
            this.valorCtrl.setValue('', { emitEvent: false });
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
    this.valorCtrl.setValue(
      v > 0 ? formataMoedaBrl(v) : '',
      { emitEvent: false },
    );
  }

  onDataBlur(): void {
    const ymd = ddMmYyyyToYmd(this.dataCtrl.value);
    if (ymd) {
      this.dataCtrl.setValue(ymdToDdMmYyyy(ymd), { emitEvent: false });
    }
  }

  /**
   * Fecha overlays internos (troco, dropdown, calendário).
   * Devolve true se consumiu o ESC — o pai não deve fechar o drawer.
   */
  tratarEscapeInterno(): boolean {
    if (this.trocoAberto) {
      this.fecharCalcularTroco();
      return true;
    }
    if (this.cartaoDropdownAberto) {
      this.fecharCartaoDropdown();
      return true;
    }
    if (this.pagamentoDataPickerOpen) {
      this.pagamentoDataPickerOpen = false;
      return true;
    }
    if (this.linhaDataPickerKey) {
      this.fecharLinhaDataPicker();
      return true;
    }
    return false;
  }

  @HostListener('document:keydown.escape', ['$event'])
  onEsc(ev: KeyboardEvent): void {
    if (ev.defaultPrevented) return;
    if (this.tratarEscapeInterno()) {
      ev.preventDefault();
      ev.stopImmediatePropagation();
      return;
    }
    /** Pai (hub / comandas / host cliente) gere a pilha de drawers. */
    if (!this.gerenciarEscape()) return;
    if (!this.podeFecharDrawer()) {
      ev.preventDefault();
      ev.stopImmediatePropagation();
      return;
    }
    ev.preventDefault();
    ev.stopImmediatePropagation();
    this.pedirFechar();
  }
}
