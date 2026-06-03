import { CurrencyPipe, DecimalPipe } from '@angular/common';
import {
  Component,
  computed,
  HostListener,
  inject,
  LOCALE_ID,
  OnDestroy,
  OnInit,
  signal,
  ViewChild,
} from '@angular/core';
import { SaasSelectComponent } from '../../../agenda/pages/novo/saas-select.component';
import { FormsModule } from '@angular/forms';
import { registerLocaleData } from '@angular/common';
import localePt from '@angular/common/locales/pt';
import { catchError, of } from 'rxjs';
import type { Cliente } from '../../../../core/models/api.models';
import type {
  FinComissaoDetalheItem,
  FinComissaoPagaItem,
  FinComissaoResumidaItem,
} from '../../../../core/models/api.models';
import type { ComandaDrawerContextoAgenda } from '../../../agenda/pages/hub/comanda-drawer.types';
import { NovaComandaDrawerComponent } from '../../../agenda/pages/hub/nova-comanda-drawer.component';
import type { SaasSelectOption } from '../../../agenda/pages/novo/saas-select.component';
import { SheetsApiService } from '../../../../core/services/sheets-api.service';
import { FinanceiroComissoesPrintComponent } from './financeiro-comissoes-print.component';
import {
  FinComissoesPagarDrawerComponent,
  type FinComissaoPagarConfirmPayload,
  type FinComissaoPagarResumo,
} from './fin-comissoes-pagar-drawer.component';
import { AppToastService } from '../../../../shared/app-toast/app-toast.service';
import { ClienteDrawerPeriodoFiltroComponent } from '../../../../shared/cliente-drawer-periodo-filtro/cliente-drawer-periodo-filtro.component';
import {
  ClienteCadastroDrawerService,
  type AbrirCadastroClientePayload,
} from '../../../../shared/cliente-cadastro-drawer/cliente-cadastro-drawer.service';
import { abrirCadastroClienteDesdeSidebarComanda } from '../../../../shared/cliente-cadastro-drawer/comanda-drawer-sidebar-cadastro.util';
import { ProfissionalCadastroDrawerService } from '../../../../shared/profissional-cadastro-drawer/profissional-cadastro-drawer.service';
import { FinFiltrosFloatingTipComponent } from '../transacoes/fin-filtros-floating-tip.component';

const DRAWER_ANIM_MS = 430;

registerLocaleData(localePt);

export type FinComissaoTab = 'detalhadas' | 'pagas';

export interface FinComissaoProfissionalUi {
  id: number;
  nome: string;
  telefone: string;
}

export interface FinComissaoPagaLinhaUi {
  movimentacaoId: number;
  dataYmd: string;
  pagamentoYmd: string;
  profissionalNome: string;
  usuarioNome: string;
  comissoes: number;
  vales: number;
  bonificacoes: number;
  valorPago: number;
}

export interface FinComissaoLinhaUi {
  id: number;
  dataYmd: string;
  clienteNome: string;
  clienteNumero: number;
  idAtendimento?: string | null;
  idCliente?: string | null;
  numeroComanda?: number | null;
  servico: string;
  quantidade: number;
  valor: number;
  taxaAcumulada: string | null;
  comissaoPct: number;
  comissaoTipo: string;
  descontoAuxiliares: string | null;
  disponivel: number;
}

@Component({
  selector: 'app-financeiro-comissoes',
  standalone: true,
  imports: [
    CurrencyPipe,
    DecimalPipe,
    FormsModule,
    FinanceiroComissoesPrintComponent,
    FinComissoesPagarDrawerComponent,
    ClienteDrawerPeriodoFiltroComponent,
    NovaComandaDrawerComponent,
    SaasSelectComponent,
    FinFiltrosFloatingTipComponent,
  ],
  providers: [{ provide: LOCALE_ID, useValue: 'pt-BR' }],
  templateUrl: './financeiro-comissoes.component.html',
  styleUrl: './financeiro-comissoes.component.scss',
})
export class FinanceiroComissoesComponent implements OnInit, OnDestroy {
  private readonly toast = inject(AppToastService);
  private readonly api = inject(SheetsApiService);
  private readonly cadastroDrawer = inject(ClienteCadastroDrawerService);
  private readonly profissionalDrawer = inject(ProfissionalCadastroDrawerService);

