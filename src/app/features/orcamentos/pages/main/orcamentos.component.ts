import { DecimalPipe, registerLocaleData } from '@angular/common';
import localePt from '@angular/common/locales/pt';
import {
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
import { AgendaNovoComponent } from '../../../agenda/pages/novo/agenda-novo.component';
import { WhatsappEnviarModalComponent } from '../../../../shared/whatsapp/whatsapp-enviar-modal.component';
import { AppToastService } from '../../../../shared/app-toast/app-toast.service';

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

const DRAWER_ANIM_MS = 430;

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
    FormsModule,
    DecimalPipe,
    AgendaNovoComponent,
    WhatsappEnviarModalComponent,
  ],
  providers: [{ provide: LOCALE_ID, useValue: 'pt-BR' }],
  templateUrl: './orcamentos.component.html',
  styleUrl: './orcamentos.component.scss',
})
export class OrcamentosComponent implements OnInit, OnDestroy {
  private readonly api = inject(SheetsApiService);
  private readonly route = inject(ActivatedRoute);
  private readonly router = inject(Router);
  private readonly toast = inject(AppToastService);

  readonly dataDdMmBarraAaaa = dataDdMmBarraAaaa;

  carregando = false;
  erro = '';
  grupos: OrcamentoGrupo[] = [];
  clientesPorId = new Map<string, Cliente>();
  profissionais: ProfissionalListaItem[] = [];

  dataInicio = '';
  dataFim = '';
  busca = '';
  filtrosAbertos = false;
  filtroStatus = new Set<OrcamentoStatus>();

  pagina = 1;
  itensPorPagina = 20;
  readonly opcoesItensPorPagina = [10, 20, 40, 50];

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
    const hoje = new Date();
    const ini = new Date(hoje);
    ini.setDate(ini.getDate() - 30);
    this.dataInicio = dataDdMmBarraAaaa(toYmd(ini));
    this.dataFim = dataDdMmBarraAaaa(toYmd(hoje));
    this.carregar();
    this.route.queryParamMap.subscribe((params) => {
      if (params.get('abrirNovoOrcamento') === '1') {
        queueMicrotask(() => this.abrirNovoDesdeAtalho());
      }
    });
  }

  ngOnDestroy(): void {
    if (this.novoCloseTimer != null) clearTimeout(this.novoCloseTimer);
    document.body.classList.remove('drawer-open');
  }

  @HostListener('document:keydown.escape', ['$event'])
  onEsc(ev: KeyboardEvent): void {
    if (this.whatsappAberto) {
      ev.preventDefault();
      this.fecharWhatsapp();
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
    }
  }

  @HostListener('document:click')
  onDocClick(): void {
    this.menuAbertoParaId = null;
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
        this.grupos = this.agrupar(items);
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
      list = list.filter(
        (g) =>
          g.nomeCliente.toLowerCase().includes(q) ||
          this.rotuloTicket(g).toLowerCase().includes(q),
      );
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
    if (this.ordenacaoColuna !== col) {
      return 'Clique organiza por ascendente';
    }
    return this.ordenacaoDir === 'asc'
      ? 'Clique organiza por descendente'
      : 'Clique organiza por ascendente';
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

  aplicarFiltros(): void {
    this.filtrosAbertos = false;
    this.carregar();
  }

  toggleMenu(ev: Event, id: string): void {
    ev.stopPropagation();
    this.menuAbertoParaId = this.menuAbertoParaId === id ? null : id;
  }

  abrirNovo(): void {
    this.novoCtx = {
      data: toYmd(new Date()),
      profissional_id: 0,
      hora: '',
    };
    document.body.classList.add('drawer-open');
    this.novoAberto = true;
    requestAnimationFrame(() => {
      this.novoPanelOpen = true;
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
    this.novoPanelOpen = false;
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
    this.whatsappGrupo = g;
    this.whatsappCtx = {
      telefone: tel,
      clienteId: g.idCliente ?? undefined,
      clienteNome: g.nomeCliente,
      idAtendimento: g.id,
      templateCodigo: 'orcamento',
      variaveis: {
        cliente: g.nomeCliente,
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
