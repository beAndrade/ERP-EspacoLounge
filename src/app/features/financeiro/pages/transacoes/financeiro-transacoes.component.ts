import { CurrencyPipe, registerLocaleData } from '@angular/common';
import localePt from '@angular/common/locales/pt';
import {
  Component,
  HostListener,
  LOCALE_ID,
  OnDestroy,
  OnInit,
  ViewChild,
  inject,
  signal,
} from '@angular/core';
import { FormsModule } from '@angular/forms';
import { catchError, forkJoin, of, switchMap } from 'rxjs';
import type {
  Cliente,
  ComandaResumoPagamentos,
} from '../../../../core/models/api.models';
import { parseFiltroDataDdMm } from '../../../../core/utils/atendimento-display';
import { SheetsApiService } from '../../../../core/services/sheets-api.service';
import { NovaComandaDrawerComponent } from '../../../agenda/pages/hub/nova-comanda-drawer.component';
import { FaturarDrawerComponent } from '../../../agenda/pages/hub/faturar-drawer.component';
import type { ComandaDrawerContextoAgenda } from '../../../agenda/pages/hub/comanda-drawer.types';
import type { SaasSelectOption } from '../../../agenda/pages/novo/saas-select.component';
import {
  ClienteCadastroDrawerService,
  type AbrirCadastroClientePayload,
} from '../../../../shared/cliente-cadastro-drawer/cliente-cadastro-drawer.service';
import {
  FinTransacaoEditarDrawerComponent,
  type FinTransacaoEditarSubmit,
} from './fin-transacao-editar-drawer.component';
import {
  FinTransacaoNovoModalComponent,
  type FinTransacaoNovoSubmit,
} from './fin-transacao-novo-modal.component';
import {
  mapFinTransacaoItemToUi,
  type FinTransacaoLinhaUi,
} from './fin-transacoes.mapper';

export type { FinTransacaoLinhaUi };

registerLocaleData(localePt);

type OrdenacaoData = 'asc' | 'desc';
type FiltroNatureza = 'todos' | 'receita' | 'despesa';

function ymdToDdMmYyyy(ymd: string): string {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(ymd.trim().slice(0, 10));
  if (!m) return '';
  return `${m[3]}-${m[2]}-${m[1]}`;
}