  @ViewChild(NovaComandaDrawerComponent)
  private comandaDrawerRef?: NovaComandaDrawerComponent;

  private readonly comandaContextoHolder = {
    get: () => this.comandaDrawerContexto,
    set: (ctx: ComandaDrawerContextoAgenda) => {
      this.comandaDrawerContexto = ctx;
    },
  };

  pagarDrawerAberto = false;
  pagarDrawerPanelOpen = false;
  private pagarDrawerCloseTimer: ReturnType<typeof setTimeout> | null = null;

  comandaPainelAberto = false;
  comandaDrawerPanelOpen = false;
  comandaDrawerContexto: ComandaDrawerContextoAgenda | null = null;
  private comandaDrawerCloseTimer: ReturnType<typeof setTimeout> | null = null;
  private abrindoComanda = false;
  private pageScrollLockAtivo = false;
  private bodyScrollPreDrawer = 0;
  private carregarLinhasSeq = 0;
  private carregarPagasSeq = 0;

  assinadasDigitalmenteFiltro: 'todas' | 'sim' | 'nao' = 'todas';

  readonly tabs: { id: FinComissaoTab; label: string }[] = [
    { id: 'detalhadas', label: 'Detalhadas' },
    { id: 'pagas', label: 'Pagas' },
  ];

  readonly profissionais = signal<FinComissaoProfissionalUi[]>([]);

  readonly profissionaisSelectOptions = computed(() =>
    this.profissionais().map((p) => ({
      value: String(p.id),
      label: p.nome,
    })),
  );
  readonly linhasDetalhe = signal<FinComissaoLinhaUi[]>([]);
  readonly linhasPagas = signal<FinComissaoPagaLinhaUi[]>([]);
  readonly erroCarregamento = signal('');
  readonly menuAcoesPagasAberto = signal<number | null>(null);
  readonly resumoFolha = signal<{
    totalComissao: number;
    totalPago: number;
    saldo: number;
  } | null>(null);

  readonly vista = signal<'filtros' | 'detalhe'>('filtros');
  readonly tabAtiva = signal<FinComissaoTab>('detalhadas');
  readonly profissionalSelecionado = signal<FinComissaoProfissionalUi | null>(
    null,
  );
  readonly sidebarAberto = signal(true);
  readonly carregando = signal(false);

  periodoInicio = '';
  periodoFim = '';
  mostrarAnteriores = false;
  profissionalIdSidebar: number | null = null;

  private readonly selecionados = signal<ReadonlySet<number>>(new Set());

  readonly totalComissoes = computed(() => {
    const sel = this.selecionados();
    let sum = 0;
    for (const row of this.linhasDetalhe()) {
      if (!sel.has(row.id)) continue;
      sum += row.disponivel;
    }
    return Math.round(sum * 100) / 100;
  });

  readonly podePagar = computed(() => this.selecionados().size > 0);

  readonly totalComissoesLista = computed(() => {
    let sum = 0;
    for (const row of this.linhasDetalhe()) {
      sum += row.disponivel;
    }
    return Math.round(sum * 100) / 100;
  });

  readonly totalLiquidoImpressao = computed(() => this.totalComissoesLista());

  readonly resumoPagar = computed(
    (): FinComissaoPagarResumo => ({
      comissoes: this.totalComissoes(),
      vales: 0,
      bonificacoes: 0,
      bloqueado: 0,
      liquido: this.totalComissoes(),
    }),
  );

  ngOnInit(): void {
    const { inicio, fim } = this.periodoPadraoUltimos30Dias();
    this.periodoInicio = inicio;
    this.periodoFim = fim;
    this.recarregarProfissionais();
  }

