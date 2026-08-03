import { DecimalPipe, registerLocaleData } from '@angular/common';
import localePt from '@angular/common/locales/pt';
import {
  ApplicationRef,
  Component,
  HostListener,
  inject,
  LOCALE_ID,
  OnDestroy,
  OnInit,
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
import {
  dataDdMmBarraAaaa,
  ordenarLinhasAtendimentoInPlace,
  parseFiltroDataDdMm,
  toYmd,
  valorMonetarioParaNumero,
} from '../../../../core/utils/atendimento-display';
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

type OrcamentoStatus = 'rascunho' | 'enviado' | 'aceito' | 'arquivado';

interface OrcamentoGrupo {
  id: string;
  data: string;
  nomeCliente: string;
  linhas: AtendimentoListaItem[];
  numeroComanda: number | null;
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
    DecimalPipe,
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
  private readonly route = inject(ActivatedRoute);
  private readonly router = inject(Router);
  private readonly toast = inject(AppToastService);
  private readonly agendaNovoGlobal = inject(AgendaNovoGlobalService);
  private readonly cadastroDrawer = inject(ClienteCadastroDrawerService);
  private readonly appRef = inject(ApplicationRef);

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
  filtroStatus = new Set<OrcamentoStatus>();

  pagina = 1;
  itensPorPagina = 20;
  readonly opcoesItensPorPagina = [10, 20, 40, 50];
  perPageMenuAberto = false;

  ordenacaoColuna: 'ticket' | 'data' | 'cliente' = 'ticket';
  ordenacaoDir: 'asc' | 'desc' = 'desc';

  menuAbertoParaId: string | null = null;

  novoAberto = false;
  novoPanelOpen = false;
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

  converterAberto = false;
  converterGrupo: OrcamentoGrupo | null = null;
  converterData = '';
  converterHora = '';
  converterFimHora = '';
  converterProfissionalId: number | null = null;
  convertendo = false;

  readonly filtrosStatus: Array<{ id: OrcamentoStatus; label: string }> = [
    { id: 'rascunho', label: 'Rascunho' },
    { id: 'enviado', label: 'Enviado' },
    { id: 'aceito', label: 'Aceito' },
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
    if (this.converterAberto) {
      ev.preventDefault();
      this.fecharConverter();
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
    this.menuAbertoParaId = null;
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
      const status: OrcamentoStatus =
        st === 'enviado' || st === 'aceito' || st === 'arquivado'
          ? st
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
        cmp = (a.numeroComanda ?? 0) - (b.numeroComanda ?? 0);
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
    const n = g.numeroComanda;
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

  toggleMenu(ev: Event, id: string): void {
    ev.stopPropagation();
    this.menuAbertoParaId = this.menuAbertoParaId === id ? null : id;
  }

  abrirOrcamento(g: OrcamentoGrupo, ev: Event): void {
    ev.preventDefault();
    ev.stopPropagation();
    this.menuAbertoParaId = null;
    this.abrirEdicao(g);
  }

  abrirOrcamentoDoMenu(g: OrcamentoGrupo, ev: Event): void {
    ev.preventDefault();
    ev.stopPropagation();
    this.menuAbertoParaId = null;
    this.abrirEdicao(g);
  }

  abrirDrawerCliente(g: OrcamentoGrupo, ev: Event): void {
    ev.preventDefault();
    ev.stopPropagation();
    this.menuAbertoParaId = null;
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

  private abrirEdicao(g: OrcamentoGrupo): void {
    this.fecharPainelBusca();
    const dataYmd = (g.data || '').trim().slice(0, 10) || toYmd(new Date());
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
      document.body.classList.remove('drawer-open');
    }, DRAWER_ANIM_MS);
  }

  onSalvoNovo(): void {
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
    this.onWhatsappOrcamentoDrawer(this.previewDados);
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
    this.menuAbertoParaId = null;
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
        numero_comanda: String(g.numeroComanda ?? ''),
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

  marcarAceito(g: OrcamentoGrupo): void {
    this.menuAbertoParaId = null;
    this.api.atualizarStatusOrcamento(g.id, 'aceito').subscribe({
      next: () => {
        g.orcamentoStatus = 'aceito';
        this.toast.show('Orçamento aceito. Pode converter para a agenda.');
      },
      error: (e: Error) =>
        this.toast.showWarning(e.message || 'Falha ao atualizar status.'),
    });
  }

  arquivar(g: OrcamentoGrupo): void {
    this.menuAbertoParaId = null;
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
    this.menuAbertoParaId = null;
    this.converterGrupo = g;
    this.converterData = g.data || toYmd(new Date());
    this.converterHora = '10:00';
    this.converterFimHora = '11:00';
    this.converterProfissionalId =
      g.linhas[0]?.profissional_id && g.linhas[0].profissional_id! > 0
        ? g.linhas[0].profissional_id!
        : this.profissionais[0]?.id ?? null;
    this.converterAberto = true;
  }

  fecharConverter(): void {
    this.converterAberto = false;
    this.converterGrupo = null;
    this.convertendo = false;
  }

  confirmarConverter(): void {
    const g = this.converterGrupo;
    if (!g || this.convertendo) return;
    const data = this.converterData.trim().slice(0, 10);
    const hi = this.converterHora.trim();
    const hf = this.converterFimHora.trim();
    const prof = Number(this.converterProfissionalId);
    if (!/^\d{4}-\d{2}-\d{2}$/.test(data)) {
      this.toast.showWarning('Informe a data (AAAA-MM-DD).');
      return;
    }
    if (!/^\d{1,2}:\d{2}$/.test(hi) || !/^\d{1,2}:\d{2}$/.test(hf)) {
      this.toast.showWarning('Informe horário de início e fim (HH:mm).');
      return;
    }
    if (!Number.isFinite(prof) || prof <= 0) {
      this.toast.showWarning('Selecione o profissional.');
      return;
    }
    const pad = (h: string) => {
      const [a, b] = h.split(':');
      return `${String(a).padStart(2, '0')}:${String(b).padStart(2, '0')}:00`;
    };
    const inicio = `${data} ${pad(hi)}`;
    const fim = `${data} ${pad(hf)}`;
    this.convertendo = true;
    this.api
      .converterOrcamento(g.id, {
        data,
        inicio,
        fim,
        profissional_id: prof,
        agenda_status: 'confirmado',
      })
      .subscribe({
        next: () => {
          this.convertendo = false;
          this.fecharConverter();
          this.toast.show('Orçamento convertido para a agenda.');
          void this.router.navigate(['/agenda'], {
            queryParams: { dia: data },
          });
        },
        error: (e: Error) => {
          this.convertendo = false;
          this.toast.showWarning(e.message || 'Falha ao converter.');
        },
      });
  }
}
