import { CurrencyPipe, registerLocaleData } from '@angular/common';
import localePt from '@angular/common/locales/pt';
import { Component, LOCALE_ID, OnInit, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { Router, RouterLink } from '@angular/router';
import { parseFiltroDataDdMm } from '../../../../core/utils/atendimento-display';
import { SheetsApiService } from '../../../../core/services/sheets-api.service';
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

@Component({
  selector: 'app-financeiro-transacoes',
  standalone: true,
  imports: [
    CurrencyPipe,
    FormsModule,
    FinTransacaoNovoModalComponent,
  ],
  providers: [{ provide: LOCALE_ID, useValue: 'pt-BR' }],
  templateUrl: './financeiro-transacoes.component.html',
  styleUrl: './financeiro-transacoes.component.scss',
})
export class FinanceiroTransacoesComponent implements OnInit {
  private readonly api = inject(SheetsApiService);
  private readonly router = inject(Router);

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
  filtrosAbertos = false;
  pulsoToolbarBusca = false;
  pulsoToolbarFiltro = false;
  mensagemAcao: string | null = null;

  readonly modalNovoAberto = signal(false);
  readonly modalNovoSalvando = signal(false);

  private readonly duracaoPulsoToolbarMs = 600;
  private tPulsoBusca: ReturnType<typeof setTimeout> | null = null;
  private tPulsoFiltro: ReturnType<typeof setTimeout> | null = null;
  private tMensagemAcao: ReturnType<typeof setTimeout> | null = null;

  private readonly selecionados = signal<ReadonlySet<number>>(new Set());
  excluindoId: number | null = null;

  ngOnInit(): void {
    this.carregar();
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

  novoTransacao(): void {
    this.modalNovoAberto.set(true);
  }

  fecharModalNovo(): void {
    if (!this.modalNovoSalvando()) this.modalNovoAberto.set(false);
  }

  onConfirmarNovo(ev: FinTransacaoNovoSubmit): void {
    this.modalNovoSalvando.set(true);
    const done = () => {
      this.modalNovoSalvando.set(false);
      this.modalNovoAberto.set(false);
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

  verComanda(row: FinTransacaoLinhaUi): void {
    const id = String(row.idAtendimento ?? '').trim();
    if (!id) return;
    void this.router.navigate(['/comandas'], {
      queryParams: { comanda: id },
    });
  }

  podeEditarExcluir(row: FinTransacaoLinhaUi): boolean {
    return (
      row.editavel === true &&
      row.movimentacaoId != null &&
      row.movimentacaoId > 0
    );
  }

  excluirLinha(row: FinTransacaoLinhaUi): void {
    const movId = row.movimentacaoId;
    if (movId == null || movId <= 0) return;
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