  recarregarProfissionais(selecionarId?: number): void {
    this.api
      .listProfissionais()
      .pipe(
        catchError((e: Error) => {
          this.erroCarregamento.set(
            e.message || 'Não foi possível carregar os profissionais.',
          );
          return of([]);
        }),
      )
      .subscribe((items) => {
        const lista = items
          .filter((p) => p.id > 0)
          .map((p) => ({
            id: p.id,
            nome: p.nome,
            telefone: p.celular ?? '',
          }));
        this.profissionais.set(lista);
        if (selecionarId != null) {
          this.profissionalIdSidebar = selecionarId;
        } else if (lista.length > 0 && this.profissionalIdSidebar == null) {
          this.profissionalIdSidebar = lista[0].id;
        }
      });
  }

  ngOnDestroy(): void {
    if (this.pagarDrawerCloseTimer != null) {
      clearTimeout(this.pagarDrawerCloseTimer);
    }
    if (this.comandaDrawerCloseTimer != null) {
      clearTimeout(this.comandaDrawerCloseTimer);
    }
    this.desbloquearScrollPagina();
  }

  @HostListener('document:click')
  onDocumentClick(): void {
    this.fecharMenuAcoesPagas();
  }

  @HostListener('document:keydown.escape', ['$event'])
  onEscapeGlobal(ev: KeyboardEvent): void {
    if (this.comandaPainelAberto) {
      ev.preventDefault();
      this.fecharComandaDrawer();
      return;
    }
    if (this.pagarDrawerAberto) {
      ev.preventDefault();
      this.fecharPagarDrawer();
    }
  }

  periodoLabel(): string {
    return `${this.ymdParaDdMm(this.periodoInicio)} → ${this.ymdParaDdMm(this.periodoFim)}`;
  }

  nomeProfissionalAtual(): string {
    const id = this.profissionalIdSidebar;
    const porId = this.profissionais().find((p) => p.id === id);
    if (porId?.nome) return porId.nome;
    return this.profissionalSelecionado()?.nome ?? '—';
  }

  formatarData(ymd: string): string {
    return this.ymdParaDdMm(ymd);
  }

  rotuloNumeroComanda(row: FinComissaoLinhaUi): number {
    const n = row.numeroComanda ?? row.clienteNumero;
    return Number.isFinite(n) && n > 0 ? n : row.clienteNumero;
  }

  podeAbrirComanda(row: FinComissaoLinhaUi): boolean {
    return !!String(row.idAtendimento ?? '').trim();
  }

  abrirComanda(row: FinComissaoLinhaUi, ev: Event): void {
    ev.preventDefault();
    ev.stopPropagation();
    const idAt = String(row.idAtendimento ?? '').trim();
    if (!idAt || this.abrindoComanda) return;

    const cid = String(row.idCliente ?? '').trim();
    const numero = this.rotuloNumeroComanda(row);
    const dataYmd = String(row.dataYmd ?? '').trim().slice(0, 10);
    const nomeLista = String(row.clienteNome ?? '').trim();

    const abrirComCliente = (cliente: Cliente | null) => {
      if (!cid) {
        this.toast.show('Comanda sem cliente associado.');
        return;
      }
      this.abrirDrawerComanda({
        acessar: true,
        idAtendimento: idAt,
        numeroComandaTitulo: numero,
        clienteId: cid,
        cliente,
        opcoesClientes: this.opcoesClientesParaComanda(cid, nomeLista, cliente),
        dataYmd: /^\d{4}-\d{2}-\d{2}$/.test(dataYmd) ? dataYmd : null,
        linhasSnapshot: [],
      });
    };

    if (cid) {
      this.abrindoComanda = true;
      this.api
        .getCliente(cid)
        .pipe(catchError(() => of(null)))
        .subscribe({
          next: (cliente) => {
            this.abrindoComanda = false;
            abrirComCliente(cliente);
          },
          error: () => {
            this.abrindoComanda = false;
            this.toast.show('Não foi possível carregar a comanda.');
          },
        });
      return;
    }

    this.abrindoComanda = true;
    this.api
      .listAgendamentos(undefined, undefined, idAt)
      .pipe(catchError(() => of([])))
      .subscribe({
        next: (items) => {
          this.abrindoComanda = false;
          const l0 = items[0];
          const idCliente = String(l0?.idCliente ?? '').trim();
          if (!l0 || !idCliente) {
            this.toast.show(
              'Não foi possível abrir a comanda. Pedido não encontrado.',
            );
            return;
          }
          const nApi = l0.numeroComanda;
          const numeroResolvido =
            typeof nApi === 'number' && nApi > 0 ? nApi : numero;
          const ymd = String(l0.data ?? dataYmd).trim().slice(0, 10);
          this.api
            .getCliente(idCliente)
            .pipe(catchError(() => of(null)))
            .subscribe({
              next: (cliente) => {
                this.abrirDrawerComanda({
                  acessar: true,
                  idAtendimento: idAt,
                  numeroComandaTitulo: numeroResolvido,
                  clienteId: idCliente,
                  cliente,
                  opcoesClientes: this.opcoesClientesParaComanda(
                    idCliente,
                    String(l0.nomeCliente ?? nomeLista).trim(),
                    cliente,
                  ),
                  dataYmd: /^\d{4}-\d{2}-\d{2}$/.test(ymd) ? ymd : null,
                  linhasSnapshot: [],
                });
              },
            });
        },
        error: () => {
          this.abrindoComanda = false;
          this.toast.show('Não foi possível carregar a comanda.');
        },
      });
  }