function ymdHoje(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

function primeiroDiaMesYmd(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-01`;
}

const DRAWER_ANIM_MS = 430;

type FaturarDrawerCtx = {
  idAtendimento: string;
  resumo: ComandaResumoPagamentos;
  creditoAUsar?: number;
  modoVerPagamentos?: boolean;
};

@Component({
  selector: 'app-financeiro-transacoes',
  standalone: true,
  imports: [
    CurrencyPipe,
    FormsModule,
    FinTransacaoNovoModalComponent,
    FinTransacaoEditarDrawerComponent,
    NovaComandaDrawerComponent,
    FaturarDrawerComponent,
  ],
  providers: [{ provide: LOCALE_ID, useValue: 'pt-BR' }],
  templateUrl: './financeiro-transacoes.component.html',
  styleUrl: './financeiro-transacoes.component.scss',
})
export class FinanceiroTransacoesComponent implements OnInit, OnDestroy {
  private readonly api = inject(SheetsApiService);
  private readonly cadastroDrawer = inject(ClienteCadastroDrawerService);

  @ViewChild(NovaComandaDrawerComponent)
  comandaDrawerRef?: NovaComandaDrawerComponent;

  comandaPainelAberto = false;
  comandaDrawerPanelOpen = false;
  comandaDrawerContexto: ComandaDrawerContextoAgenda | null = null;
  comandaDataYmdParaFaturar: string | null = null;
  private comandaDrawerCloseTimer: ReturnType<typeof setTimeout> | null = null;

  faturarDrawerAberto = false;
  faturarDrawerPanelOpen = false;
  faturarCtx: FaturarDrawerCtx | null = null;
  private faturarDrawerCloseTimer: ReturnType<typeof setTimeout> | null = null;

  editarDrawerAberto = false;
  editarDrawerPanelOpen = false;
  editarLinha: FinTransacaoLinhaUi | null = null;
  readonly editarSalvando = signal(false);
  private editarDrawerCloseTimer: ReturnType<typeof setTimeout> | null = null;

  private pageScrollLockAtivo = false;
  private bodyScrollPreDrawer = 0;
  private abrindoComanda = false;

  /** Menu «⋯» na coluna Ações (`row.id` = `id_ui`). */
  menuAcaoAbertoId: number | null = null;

  readonly opcoesItensPorPagina = [10, 20, 50];

  linhasFonte: FinTransacaoLinhaUi[] = [];
  carregando = false;
  erro = '';

  dataInicio = ymdToDdMmYyyy(primeiroDiaMesYmd());
  dataFim = ymdToDdMmYyyy(ymdHoje());
  filtroNatureza: FiltroNatureza = 'todos';

  ordenacaoData: OrdenacaoData = 'desc';
  dataSortTipVisivel = false;
  private dataSortTipSuprimida = false;

  buscaAberta = false;
  busca = '';
  pagina = 1;
  itensPorPagina = 20;
  perPageMenuAberto = false;
  novoMenuAberto = false;
  filtrosAbertos = false;
  pulsoToolbarBusca = false;
  pulsoToolbarFiltro = false;
  mensagemAcao: string | null = null;

  readonly modalNovoAberto = signal(false);
  readonly modalNovoNatureza = signal<'receita' | 'despesa' | null>(null);
  readonly modalNovoSalvando = signal(false);

  private readonly duracaoPulsoToolbarMs = 600;
  private tPulsoBusca: ReturnType<typeof setTimeout> | null = null;
  private tPulsoFiltro: ReturnType<typeof setTimeout> | null = null;
  private tMensagemAcao: ReturnType<typeof setTimeout> | null = null;

  private readonly selecionados = signal<ReadonlySet<number>>(new Set());
  excluindoId: number | null = null;
  liquidandoPagoId: number | null = null;

  ngOnInit(): void {
    this.carregar();
  }

  ngOnDestroy(): void {
    if (this.comandaDrawerCloseTimer != null) {
      clearTimeout(this.comandaDrawerCloseTimer);
    }
    if (this.faturarDrawerCloseTimer != null) {
      clearTimeout(this.faturarDrawerCloseTimer);
    }
    if (this.editarDrawerCloseTimer != null) {
      clearTimeout(this.editarDrawerCloseTimer);
    }
    if (this.pageScrollLockAtivo) {
      this.desbloquearScrollPagina();
    }
  }

  carregar(): void {
    const diTxt = this.dataInicio.trim();
    const dfTxt = this.dataFim.trim();
    const di = parseFiltroDataDdMm(diTxt);
    const df = parseFiltroDataDdMm(dfTxt);
    if (!diTxt || !dfTxt || !di || !df) {
      this.erro =
        'Preencha data inicial e final (ex.: 01-05-2026). Também aceita barras.';
      return;
    }
    if (di > df) {
      this.erro = 'A data inicial não pode ser posterior à data final.';
      return;
    }

    this.carregando = true;
    this.erro = '';
    this.api.listTransacoesFinanceiras({ dataInicio: di, dataFim: df }).subscribe({
      next: (items) => {
        this.linhasFonte = items.map(mapFinTransacaoItemToUi);
        this.selecionados.set(new Set());
        this.pagina = 1;
        this.carregando = false;
      },
      error: (e: Error) => {
        this.erro =
          e.message ||
          'Não foi possível carregar transações. Confirme a API e as migrações.';
        this.linhasFonte = [];
        this.carregando = false;
      },
    });
  }

  aplicarFiltros(): void {
    this.filtrosAbertos = false;
    this.carregar();
  }

  limparFiltrosPeriodo(): void {
    this.dataInicio = ymdToDdMmYyyy(primeiroDiaMesYmd());
    this.dataFim = ymdToDdMmYyyy(ymdHoje());
    this.filtroNatureza = 'todos';
    this.carregar();
  }

  get linhasFiltradas(): FinTransacaoLinhaUi[] {
    let list = [...this.linhasFonte];
    if (this.filtroNatureza === 'receita') {
      list = list.filter((r) => r.linhaReceita);
    } else if (this.filtroNatureza === 'despesa') {
      list = list.filter((r) => !r.linhaReceita);
    }
    const q = this.busca.trim().toLowerCase();
    if (q) {
      list = list.filter((row) => this.linhaMatchesBusca(row, q));
    }
    const dir = this.ordenacaoData === 'asc' ? 1 : -1;
    return list.sort((a, b) => a.dataYmd.localeCompare(b.dataYmd) * dir);
  }

  get linhasPagina(): FinTransacaoLinhaUi[] {
    const start = (this.pagina - 1) * this.itensPorPagina;
    return this.linhasFiltradas.slice(start, start + this.itensPorPagina);
  }

  get totalPaginas(): number {
    const n = this.linhasFiltradas.length;
    return Math.max(1, Math.ceil(n / this.itensPorPagina) || 1);
  }

  get podePaginaAnterior(): boolean {
    return this.pagina > 1;
  }

  get podePaginaSeguinte(): boolean {
    return this.pagina < this.totalPaginas;
  }

  totalExibido(): number {
    return this.linhasFiltradas.length;
  }

  private linhaMatchesBusca(row: FinTransacaoLinhaUi, q: string): boolean {
    const blob = [
      row.titular,
      row.subtitulo,
      row.origem,
      row.formaPagamento,
      row.categoria,
      row.conta,
      row.status,
      this.formatarData(row.dataYmd),
      row.dataYmd,
    ]
      .join(' ')
      .toLowerCase();
    return blob.includes(q);
  }

  private dispararPulsoToolbar(which: 'busca' | 'filtro'): void {
    if (which === 'busca') {
      if (this.tPulsoBusca != null) window.clearTimeout(this.tPulsoBusca);
      this.pulsoToolbarBusca = false;
      queueMicrotask(() => {
        this.pulsoToolbarBusca = true;
        this.tPulsoBusca = window.setTimeout(() => {
          this.pulsoToolbarBusca = false;
        }, this.duracaoPulsoToolbarMs);
      });
    } else {
      if (this.tPulsoFiltro != null) window.clearTimeout(this.tPulsoFiltro);
      this.pulsoToolbarFiltro = false;
      queueMicrotask(() => {
        this.pulsoToolbarFiltro = true;
        this.tPulsoFiltro = window.setTimeout(() => {
          this.pulsoToolbarFiltro = false;
        }, this.duracaoPulsoToolbarMs);
      });
    }
  }

  private mostrarMensagemAcao(texto: string): void {
    if (this.tMensagemAcao != null) window.clearTimeout(this.tMensagemAcao);
    this.mensagemAcao = texto;
    this.tMensagemAcao = window.setTimeout(() => {
      this.mensagemAcao = null;
    }, 4000);
  }

  private formatarMoeda(n: number): string {
    return new Intl.NumberFormat('pt-BR', {
      style: 'currency',
      currency: 'BRL',
    }).format(n);
  }

  onSortDataMouseEnter(): void {
    if (!this.dataSortTipSuprimida) {
      this.dataSortTipVisivel = true;
    }
  }

  onSortDataMouseLeave(): void {
    this.dataSortTipVisivel = false;
    this.dataSortTipSuprimida = false;
  }

  onOrdenarDataClick(event: MouseEvent): void {
    this.ordenacaoData = this.ordenacaoData === 'asc' ? 'desc' : 'asc';
    this.pagina = 1;
    this.dataSortTipVisivel = false;
    this.dataSortTipSuprimida = true;
    (event.currentTarget as HTMLButtonElement | null)?.blur();
  }

  tooltipOrdenacaoData(): string {
    return this.ordenacaoData === 'asc'
      ? 'Clique organiza por descendente'
      : 'Clique organiza por ascendente';
  }

  formatarData(ymd: string): string {
    const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(ymd.trim().slice(0, 10));
    if (!m) return ymd;
    return `${m[3]}/${m[2]}/${m[1]}`;
  }

  rotuloStatusTransacao(row: FinTransacaoLinhaUi): string {
    return row.status === 'pago' ? 'Pago' : 'Atrasado';
  }

  classeBadgeStatusTransacao(row: FinTransacaoLinhaUi): string {
    return row.status === 'pago' ? 'badge--ok' : 'badge--atraso';
  }

  podeAbrirPerfilTitular(row: FinTransacaoLinhaUi): boolean {
    return !!row.clienteId?.trim();
  }

  abrirPerfilTitular(row: FinTransacaoLinhaUi, ev: Event): void {
    ev.preventDefault();
    ev.stopPropagation();
    const cid = row.clienteId?.trim();
    if (!cid) return;
    this.cadastroDrawer.abrirEdicaoPorLinkSidebar(cid, {}, {
      nomeLista: row.titular.trim(),
    });
  }

  /** Coluna «Estornar»: reverte pagamento da comanda (não indica estado pago). */
  podeEstornarComanda(row: FinTransacaoLinhaUi): boolean {
    if (!this.podeVerComanda(row)) return false;
    if (row.tipoLinha !== 'movimentacao' || !row.pagoToggle) return false;
    const idAt = row.idAtendimento?.trim();
    if (!idAt) return false;
    if (row.comandaPagamentoId != null && row.comandaPagamentoId > 0) {
      return true;
    }
    return row.movimentacaoId != null && row.movimentacaoId > 0;
  }

  estornarDesabilitado(row: FinTransacaoLinhaUi): boolean {
    return this.liquidandoPagoId === row.id || !this.podeEstornarComanda(row);
  }

  tooltipEstornar(row: FinTransacaoLinhaUi): string {
    return this.podeEstornarComanda(row) ? 'Clique para estornar' : '';
  }

  onEstornarComanda(row: FinTransacaoLinhaUi, ev: Event): void {
    ev.stopPropagation();
    if (this.estornarDesabilitado(row) || this.liquidandoPagoId != null) {
      return;
    }
    if (
      !confirm(
        'Estornar este pagamento? O valor voltará para a comanda em aberto.',
      )
    ) {
      return;
    }
    this.liquidandoPagoId = row.id;
    this.executarEstornoComanda(row).subscribe({
      next: () => {
        this.liquidandoPagoId = null;
        this.carregar();
        this.mostrarMensagemAcao('Pagamento estornado.');
      },
      error: (e: Error) => {
        this.liquidandoPagoId = null;
        this.mostrarMensagemAcao(
          e.message || 'Não foi possível estornar o pagamento.',
        );
      },
    });
  }

  private executarEstornoComanda(row: FinTransacaoLinhaUi) {
    const idAt = row.idAtendimento!.trim();
    const pagId = row.comandaPagamentoId;
    if (pagId != null && pagId > 0) {
      return this.api.excluirComandaPagamento(idAt, pagId);
    }
    const movId = row.movimentacaoId;
    return this.api.listComandaPagamentos(idAt).pipe(
      switchMap(({ items }) => {
        const alvo = items.find((p) => p.movimentacao_id === movId);
        if (!alvo?.id) {
          throw new Error(
            'Pagamento da comanda não encontrado para estornar.',
          );
        }
        return this.api.excluirComandaPagamento(idAt, alvo.id);
      }),
    );
  }

  linhaSelecionada(id: number): boolean {
    return this.selecionados().has(id);
  }

  todosSelecionados(): boolean {
    const pag = this.linhasPagina;
    return pag.length > 0 && pag.every((r) => this.selecionados().has(r.id));
  }

  toggleLinha(id: number, ev: Event): void {
    const checked = (ev.target as HTMLInputElement).checked;
    this.selecionados.update((atual) => {
      const next = new Set(atual);
      if (checked) next.add(id);
      else next.delete(id);
      return next;
    });
  }

  toggleTodos(ev: Event): void {
    const checked = (ev.target as HTMLInputElement).checked;
    if (checked) {
      this.selecionados.update((atual) => {
        const next = new Set(atual);
        for (const r of this.linhasPagina) next.add(r.id);
        return next;
      });
    } else {
      this.selecionados.update((atual) => {
        const next = new Set(atual);
        for (const r of this.linhasPagina) next.delete(r.id);
        return next;
      });
    }
  }

  onBuscaWrapClick(): void {
    this.dispararPulsoToolbar('busca');
    this.buscaAberta = !this.buscaAberta;
  }

  onBuscaEnter(ev: Event): void {
    ev.preventDefault();
    this.pagina = 1;
  }

  toggleFiltros(): void {
    this.dispararPulsoToolbar('filtro');
    this.filtrosAbertos = !this.filtrosAbertos;
  }

  toggleFiltroNatureza(n: FiltroNatureza): void {
    this.filtroNatureza = n;
    this.pagina = 1;
  }

  calcularTotais(): void {
    const linhas = this.linhasFiltradas;
    let bruto = 0;
    let liquido = 0;
    for (const row of linhas) {
      bruto += row.valorBruto;
      liquido += row.valorLiquido;
    }
    this.mostrarMensagemAcao(
      `Totais (${linhas.length} linha${linhas.length === 1 ? '' : 's'}): bruto ${this.formatarMoeda(bruto)}, líquido ${this.formatarMoeda(liquido)}`,
    );
  }

  toggleNovoMenu(ev: Event): void {
    ev.stopPropagation();
    this.novoMenuAberto = !this.novoMenuAberto;
  }

  abrirNovoRecebimento(): void {
    this.novoMenuAberto = false;
    this.modalNovoNatureza.set('receita');
    this.modalNovoAberto.set(true);
  }

  abrirNovoDespesa(): void {
    this.novoMenuAberto = false;
    this.modalNovoNatureza.set('despesa');
    this.modalNovoAberto.set(true);
  }

  abrirNovoVale(): void {
    this.novoMenuAberto = false;
    this.mostrarMensagemAcao('Cadastro de vale em breve.');
  }

  abrirNovoTransferencia(): void {
    this.novoMenuAberto = false;
    this.mostrarMensagemAcao('Transferência em breve.');
  }

  fecharModalNovo(): void {
    if (!this.modalNovoSalvando()) {
      this.modalNovoAberto.set(false);
      this.modalNovoNatureza.set(null);
    }
  }

  onConfirmarNovo(ev: FinTransacaoNovoSubmit): void {
    this.modalNovoSalvando.set(true);
    const done = () => {
      this.modalNovoSalvando.set(false);
      this.modalNovoAberto.set(false);
      this.modalNovoNatureza.set(null);
      this.carregar();
      this.mostrarMensagemAcao('Lançamento registado.');
    };
    const fail = (e: Error) => {
      this.modalNovoSalvando.set(false);
      this.mostrarMensagemAcao(
        e.message || 'Não foi possível guardar o lançamento.',
      );
    };

    if (ev.natureza === 'despesa') {
      this.api
        .createDespesa({
          data_mov: ev.data_mov,
          valor: ev.valor,
          categoria_id: ev.categoria_id,
          descricao: ev.descricao,
          metodo_pagamento: ev.metodo_pagamento,
        })
        .subscribe({ next: () => done(), error: fail });
    } else {
      this.api
        .createMovimentacao({
          data_mov: ev.data_mov,
          natureza: 'receita',
          valor: ev.valor,
          categoria_id: ev.categoria_id,
          descricao: ev.descricao,
          metodo_pagamento: ev.metodo_pagamento,
        })
        .subscribe({ next: () => done(), error: fail });
    }
  }

  podeVerComanda(row: FinTransacaoLinhaUi): boolean {
    const id = String(row.idAtendimento ?? '').trim();
    return id.length > 0 && row.origem.startsWith('C#');
  }

  podeAbrirEditarDrawer(row: FinTransacaoLinhaUi): boolean {
    return (
      row.tipoLinha === 'movimentacao' &&
      row.movimentacaoId != null &&
      row.movimentacaoId > 0
    );
  }

  podeExcluirNoMenu(row: FinTransacaoLinhaUi): boolean {
    if (this.podeEditarExcluir(row)) return true;
    return this.podeEstornarComanda(row);
  }

  linhaTemAcoes(row: FinTransacaoLinhaUi): boolean {
    return this.podeAbrirEditarDrawer(row);
  }

  @HostListener('document:click')
  fecharMenuAcaoDocumento(): void {
    this.menuAcaoAbertoId = null;
    this.novoMenuAberto = false;
    this.perPageMenuAberto = false;
  }

  /**
   * ESC: fecha a camada superior (drawers empilhados — ver `styles/drawer-stack.scss`).
   */
  @HostListener('document:keydown.escape', ['$event'])
  onEscapeGlobal(ev: KeyboardEvent): void {
    if (this.modalNovoAberto()) {
      if (!this.modalNovoSalvando()) {
        ev.preventDefault();
        this.fecharModalNovo();
      }
      return;
    }
    if (this.faturarDrawerAberto) {
      ev.preventDefault();
      this.fecharFaturarDrawer();
      return;
    }
    if (this.comandaPainelAberto) {
      ev.preventDefault();
      this.fecharComandaDrawer();
      return;
    }
    if (this.editarDrawerAberto) {
      if (!this.editarSalvando()) {
        ev.preventDefault();
        this.fecharEditarDrawer();
      }
      return;
    }
    if (this.filtrosAbertos) {
      ev.preventDefault();
      this.filtrosAbertos = false;
      return;
    }
    if (this.menuAcaoAbertoId != null) {
      ev.preventDefault();
      this.menuAcaoAbertoId = null;
      return;
    }
    if (this.perPageMenuAberto) {
      ev.preventDefault();
      this.perPageMenuAberto = false;
    }
  }

  toggleMenuAcao(row: FinTransacaoLinhaUi, ev: Event): void {
    ev.stopPropagation();
    this.menuAcaoAbertoId =
      this.menuAcaoAbertoId === row.id ? null : row.id;
  }

  onAcaoEditarLinha(row: FinTransacaoLinhaUi): void {
    if (!this.podeAbrirEditarDrawer(row)) return;
    this.editarLinha = row;
    this.abrirDrawerComAnimacao(
      () => {
        this.editarDrawerAberto = true;
      },
      (open) => {
        this.editarDrawerPanelOpen = open;
      },
    );
  }

  fecharEditarDrawer(): void {
    if (!this.editarDrawerAberto) return;
    this.editarDrawerPanelOpen = false;
    if (this.editarDrawerCloseTimer != null) {
      clearTimeout(this.editarDrawerCloseTimer);
    }
    this.editarDrawerCloseTimer = setTimeout(() => {
      this.editarDrawerCloseTimer = null;
      this.editarDrawerAberto = false;
      this.editarLinha = null;
      if (
        !this.comandaPainelAberto &&
        !this.faturarDrawerAberto
      ) {
        this.desbloquearScrollPagina();
      }
    }, DRAWER_ANIM_MS);
  }

  onSalvarEditar(ev: FinTransacaoEditarSubmit): void {
    this.editarSalvando.set(true);
    this.api
      .patchMovimentacao(ev.movimentacaoId, {
        valor: ev.valor,
        categoria_id: ev.categoria_id,
        metodo_pagamento: ev.metodo_pagamento,
        descricao: ev.descricao ?? null,
      })
      .subscribe({
        next: () => {
          this.editarSalvando.set(false);
          this.fecharEditarDrawer();
          this.carregar();
          this.mostrarMensagemAcao('Lançamento atualizado.');
        },
        error: (e: Error) => {
          this.editarSalvando.set(false);
          this.mostrarMensagemAcao(
            e.message || 'Não foi possível guardar as alterações.',
          );
        },
      });
  }

  verComanda(row: FinTransacaoLinhaUi): void {
    const idAt = String(row.idAtendimento ?? '').trim();
    if (!idAt || this.abrindoComanda) return;
    this.abrindoComanda = true;
    const numeroLinha = this.numeroComandaDeRow(row);
    this.api
      .listAgendamentos(undefined, undefined, idAt)
      .pipe(catchError(() => of([])))
      .subscribe({
        next: (items) => {
          this.abrindoComanda = false;
          const l0 = items[0];
          if (!l0) {
            this.mostrarMensagemAcao(
              'Não foi possível abrir a comanda. Pedido não encontrado.',
            );
            return;
          }
          const cid = String(l0.idCliente ?? '').trim();
          if (!cid) {
            this.mostrarMensagemAcao('Comanda sem cliente associado.');
            return;
          }
          const dataYmd = String(l0.data ?? row.dataYmd).trim().slice(0, 10);
          const nApi = l0.numeroComanda;
          const numero =
            typeof nApi === 'number' && nApi > 0
              ? nApi
              : numeroLinha > 0
                ? numeroLinha
                : 1;
          const nomeLista = String(l0.nomeCliente ?? row.titular ?? '').trim();
          forkJoin({
            cliente: this.api.getCliente(cid).pipe(catchError(() => of(null))),
          }).subscribe({
            next: ({ cliente }) => {
              this.abrirDrawerComanda({
                acessar: true,
                idAtendimento: idAt,
                numeroComandaTitulo: numero,
                clienteId: cid,
                cliente,
                opcoesClientes: this.opcoesClientesParaComanda(
                  cid,
                  nomeLista,
                  cliente,
                ),
                dataYmd: /^\d{4}-\d{2}-\d{2}$/.test(dataYmd) ? dataYmd : null,
                linhasSnapshot: [],
              });
            },
          });
        },
        error: () => {
          this.abrindoComanda = false;
          this.mostrarMensagemAcao('Não foi possível carregar a comanda.');
        },
      });
  }

  private numeroComandaDeRow(row: FinTransacaoLinhaUi): number {
    const n = row.numeroComanda;
    if (typeof n === 'number' && n > 0) return n;
    const m = /^C#\s*(\d+)/i.exec(String(row.origem ?? '').trim());
    if (m?.[1]) {
      const p = Number.parseInt(m[1], 10);
      if (Number.isFinite(p) && p > 0) return p;
    }
    return 0;
  }

  private opcoesClientesParaComanda(
    cid: string,
    nomeLista: string,
    cliente: Cliente | null,
  ): SaasSelectOption[] {
    const label =
      cliente?.nome?.trim() || nomeLista || cid || '—';
    return [{ value: cid, label }];
  }

  private abrirDrawerComanda(ctx: ComandaDrawerContextoAgenda): void {
    this.comandaDrawerContexto = ctx;
    const y = (ctx.dataYmd ?? '').trim();
    this.comandaDataYmdParaFaturar =
      /^\d{4}-\d{2}-\d{2}$/.test(y) ? y : null;
    this.abrirDrawerComAnimacao(
      () => {
        this.comandaPainelAberto = true;
      },
      (open) => {
        this.comandaDrawerPanelOpen = open;
      },
    );
  }

  fecharComandaDrawer(): void {
    if (!this.comandaPainelAberto) return;
    this.comandaDrawerPanelOpen = false;
    if (this.faturarDrawerAberto) {
      this.fecharFaturarDrawer();
    }
    if (this.comandaDrawerCloseTimer != null) {
      clearTimeout(this.comandaDrawerCloseTimer);
    }
    this.comandaDrawerCloseTimer = setTimeout(() => {
      this.comandaDrawerCloseTimer = null;
      this.comandaPainelAberto = false;
      this.comandaDrawerContexto = null;
      this.comandaDataYmdParaFaturar = null;
      this.desbloquearScrollPagina();
    }, DRAWER_ANIM_MS);
  }

  onComandaExcluida(): void {
    this.fecharComandaDrawer();
    this.carregar();
  }

  onComandaDataYmdAlterada(ymd: string | null): void {
    this.comandaDataYmdParaFaturar = ymd;
  }

  onAbrirFaturarComanda(ev: {
    idAtendimento: string;
    resumo: ComandaResumoPagamentos;
    creditoAUsar?: number;
    dataComandaYmd?: string | null;
    modoVerPagamentos?: boolean;
  }): void {
    this.comandaDataYmdParaFaturar =
      ev.dataComandaYmd ?? this.comandaDataYmdParaFaturar;
    this.faturarCtx = {
      idAtendimento: ev.idAtendimento,
      resumo: ev.resumo,
      creditoAUsar: ev.creditoAUsar,
      modoVerPagamentos: ev.modoVerPagamentos ?? false,
    };
    this.abrirDrawerComAnimacao(
      () => {
        this.faturarDrawerAberto = true;
      },
      (open) => {
        this.faturarDrawerPanelOpen = open;
      },
    );
  }

  fecharFaturarDrawer(): void {
    if (!this.faturarDrawerAberto) return;
    this.faturarDrawerPanelOpen = false;
    if (this.faturarDrawerCloseTimer != null) {
      clearTimeout(this.faturarDrawerCloseTimer);
    }
    this.faturarDrawerCloseTimer = setTimeout(() => {
      this.faturarDrawerCloseTimer = null;
      this.faturarDrawerAberto = false;
      this.faturarCtx = null;
      if (!this.comandaPainelAberto) {
        this.desbloquearScrollPagina();
      }
      this.comandaDrawerRef?.recarregarAposFaturar();
    }, DRAWER_ANIM_MS);
  }

  onFaturaComandaSucesso(): void {
    this.fecharFaturarDrawer();
    this.carregar();
  }

  onAbrirCadastroClienteDaComanda(
    payload: AbrirCadastroClientePayload = {},
  ): void {
    const cid = this.comandaDrawerContexto?.clienteId?.trim();
    if (!cid) return;
    const nomeLista =
      this.comandaDrawerContexto?.cliente?.nome?.trim() ?? '';
    this.cadastroDrawer.abrirEdicaoPorLinkSidebar(cid, payload, {
      nomeLista,
      callbacks: {
        onClienteCarregado: (c) => {
          if (this.comandaDrawerContexto?.clienteId?.trim() === cid) {
            this.comandaDrawerContexto = {
              ...this.comandaDrawerContexto!,
              cliente: c,
            };
          }
        },
        onSalvo: (salvo) => {
          const cidSalvo = (salvo.id ?? cid).trim();
          if (
            cidSalvo &&
            this.comandaDrawerContexto?.clienteId?.trim() === cidSalvo
          ) {
            this.comandaDrawerContexto = {
              ...this.comandaDrawerContexto!,
              cliente: salvo,
            };
            this.comandaDrawerRef?.recarregarClienteAposSalvarFicha(cidSalvo);
          }
        },
      },
    });
  }

  ariaLabelComandaDrawer(): string {
    return this.comandaDrawerContexto?.idAtendimento?.trim()
      ? 'Visualizando comanda'
      : 'Comanda';
  }

  private abrirDrawerComAnimacao(
    marcarDrawerAberto: () => void,
    setPanelOpen: (open: boolean) => void,
  ): void {
    marcarDrawerAberto();
    if (!this.pageScrollLockAtivo) {
      this.bloquearScrollPagina();
    }
    setPanelOpen(false);
    queueMicrotask(() => {
      requestAnimationFrame(() => {
        requestAnimationFrame(() => {
          setPanelOpen(true);
        });
      });
    });
  }

  private obterLarguraScrollbar(): number {
    if (typeof window === 'undefined' || typeof document === 'undefined') {
      return 0;
    }
    return Math.max(0, window.innerWidth - document.documentElement.clientWidth);
  }

  private bloquearScrollPagina(): void {
    if (this.pageScrollLockAtivo) return;
    this.bodyScrollPreDrawer = window.scrollY || 0;
    const gutter = this.obterLarguraScrollbar();
    const body = document.body;
    body.style.position = 'fixed';
    body.style.top = `-${this.bodyScrollPreDrawer}px`;
    body.style.left = '0';
    body.style.right = '0';
    body.style.width = '100%';
    if (gutter > 0) {
      body.style.paddingRight = `${gutter}px`;
    }
    this.pageScrollLockAtivo = true;
  }

  private desbloquearScrollPagina(): void {
    if (!this.pageScrollLockAtivo) return;
    const body = document.body;
    body.style.position = '';
    body.style.top = '';
    body.style.left = '';
    body.style.right = '';
    body.style.width = '';
    body.style.paddingRight = '';
    this.pageScrollLockAtivo = false;
    window.scrollTo(0, this.bodyScrollPreDrawer);
  }

  podeEditarExcluir(row: FinTransacaoLinhaUi): boolean {
    return (
      row.editavel === true &&
      row.movimentacaoId != null &&
      row.movimentacaoId > 0
    );
  }

  excluirLinha(row: FinTransacaoLinhaUi): void {
    if (this.podeEstornarComanda(row)) {
      if (
        !confirm(
          'Excluir este pagamento? O valor voltará para a comanda em aberto.',
        )
      ) {
        return;
      }
      this.excluindoId = row.id;
      this.executarEstornoComanda(row).subscribe({
        next: () => {
          this.excluindoId = null;
          this.carregar();
          this.mostrarMensagemAcao('Pagamento excluído.');
        },
        error: (e: Error) => {
          this.excluindoId = null;
          this.mostrarMensagemAcao(
            e.message || 'Não foi possível excluir o pagamento.',
          );
        },
      });
      return;
    }

    const movId = row.movimentacaoId;
    if (movId == null || movId <= 0 || !row.editavel) return;
    if (
      !confirm(
        'Eliminar este lançamento? Esta ação não pode ser desfeita pelo app.',
      )
    ) {
      return;
    }
    this.excluindoId = movId;
    this.api.deleteMovimentacao(movId).subscribe({
      next: () => {
        this.excluindoId = null;
        this.carregar();
        this.mostrarMensagemAcao('Lançamento eliminado.');
      },
      error: (e: Error) => {
        this.excluindoId = null;
        this.mostrarMensagemAcao(
          e.message || 'Não foi possível eliminar o lançamento.',
        );
      },
    });
  }

  paginaAnterior(): void {
    if (this.podePaginaAnterior) this.pagina--;
  }

  paginaSeguinte(): void {
    if (this.podePaginaSeguinte) this.pagina++;
  }

  alterarItensPorPagina(n: number): void {
    this.itensPorPagina = n;
    this.pagina = 1;
    this.perPageMenuAberto = false;
  }
}
