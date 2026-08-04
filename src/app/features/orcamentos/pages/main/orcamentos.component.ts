import { CurrencyPipe, registerLocaleData } from '@angular/common';
import localePt from '@angular/common/locales/pt';
import {
  ApplicationRef,
  Component,
  HostListener,
  inject,
  LOCALE_ID,
  OnDestroy,
  OnInit,
  ViewChild,
} from '@angular/core';
import { FormsModule } from '@angular/forms';
import { ActivatedRoute, Router } from '@angular/router';
import { forkJoin, of } from 'rxjs';
import { catchError } from 'rxjs/operators';
import {
  AtendimentoListaItem,
  Cliente,
  ProfissionalListaItem,
} from '../../../../core/models/api.models';
import type { WhatsappEnviarContexto } from '../../../../core/models/whatsapp.model';
import { SheetsApiService } from '../../../../core/services/sheets-api.service';
import { WhatsappService } from '../../../../core/services/whatsapp/whatsapp.service';
import {
  dataDdMmBarraAaaa,
  ordenarLinhasAtendimentoInPlace,
  parseFiltroDataDdMm,
  toYmd,
  valorMonetarioParaNumero,
} from '../../../../core/utils/atendimento-display';
import {
  baixarPdfOrcamentoDoDom,
  elementoOrcamentoPrintNoDom,
  nomeArquivoPdfOrcamento,
  variaveisWhatsappOrcamento,
} from '../../../../core/utils/orcamento-whatsapp-pdf.util';
import { formatarCelularBr } from '../../../../core/utils/telefone-br';
import { nomeClienteParaWhatsapp } from '../../../../core/utils/whatsapp-variaveis';
import { AgendaNovoComponent } from '../../../agenda/pages/novo/agenda-novo.component';
import { WhatsappEnviarModalComponent } from '../../../../shared/whatsapp/whatsapp-enviar-modal.component';
import {
  type OrcamentoPrintPayload,
} from './orcamento-print.component';
import { OrcamentoPreviewOverlayComponent } from './orcamento-preview-overlay.component';
import { AppToastService } from '../../../../shared/app-toast/app-toast.service';
import {
  type AbrirCadastroClientePayload,
  ClienteCadastroDrawerService,
} from '../../../../shared/cliente-cadastro-drawer/cliente-cadastro-drawer.service';
import {
  AgendaNovoGlobalService,
  type AgendaNovoGlobalModo,
} from '../../../../shared/agenda-novo-global/agenda-novo-global.service';
import { UiTipTriggerComponent } from '../../../../shared/ui-tip-trigger/ui-tip-trigger.component';
import { ClienteDrawerPeriodoFiltroComponent } from '../../../../shared/cliente-drawer-periodo-filtro/cliente-drawer-periodo-filtro.component';
import { TableEmptyComponent } from '../../../../shared/table-empty/table-empty.component';
import { tooltipOrdenacaoProximoClique } from '../../../../shared/table-sort-tip.util';
import { ymdToDdMmYyyyFiltro } from '../../../financeiro/pages/transacoes/fin-transacoes-filtro.util';

import {
  DRAWER_ANIM_MS,
  beginDrawerCloseAnimation,
  runDrawerOpenAnimation,
} from '../../../../shared/drawer-panel-anim';

registerLocaleData(localePt);

type OrcamentoStatus = 'rascunho' | 'enviado' | 'arquivado';

interface OrcamentoGrupo {
  id: string;
  data: string;
  nomeCliente: string;
  linhas: AtendimentoListaItem[];
  numeroComanda: number | null;
  /** Ticket do orçamento (sequência própria). */
  numeroOrcamento: number | null;
  valorTotal: number | null;
  orcamentoStatus: OrcamentoStatus;
  idCliente: string | null;
  telefoneCliente: string | null;
}