  fecharComandaDrawer(): void {
    if (!this.comandaPainelAberto) return;
    this.comandaDrawerPanelOpen = false;
    if (this.comandaDrawerCloseTimer != null) {
      clearTimeout(this.comandaDrawerCloseTimer);
    }
    this.comandaDrawerCloseTimer = setTimeout(() => {
      this.comandaDrawerCloseTimer = null;
      this.comandaPainelAberto = false;
      this.comandaDrawerContexto = null;
      if (!this.pagarDrawerAberto) {
        this.desbloquearScrollPagina();
      }
    }, DRAWER_ANIM_MS);
  }

  onComandaExcluida(): void {
    this.fecharComandaDrawer();
    this.carregarLinhasDetalhe();
  }

  /** Links «Informações» na sidebar do drawer de comanda (ficha global + aba correta). */
  onAbrirCadastroClienteDaComanda(
    payload: AbrirCadastroClientePayload = {},
  ): void {
    abrirCadastroClienteDesdeSidebarComanda(
      this.cadastroDrawer,
      this.comandaContextoHolder,
      payload,
      (cid) => this.comandaDrawerRef?.recarregarClienteAposSalvarFicha(cid),
    );
  }

  ariaLabelComandaDrawer(): string {
    const n = this.comandaDrawerContexto?.numeroComandaTitulo;
    if (this.comandaDrawerContexto?.idAtendimento?.trim() && n != null && n > 0) {
      return `Visualizando comanda #${n}`;
    }
    return 'Visualizando comanda';
  }

  private abrirDrawerComanda(ctx: ComandaDrawerContextoAgenda): void {
    this.comandaDrawerContexto = ctx;
    this.comandaDrawerPanelOpen = false;
    this.comandaPainelAberto = true;
    if (!this.pageScrollLockAtivo) {
      this.bloquearScrollPagina();
    }
    requestAnimationFrame(() => {
      requestAnimationFrame(() => {
        this.comandaDrawerPanelOpen = true;
      });
    });
  }

  private opcoesClientesParaComanda(
    cid: string,
    nomeLista: string,
    cliente: Cliente | null,
  ): SaasSelectOption[] {
    const label = cliente?.nome?.trim() || nomeLista || cid || '—';
    return [{ value: cid, label }];
  }

  emLayoutLista(): boolean {
    return this.tabAtiva() === 'pagas' || this.vista() === 'detalhe';
  }

  selecionarTab(id: FinComissaoTab): void {
    const anterior = this.tabAtiva();
    this.tabAtiva.set(id);
    this.menuAcoesPagasAberto.set(null);
    if (id === 'pagas') {
      this.profissionalIdSidebar = null;
      this.sidebarAberto.set(true);
      this.carregarLinhasPagas();
      return;
    }
    if (anterior === 'pagas') {
      if (
        this.profissionalIdSidebar == null &&
        this.profissionais().length > 0
      ) {
        this.profissionalIdSidebar = this.profissionais()[0].id;
      }
      if (this.vista() === 'detalhe') {
        this.carregarLinhasDetalhe();
      }
    }
  }

  abrirProfissional(prof: FinComissaoProfissionalUi): void {
    this.profissionalSelecionado.set(prof);
    this.profissionalIdSidebar = prof.id;
    this.selecionados.set(new Set());
    this.sidebarAberto.set(true);
    this.vista.set('detalhe');
    this.carregarLinhasDetalhe();
    this.carregarResumoFolha();
  }

  onMostrarAnterioresChange(): void {
    if (this.vista() === 'detalhe') this.carregarLinhasDetalhe();
  }

  onPeriodoAlterado(): void {
    if (this.tabAtiva() === 'pagas') this.carregarLinhasPagas();
    else if (this.vista() === 'detalhe') {
      this.carregarLinhasDetalhe();
      this.carregarResumoFolha();
    }
  }

  onCriarProfissional(): void {
    this.profissionalDrawer.abrirNovo({
      onSalvo: (p) => {
        this.recarregarProfissionais(p.id);
        this.onProfissionalSidebarChange();
      },
    });
  }

  onProfissionalSidebarChange(): void {
    if (this.tabAtiva() === 'pagas') this.carregarLinhasPagas();
    else if (this.vista() === 'detalhe') {
      this.carregarLinhasDetalhe();
      this.carregarResumoFolha();
    }
  }

  onAssinadasFiltroChange(): void {
    if (this.tabAtiva() === 'pagas') this.carregarLinhasPagas();
  }

  toggleSidebarFiltros(): void {
    this.sidebarAberto.update((aberto) => !aberto);
  }

  imprimir(): void {
    window.print();
  }

  abrirPagarDrawer(): void {
    if (!this.podePagar()) return;
    this.pagarDrawerPanelOpen = false;
    this.pagarDrawerAberto = true;
    this.bloquearScrollPagina();
    requestAnimationFrame(() => {
      requestAnimationFrame(() => {
        this.pagarDrawerPanelOpen = true;
      });
    });
  }

  fecharPagarDrawer(): void {
    if (!this.pagarDrawerAberto) return;
    this.pagarDrawerPanelOpen = false;
    if (this.pagarDrawerCloseTimer != null) {
      clearTimeout(this.pagarDrawerCloseTimer);
    }
    this.pagarDrawerCloseTimer = setTimeout(() => {
      this.pagarDrawerCloseTimer = null;
      this.pagarDrawerAberto = false;
      if (!this.comandaPainelAberto) {
        this.desbloquearScrollPagina();
      }
    }, DRAWER_ANIM_MS);
  }

  onPagarComissoesConfirmado(ev: FinComissaoPagarConfirmPayload): void {
    const profId = this.profissionalIdSidebar;
    if (profId == null || profId <= 0) return;

    const idsPagos = [...this.selecionados()];
    if (idsPagos.length === 0) return;

    this.api
      .pagarComissoes({
        profissional_id: profId,
        data_pagamento: ev.dataPagamentoYmd,
        atendimento_ids: idsPagos,
        pagamentos: ev.pagamentos.map((p) => ({
          metodo: p.metodo,
          valor: p.valor,
        })),
      })
      .pipe(
        catchError((e: unknown) => {
          const msg =
            e instanceof Error
              ? e.message
              : 'Não foi possível registar o pagamento de comissões.';
          this.toast.show(msg);
          return of(null);
        }),
      )
      .subscribe((res) => {
        if (!res) return;
        this.toast.show('Pagamento de comissões realizado com sucesso!');
        this.fecharPagarDrawer();
        this.linhasDetalhe.update((linhas) =>
          linhas.filter((row) => !idsPagos.includes(row.id)),
        );
        this.selecionados.set(new Set());
        this.carregarLinhasPagas();
        this.carregarResumoFolha();
      });
  }