function formataMoeda(n: number): string {
  return new Intl.NumberFormat('pt-BR', {
    style: 'currency',
    currency: 'BRL',
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(Number.isFinite(n) ? n : 0);
}

@Component({
  selector: 'app-orcamentos',
  standalone: true,
  imports: [
    TableEmptyComponent,
    FormsModule,
    CurrencyPipe,
    AgendaNovoComponent,
    WhatsappEnviarModalComponent,
    OrcamentoPreviewOverlayComponent,
    UiTipTriggerComponent,
    ClienteDrawerPeriodoFiltroComponent,
  ],
  providers: [{ provide: LOCALE_ID, useValue: 'pt-BR' }],
  templateUrl: './orcamentos.component.html',
  styleUrl: './orcamentos.component.scss',
})
/** Toolbar alinhada a Comandas (`list-head`). */
export class OrcamentosComponent implements OnInit, OnDestroy {
  private readonly api = inject(SheetsApiService);
  private readonly wa = inject(WhatsappService);
  private readonly route = inject(ActivatedRoute);
  private readonly router = inject(Router);
  private readonly toast = inject(AppToastService);
  private readonly agendaNovoGlobal = inject(AgendaNovoGlobalService);
  private readonly cadastroDrawer = inject(ClienteCadastroDrawerService);
  private readonly appRef = inject(ApplicationRef);

  @ViewChild(AgendaNovoComponent) private agendaNovoRef?: AgendaNovoComponent;

  /** Menu Novo → Orçamento: mesmo drawer do botão Novo da lista. */
  private readonly onAgendaNovoAtalho = (
    modo: AgendaNovoGlobalModo,
  ): boolean => {
    if (modo !== 'orcamento') return false;
    this.abrirNovo();
    return true;
  };

  readonly dataDdMmBarraAaaa = dataDdMmBarraAaaa;

  carregando = false;
  erro = '';
  grupos: OrcamentoGrupo[] = [];
  clientesPorId = new Map<string, Cliente>();
  profissionais: ProfissionalListaItem[] = [];

  dataInicio = '';
  dataFim = '';
  periodoInicioYmd = '';
  periodoFimYmd = '';
  busca = '';
  buscaAberta = false;
  filtrosAbertos = false;
  /** Padrão: todos os status ativos; arquivados só aparecem se o filtro for marcado. */
  filtroStatus = new Set<OrcamentoStatus>(['rascunho', 'enviado']);

  pagina = 1;
  itensPorPagina = 20;
  readonly opcoesItensPorPagina = [10, 20, 40, 50];
  perPageMenuAberto = false;

  ordenacaoColuna: 'ticket' | 'data' | 'cliente' = 'ticket';
  ordenacaoDir: 'asc' | 'desc' = 'desc';

  novoAberto = false;
  novoPanelOpen = false;
  /** Drawer em modo agendar (Converter), não edição de orçamento. */
  novoConverterAgenda = false;
  novoCtx: {
    data: string;
    profissional_id: number;
    hora?: string;
    id_atendimento?: string;
  } | null = null;
  private novoCloseTimer: ReturnType<typeof setTimeout> | null = null;

  whatsappAberto = false;
  whatsappCtx: WhatsappEnviarContexto | null = null;
  private whatsappGrupo: OrcamentoGrupo | null = null;
  /** Preview comercial do orçamento (antes de Imprimir / PDF). */
  previewDados: OrcamentoPrintPayload | null = null;

  readonly filtrosStatus: Array<{ id: OrcamentoStatus; label: string }> = [
    { id: 'rascunho', label: 'Rascunho' },
    { id: 'enviado', label: 'Enviado' },
    { id: 'arquivado', label: 'Arquivado' },
  ];

  ngOnInit(): void {
    this.agendaNovoGlobal.registerPageHandler(this.onAgendaNovoAtalho);
    const hoje = new Date();
    const ini = new Date(hoje);
    ini.setDate(ini.getDate() - 30);
    this.periodoInicioYmd = toYmd(ini);
    this.periodoFimYmd = toYmd(hoje);
    this.syncDdMmFromPeriodoYmd();
    this.carregar();
    this.route.queryParamMap.subscribe((params) => {
      if (params.get('abrirNovoOrcamento') === '1') {
        queueMicrotask(() => this.abrirNovoDesdeAtalho());
      }
    });
  }

  ngOnDestroy(): void {
    this.agendaNovoGlobal.unregisterPageHandler(this.onAgendaNovoAtalho);
    if (this.novoCloseTimer != null) clearTimeout(this.novoCloseTimer);
    document.body.classList.remove('drawer-open');
  }

  @HostListener('document:keydown.escape', ['$event'])
  onEsc(ev: KeyboardEvent): void {
    if (this.perPageMenuAberto) {
      ev.preventDefault();
      this.perPageMenuAberto = false;
      return;
    }
    if (this.whatsappAberto) {
      ev.preventDefault();
      this.fecharWhatsapp();
      return;
    }
    if (this.previewDados) {
      ev.preventDefault();
      this.fecharPreviewOrcamento();
      return;
    }
    if (this.novoAberto) {
      ev.preventDefault();
      this.fecharNovo();
      return;
    }
    if (this.buscaAberta) {
      ev.preventDefault();
      this.fecharPainelBusca();
    }
  }

  @HostListener('document:click', ['$event'])
  onDocClick(ev: MouseEvent): void {
    const t = ev.target as HTMLElement | null;
    if (this.buscaAberta && !t?.closest?.('.list-head__busca-wrap')) {
      this.fecharPainelBusca();
    }
    if (this.perPageMenuAberto && !t?.closest?.('.list-footer__per-page')) {
      this.perPageMenuAberto = false;
    }
  }

  get buscaPlaceholder(): string {
    return this.buscaAberta ? 'Buscar cliente ou ticket…' : '';
  }

  onBuscaWrapClick(): void {
    if (!this.buscaAberta) {
      this.buscaAberta = true;
      queueMicrotask(() => {
        document.getElementById('orcamentos-busca-input')?.focus();
      });
    }
  }

  fecharPainelBusca(): void {
    this.buscaAberta = false;
  }

  toggleFiltros(): void {
    this.filtrosAbertos = !this.filtrosAbertos;
  }

  onPeriodoFiltroAlterado(): void {
    this.syncDdMmFromPeriodoYmd();
    this.carregar();
  }

  private syncDdMmFromPeriodoYmd(): void {
    this.dataInicio = this.periodoInicioYmd
      ? ymdToDdMmYyyyFiltro(this.periodoInicioYmd)
      : '';
    this.dataFim = this.periodoFimYmd
      ? ymdToDdMmYyyyFiltro(this.periodoFimYmd)
      : '';
  }

  carregar(): void {
    this.carregando = true;
    this.erro = '';
    const di = parseFiltroDataDdMm(this.dataInicio) || undefined;
    const df = parseFiltroDataDdMm(this.dataFim) || undefined;
    forkJoin({
      items: this.api.listAgendamentos(di, df, undefined, false, 'orcamento'),
      clientes: this.api.listClientes().pipe(catchError(() => of([] as Cliente[]))),
      profissionais: this.api
        .listProfissionais()
        .pipe(catchError(() => of([] as ProfissionalListaItem[]))),
    }).subscribe({
      next: ({ items, clientes, profissionais }) => {
        this.clientesPorId = new Map(
          clientes.map((c) => [String(c.id).trim(), c]),
        );
        this.profissionais = profissionais.filter((p) => p.ativo !== false);
        /** Só pedidos criados como orçamento (nunca tickets da agenda/produção). */
        const soOrcamentos = items.filter(
          (it) => String(it.modo ?? '').trim().toLowerCase() === 'orcamento',
        );
        this.grupos = this.agrupar(soOrcamentos);
        this.carregando = false;
        this.pagina = 1;
      },
      error: (e: Error) => {
        this.erro = e.message || 'Não foi possível carregar orçamentos.';
        this.carregando = false;
      },
    });
  }

  private agrupar(items: AtendimentoListaItem[]): OrcamentoGrupo[] {
    const map = new Map<string, AtendimentoListaItem[]>();
    for (const it of items) {
      const id = String(it.id || '').trim();
      if (!id) continue;
      const arr = map.get(id) ?? [];
      arr.push(it);
      map.set(id, arr);
    }
    const grupos: OrcamentoGrupo[] = [];
    for (const [id, linhas] of map) {
      ordenarLinhasAtendimentoInPlace(linhas);
      const l0 = linhas[0];
      const cid = l0?.idCliente?.trim() || null;
      const cli = cid ? this.clientesPorId.get(cid) : null;
      const st = String(l0?.orcamento_status ?? 'rascunho').toLowerCase();
      /** `aceito` legado vira `enviado` na UI (status removido do fluxo). */
      const status: OrcamentoStatus =
        st === 'arquivado'
          ? 'arquivado'
          : st === 'enviado' || st === 'aceito'
            ? 'enviado'
            : 'rascunho';
      const total =
        l0?.total != null && Number.isFinite(Number(l0.total))
          ? Number(l0.total)
          : this.somarValores(linhas);
      grupos.push({
        id,
        data: l0?.data ?? '',
        nomeCliente: l0?.nomeCliente ?? '',
        linhas,
        numeroComanda: l0?.numeroComanda ?? null,
        numeroOrcamento:
          l0?.numeroOrcamento ??
          (l0?.numeroComanda != null && l0.numeroComanda > 0
            ? l0.numeroComanda
            : null),
        valorTotal: total,
        orcamentoStatus: status,
        idCliente: cid,
        telefoneCliente: cli?.celular || cli?.telefone || null,
      });
    }
    return grupos;
  }

  private somarValores(linhas: AtendimentoListaItem[]): number | null {
    let s = 0;
    let ok = false;
    for (const l of linhas) {
      const n = valorMonetarioParaNumero(l.valor);
      if (n != null) {
        s += n;
        ok = true;
      }
    }
    return ok ? Math.round(s * 100) / 100 : null;
  }

  filtrados(): OrcamentoGrupo[] {
    let list = this.grupos;
    const q = this.busca.trim().toLowerCase();
    if (q) {
      list = list.filter((g) => {
        const tel = this.exibirTelefone(g).toLowerCase();
        const telDigitos = (g.telefoneCliente ?? '').replace(/\D/g, '');
        const qDigitos = q.replace(/\D/g, '');
        return (
          g.nomeCliente.toLowerCase().includes(q) ||
          this.rotuloTicket(g).toLowerCase().includes(q) ||
          tel.includes(q) ||
          (qDigitos.length > 0 && telDigitos.includes(qDigitos))
        );
      });
    }
    if (this.filtroStatus.size > 0) {
      list = list.filter((g) => this.filtroStatus.has(g.orcamentoStatus));
    }
    const dir = this.ordenacaoDir === 'asc' ? 1 : -1;
    return list.slice().sort((a, b) => {
      let cmp = 0;
      if (this.ordenacaoColuna === 'ticket') {
        cmp = (a.numeroOrcamento ?? 0) - (b.numeroOrcamento ?? 0);
      } else if (this.ordenacaoColuna === 'data') {
        cmp = a.data.localeCompare(b.data);
      } else {
        cmp = a.nomeCliente.localeCompare(b.nomeCliente, 'pt-BR', {
          sensitivity: 'base',
        });
      }
      return cmp * dir;
    });
  }

  totalFiltrado(): number {
    return this.filtrados().length;
  }

  paginaItens(): OrcamentoGrupo[] {
    const all = this.filtrados();
    const start = (this.pagina - 1) * this.itensPorPagina;
    return all.slice(start, start + this.itensPorPagina);
  }

  totalPaginas(): number {
    return Math.max(1, Math.ceil(this.totalFiltrado() / this.itensPorPagina));
  }

  aoMudarItensPorPagina(): void {
    this.pagina = 1;
  }

  togglePerPageMenu(ev: Event): void {
    ev.stopPropagation();
    if (this.carregando) return;
    this.perPageMenuAberto = !this.perPageMenuAberto;
  }

  selecionarItensPorPagina(n: number, ev: Event): void {
    ev.stopPropagation();
    this.itensPorPagina = n;
    this.perPageMenuAberto = false;
    this.aoMudarItensPorPagina();
  }

  paginaAnterior(): void {
    if (this.pagina > 1) this.pagina--;
  }

  paginaSeguinte(): void {
    if (this.pagina < this.totalPaginas()) this.pagina++;
  }

  onOrdenarColuna(
    col: typeof this.ordenacaoColuna,
    event: MouseEvent,
  ): void {
    if (this.ordenacaoColuna === col) {
      this.ordenacaoDir = this.ordenacaoDir === 'asc' ? 'desc' : 'asc';
    } else {
      this.ordenacaoColuna = col;
      this.ordenacaoDir = 'asc';
    }
    this.pagina = 1;
    (event.currentTarget as HTMLButtonElement | null)?.blur();
  }

  tooltipOrdenacao(col: typeof this.ordenacaoColuna): string {
    return tooltipOrdenacaoProximoClique(
      this.ordenacaoColuna,
      this.ordenacaoDir,
      col,
    );
  }

  exibirTelefone(g: OrcamentoGrupo): string {
    return formatarCelularBr(g.telefoneCliente) || '';
  }

  rotuloTicket(g: OrcamentoGrupo): string {
    const n = g.numeroOrcamento ?? g.numeroComanda;
    if (typeof n === 'number' && n > 0) return `#${n}`;
    return '#—';
  }

  rotuloStatus(st: OrcamentoStatus): string {
    return (
      this.filtrosStatus.find((f) => f.id === st)?.label ?? st
    );
  }

  toggleFiltroStatus(id: OrcamentoStatus): void {
    if (this.filtroStatus.has(id)) this.filtroStatus.delete(id);
    else this.filtroStatus.add(id);
    this.pagina = 1;
  }

  filtroStatusAtivo(id: OrcamentoStatus): boolean {
    return this.filtroStatus.has(id);
  }

  abrirOrcamento(g: OrcamentoGrupo, ev: Event): void {
    ev.preventDefault();
    ev.stopPropagation();
    this.abrirEdicao(g);
  }

  abrirDrawerCliente(g: OrcamentoGrupo, ev: Event): void {
    ev.preventDefault();
    ev.stopPropagation();
    const cid = g.idCliente?.trim();
    if (!cid) return;
    this.cadastroDrawer.abrirEdicao(cid, {
      nomeLista: g.nomeCliente?.trim() ?? '',
      callbacks: {
        onSalvo: (salvo) => {
          const nomeNovo = String(salvo?.nome ?? '').trim();
          const cidSalvo = String(salvo?.id ?? cid).trim();
          if (cidSalvo && nomeNovo) {
            this.grupos = this.grupos.map((x) =>
              x.idCliente === cidSalvo ? { ...x, nomeCliente: nomeNovo } : x,
            );
            const prev = this.clientesPorId.get(cidSalvo);
            if (prev) {
              this.clientesPorId.set(cidSalvo, { ...prev, nome: nomeNovo });
            }
          }
        },
      },
    });
  }

  /** Links «Informações» da sidebar do drawer de orçamento → ficha do cliente. */
  onAbrirCadastroClienteDaSidebar(
    payload: AbrirCadastroClientePayload = {},
  ): void {
    const c = this.agendaNovoRef?.clienteSelecionado();
    const cid = c?.id?.trim();
    if (!cid) return;
    this.cadastroDrawer.abrirEdicaoPorLinkSidebar(cid, payload, {
      nomeLista: String(c?.nome ?? '').trim(),
      callbacks: {
        onSalvo: (salvo) => {
          this.agendaNovoRef?.aplicarClienteAposCriacao(salvo);
          const nomeNovo = String(salvo?.nome ?? '').trim();
          const cidSalvo = String(salvo?.id ?? cid).trim();
          if (cidSalvo && nomeNovo) {
            this.grupos = this.grupos.map((x) =>
              x.idCliente === cidSalvo ? { ...x, nomeCliente: nomeNovo } : x,
            );
            const prev = this.clientesPorId.get(cidSalvo);
            if (prev) {
              this.clientesPorId.set(cidSalvo, { ...prev, nome: nomeNovo });
            }
          }
        },
      },
    });
  }

  abrirClienteDrawerNovo(): void {
    this.cadastroDrawer.abrirNovo('', {
      onSalvo: (salvo) => {
        this.agendaNovoRef?.aplicarClienteAposCriacao(salvo);
      },
    });
  }

  private abrirEdicao(g: OrcamentoGrupo): void {
    this.fecharPainelBusca();
    const dataYmd = (g.data || '').trim().slice(0, 10) || toYmd(new Date());
    this.novoConverterAgenda = false;
    this.novoCtx = {
      data: dataYmd,
      profissional_id: 0,
      hora: '',
      id_atendimento: g.id,
    };
    this.novoAberto = true;
    document.body.classList.add('drawer-open');
    runDrawerOpenAnimation({
      setPanelOpen: (open) => {
        this.novoPanelOpen = open;
      },
      appRef: this.appRef,
    });
  }

  abrirNovo(): void {
    this.fecharPainelBusca();
    this.novoConverterAgenda = false;
    this.novoCtx = {
      data: toYmd(new Date()),
      profissional_id: 0,
      hora: '',
    };
    this.novoAberto = true;
    document.body.classList.add('drawer-open');
    runDrawerOpenAnimation({
      setPanelOpen: (open) => {
        this.novoPanelOpen = open;
      },
      appRef: this.appRef,
    });
  }

  private abrirNovoDesdeAtalho(): void {
    if (this.route.snapshot.queryParamMap.get('abrirNovoOrcamento') !== '1') {
      return;
    }
    if (!this.novoAberto) this.abrirNovo();
    void this.router.navigate([], {
      relativeTo: this.route,
      queryParams: { abrirNovoOrcamento: null },
      queryParamsHandling: 'merge',
      replaceUrl: true,
    });
  }

  fecharNovo(): void {
    if (!this.novoAberto) return;
    beginDrawerCloseAnimation({
      setPanelOpen: (open) => {
        this.novoPanelOpen = open;
      },
      appRef: this.appRef,
    });
    if (this.novoCloseTimer != null) clearTimeout(this.novoCloseTimer);
    this.novoCloseTimer = setTimeout(() => {
      this.novoCloseTimer = null;
      this.novoAberto = false;
      this.novoCtx = null;
      this.novoConverterAgenda = false;
      document.body.classList.remove('drawer-open');
    }, DRAWER_ANIM_MS);
  }

  onSalvoNovo(): void {
    this.fecharNovo();
    this.carregar();
  }

  onConvertidoAgenda(): void {
    this.fecharNovo();
    this.carregar();
  }

  onImprimirOrcamentoDrawer(payload: OrcamentoPrintPayload): void {
    this.previewDados = payload;
  }

  fecharPreviewOrcamento(): void {
    this.previewDados = null;
  }

  imprimirPreviewOrcamento(): void {
    if (!this.previewDados) return;
    this.appRef.tick();
    queueMicrotask(() => window.print());
  }

  whatsappPreviewOrcamento(): void {
    if (!this.previewDados) return;
    const payload = this.previewDados;
    const tel = String(payload.telefone ?? '').trim();
    if (tel.length < 10) {
      this.toast.show('Cliente sem telefone para WhatsApp.');
      return;
    }

    /** Abrir no gesto do clique — senão o browser bloqueia ou deixa a aba em branco. */
    const popup = window.open('about:blank', '_blank');
    const variaveis = variaveisWhatsappOrcamento(payload);
    const el = elementoOrcamentoPrintNoDom();
    const nomePdf = nomeArquivoPdfOrcamento(payload);

    const abrirWa = () => {
      this.wa.abrirChatComTemplate(
        tel,
        'orcamento',
        variaveis,
        (err) => {
          this.toast.show(
            WhatsappService.errorMessage(err) ||
              'Não foi possível abrir o WhatsApp.',
          );
        },
        popup,
      );
      this.api.atualizarStatusOrcamento(payload.idAtendimento, 'enviado').subscribe({
        next: () => {
          const g = this.grupos.find((x) => x.id === payload.idAtendimento);
          if (g) g.orcamentoStatus = 'enviado';
        },
        error: () => {
          /* status opcional; WA já abriu */
        },
      });
    };

    if (!el) {
      abrirWa();
      this.toast.show(
        'WhatsApp aberto. Use Imprimir se precisar do arquivo.',
      );
      return;
    }

    void baixarPdfOrcamentoDoDom(el, nomePdf)
      .then(() => {
        abrirWa();
        this.toast.show(
          'PDF baixado. Anexe o arquivo na conversa do WhatsApp.',
        );
      })
      .catch(() => {
        abrirWa();
        this.toast.showWarning(
          'WhatsApp aberto, mas não foi possível gerar o PDF automaticamente.',
        );
      });
  }

  onWhatsappOrcamentoDrawer(payload: OrcamentoPrintPayload): void {
    const tel = String(payload.telefone ?? '').trim();
    if (tel.length < 10) {
      this.toast.show('Cliente sem telefone para WhatsApp.');
      return;
    }
    const resumo = payload.itens
      .map((it) =>
        it.total > 0
          ? `• ${it.descricao}: ${formataMoeda(it.total)}`
          : `• ${it.descricao}`,
      )
      .join('\n');
    this.whatsappGrupo = {
      id: payload.idAtendimento,
      data: payload.dataYmd,
      nomeCliente: payload.clienteNome,
      linhas: [],
      numeroComanda: payload.numeroComanda
        ? Number(payload.numeroComanda) || null
        : null,
      numeroOrcamento: payload.numeroComanda
        ? Number(payload.numeroComanda) || null
        : null,
      valorTotal: payload.total,
      telefoneCliente: tel,
      idCliente: payload.clienteId ?? null,
      orcamentoStatus: 'rascunho',
    };
    this.whatsappCtx = {
      telefone: tel,
      clienteId: payload.clienteId,
      clienteNome: payload.clienteNome,
      idAtendimento: payload.idAtendimento,
      templateCodigo: 'orcamento',
      variaveis: {
        cliente: payload.clienteNome,
        numero_comanda: payload.numeroComanda || '',
        resumo,
        valor: formataMoeda(payload.total),
      },
    };
    this.whatsappAberto = true;
  }

  enviarWhatsapp(g: OrcamentoGrupo): void {
    const tel = g.telefoneCliente?.trim();
    if (!tel) {
        this.toast.show('Cliente sem telefone para WhatsApp.');
      return;
    }
    const resumo = g.linhas
      .map((l) => {
        const nome =
          String(l.servicosRef || l.produtoNome || l.descricao || '').trim() ||
          'Item';
        const v = valorMonetarioParaNumero(l.valor);
        return v != null ? `• ${nome}: ${formataMoeda(v)}` : `• ${nome}`;
      })
      .join('\n');
    const cli = g.idCliente
      ? this.clientesPorId.get(g.idCliente)
      : null;
    const nomeWa = nomeClienteParaWhatsapp(cli, g.nomeCliente);
    this.whatsappGrupo = g;
    this.whatsappCtx = {
      telefone: tel,
      clienteId: g.idCliente ?? undefined,
      clienteNome: nomeWa,
      idAtendimento: g.id,
      templateCodigo: 'orcamento',
      variaveis: {
        cliente: nomeWa,
        numero_comanda: String(g.numeroOrcamento ?? ''),
        resumo,
        valor: g.valorTotal != null ? formataMoeda(g.valorTotal) : '',
      },
    };
    this.whatsappAberto = true;
  }

  fecharWhatsapp(): void {
    this.whatsappAberto = false;
    this.whatsappCtx = null;
  }

  onWhatsappEnviado(): void {
    const g = this.whatsappGrupo;
    this.fecharWhatsapp();
    if (!g) return;
    this.api.atualizarStatusOrcamento(g.id, 'enviado').subscribe({
      next: () => {
        g.orcamentoStatus = 'enviado';
        this.toast.show('Orçamento marcado como enviado.');
      },
      error: (e: Error) =>
        this.toast.showWarning(e.message || 'Falha ao atualizar status.'),
    });
  }

  arquivar(g: OrcamentoGrupo): void {
    this.api.atualizarStatusOrcamento(g.id, 'arquivado').subscribe({
      next: () => {
        g.orcamentoStatus = 'arquivado';
        this.toast.show('Orçamento arquivado.');
      },
      error: (e: Error) =>
        this.toast.showWarning(e.message || 'Falha ao arquivar.'),
    });
  }

  abrirConverter(g: OrcamentoGrupo): void {
    this.fecharPainelBusca();
    const dataYmd = (g.data || '').trim().slice(0, 10) || toYmd(new Date());
    this.novoConverterAgenda = true;
    this.novoCtx = {
      data: dataYmd,
      profissional_id: 0,
      hora: '10:00',
      id_atendimento: g.id,
    };
    this.novoAberto = true;
    document.body.classList.add('drawer-open');
    runDrawerOpenAnimation({
      setPanelOpen: (open) => {
        this.novoPanelOpen = open;
      },
      appRef: this.appRef,
    });
  }
}