  alternarMenuAcoesPagas(movimentacaoId: number, ev: Event): void {
    ev.stopPropagation();
    this.menuAcoesPagasAberto.update((atual) =>
      atual === movimentacaoId ? null : movimentacaoId,
    );
  }

  fecharMenuAcoesPagas(): void {
    this.menuAcoesPagasAberto.set(null);
  }

  estornarPagamentoComissao(row: FinComissaoPagaLinhaUi): void {
    this.menuAcoesPagasAberto.set(null);
    if (
      !window.confirm(
        'Estornar este pagamento de comissões? As linhas voltarão à aba Detalhadas.',
      )
    ) {
      return;
    }
    this.api.estornarComissaoMovimentacao(row.movimentacaoId).subscribe({
      next: () => {
        this.toast.show('Pagamento de comissões estornado.');
        this.carregarLinhasPagas();
        if (this.vista() === 'detalhe' && this.tabAtiva() === 'detalhadas') {
          this.carregarLinhasDetalhe();
          this.carregarResumoFolha();
        }
      },
      error: (e: unknown) => {
        const msg =
          e instanceof Error
            ? e.message
            : 'Não foi possível estornar o pagamento.';
        this.toast.show(msg);
      },
    });
  }

  private bloquearScrollPagina(): void {
    if (this.pageScrollLockAtivo) return;
    this.bodyScrollPreDrawer = window.scrollY;
    const body = document.body;
    body.style.position = 'fixed';
    body.style.top = `-${this.bodyScrollPreDrawer}px`;
    body.style.left = '0';
    body.style.right = '0';
    body.style.width = '100%';
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
    this.pageScrollLockAtivo = false;
    window.scrollTo(0, this.bodyScrollPreDrawer);
  }

  atualizarLista(): void {
    if (this.tabAtiva() === 'pagas') this.carregarLinhasPagas();
    else this.carregarLinhasDetalhe();
  }

  private carregarLinhasPagas(): void {
    const di = this.periodoInicio.trim();
    const df = this.periodoFim.trim();
    if (!di || !df) {
      this.linhasPagas.set([]);
      return;
    }

    const profId = this.profissionalIdSidebar;
    const seq = ++this.carregarPagasSeq;
    this.linhasPagas.set([]);
    this.carregando.set(true);
    this.erroCarregamento.set('');

    this.api
      .listComissoesPagas({
        dataInicio: di,
        dataFim: df,
        profissionalId: profId != null && profId > 0 ? profId : null,
      })
      .pipe(
        catchError((e: Error) => {
          this.erroCarregamento.set(
            e.message ||
              'Não foi possível carregar as comissões pagas. Confirme a API.',
          );
          return of([] as FinComissaoPagaItem[]);
        }),
      )
      .subscribe((items) => {
        if (seq !== this.carregarPagasSeq) return;
        let linhas = items.map((r) => this.mapLinhaPagaApi(r));
        if (this.assinadasDigitalmenteFiltro !== 'todas') {
          linhas = [];
        }
        this.linhasPagas.set(linhas);
        this.carregando.set(false);
      });
  }

  private mapLinhaPagaApi(r: FinComissaoPagaItem): FinComissaoPagaLinhaUi {
    return {
      movimentacaoId: r.movimentacao_id,
      dataYmd: r.data_ymd,
      pagamentoYmd: r.pagamento_ymd,
      profissionalNome: r.profissional_nome,
      usuarioNome: r.usuario_nome,
      comissoes: r.comissoes,
      vales: r.vales,
      bonificacoes: r.bonificacoes,
      valorPago: r.valor_pago,
    };
  }

  /** Linhas vêm de `GET /api/financeiro/comissoes/detalhadas` → tabela `atendimentos`. */
  private carregarLinhasDetalhe(): void {
    const profId = this.profissionalIdSidebar;
    if (profId == null || profId <= 0) {
      this.linhasDetalhe.set([]);
      this.carregando.set(false);
      return;
    }
    const di = this.periodoInicio.trim();
    const df = this.periodoFim.trim();
    if (!di || !df) {
      this.linhasDetalhe.set([]);
      return;
    }

    const seq = ++this.carregarLinhasSeq;
    this.linhasDetalhe.set([]);
    this.selecionados.set(new Set());
    this.carregando.set(true);
    this.erroCarregamento.set('');
    this.api
      .listComissoesDetalhadas({
        dataInicio: di,
        dataFim: df,
        profissionalId: profId,
        mostrarAnteriores: this.mostrarAnteriores,
      })
      .pipe(
        catchError((e: Error) => {
          this.erroCarregamento.set(
            e.message ||
              'Não foi possível carregar as comissões. Confirme a API.',
          );
          return of([] as FinComissaoDetalheItem[]);
        }),
      )
      .subscribe((items) => {
        if (seq !== this.carregarLinhasSeq) return;
        this.linhasDetalhe.set(items.map((r) => this.mapLinhaApi(r)));
        this.selecionados.set(new Set());
        this.carregando.set(false);
      });
  }

  private carregarResumoFolha(): void {
    if (this.tabAtiva() !== 'detalhadas' || this.vista() !== 'detalhe') {
      this.resumoFolha.set(null);
      return;
    }
    const profId = this.profissionalIdSidebar;
    const di = this.periodoInicio.trim();
    const df = this.periodoFim.trim();
    if (profId == null || profId <= 0 || !di || !df) {
      this.resumoFolha.set(null);
      return;
    }

    this.api
      .listComissoesResumidas({
        dataInicio: di,
        dataFim: df,
        profissionalId: profId,
      })
      .pipe(catchError(() => of([] as FinComissaoResumidaItem[])))
      .subscribe((items) => {
        let totalComissao = 0;
        let totalPago = 0;
        let saldo = 0;
        for (const row of items) {
          totalComissao += row.total_comissao;
          totalPago += row.total_pago;
          saldo += row.saldo;
        }
        this.resumoFolha.set({
          totalComissao: Math.round(totalComissao * 100) / 100,
          totalPago: Math.round(totalPago * 100) / 100,
          saldo: Math.round(saldo * 100) / 100,
        });
      });
  }

  private mapLinhaApi(r: FinComissaoDetalheItem): FinComissaoLinhaUi {
    const nComanda = r.numero_comanda;
    return {
      id: r.id,
      dataYmd: r.data_ymd,
      clienteNome: r.cliente_nome,
      clienteNumero: nComanda ?? 0,
      idAtendimento: r.id_atendimento,
      idCliente: r.id_cliente,
      numeroComanda: nComanda,
      servico: r.servico,
      quantidade: r.quantidade,
      valor: r.valor,
      taxaAcumulada: null,
      comissaoPct: r.comissao_pct ?? 0,
      comissaoTipo: r.comissao_tipo,
      descontoAuxiliares: null,
      disponivel: r.disponivel,
    };
  }

  private periodoPadraoUltimos30Dias(): { inicio: string; fim: string } {
    const fim = new Date();
    const ini = new Date(fim);
    ini.setDate(ini.getDate() - 30);
    return { inicio: this.dateParaYmd(ini), fim: this.dateParaYmd(fim) };
  }

  private dateParaYmd(d: Date): string {
    const y = d.getFullYear();
    const m = String(d.getMonth() + 1).padStart(2, '0');
    const day = String(d.getDate()).padStart(2, '0');
    return `${y}-${m}-${day}`;
  }

  voltarFiltros(): void {
    this.vista.set('filtros');
    this.profissionalSelecionado.set(null);
    this.selecionados.set(new Set());
  }

  linhaSelecionada(id: number): boolean {
    return this.selecionados().has(id);
  }

  todosSelecionados(): boolean {
    const linhas = this.linhasDetalhe();
    return (
      linhas.length > 0 && linhas.every((r) => this.selecionados().has(r.id))
    );
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
      this.selecionados.set(new Set(this.linhasDetalhe().map((r) => r.id)));
    } else {
      this.selecionados.set(new Set());
    }
  }

  private ymdParaDdMm(ymd: string): string {
    const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(ymd.trim().slice(0, 10));
    if (!m) return ymd;
    return `${m[3]}/${m[2]}/${m[1]}`;
  }
}
