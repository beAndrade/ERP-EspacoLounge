import {
  Component,
  DestroyRef,
  HostListener,
  effect,
  inject,
  input,
  OnInit,
  output,
} from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { FormControl, ReactiveFormsModule } from '@angular/forms';
import { catchError, of } from 'rxjs';
import { AgendaNovoClientSidebarComponent } from '../agenda-novo/agenda-novo-client-sidebar.component';
import type {
  AtendimentoListaItem,
  ComandaPagamentoItem,
  ComandaResumoPagamentos,
} from '../../core/models/api.models';
import { SheetsApiService } from '../../core/services/sheets-api.service';
import {
  linhaResumoAtendimentoLista,
  ordenarLinhasAtendimentoInPlace,
} from '../../core/utils/atendimento-display';
import type { ComandaDrawerContextoAgenda } from './comanda-drawer.types';

function formataMoedaBrl(n: number): string {
  return new Intl.NumberFormat('pt-BR', {
    style: 'currency',
    currency: 'BRL',
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(n);
}

/**
 * Itens da comanda em modo leitura — agrupados por tipo (Serviço/Mega/Pacote/Cabelo/Produto).
 * Para Mega/Pacote, listamos a cabeça (sem etapa) e as etapas no mesmo bloco.
 */
export interface LinhaResumoComanda {
  /** Linha-chave para o bloco; cabeça do pacote ou única linha do tipo. */
  linha: AtendimentoListaItem;
  /** Texto principal (ex.: "Escova — Médio"; "Hair First"). */
  titulo: string;
  /** Texto secundário (ex.: profissional / detalhes). */
  subtitulo: string;
  /** Quando há etapas (Mega/Pacote), descrição rápida de cada uma. */
  etapas: { titulo: string; subtitulo: string }[];
  /** Tipo do bloco (`Serviço`/`Produto`/`Mega`/`Pacote`/`Cabelo`). */
  tipo: 'Serviço' | 'Produto' | 'Mega' | 'Pacote' | 'Cabelo' | 'Outro';
  /** Quantidade quando aplicável (Produto/Serviço). */
  quantidade: number | null;
}

const RESUMO_VAZIO: ComandaResumoPagamentos = {
  total_bruto: 0,
  desconto: 0,
  total: 0,
  total_pago: 0,
  saldo: 0,
  status: 'aberto',
  cobranca_status: null,
};

/**
 * Drawer «Comanda» — agora em modo leitura. Itens vivem no agendamento
 * (botão Editar abre o drawer de edição). O botão Faturar abre o sub-drawer
 * de pagamentos parciais (ver `FaturarDrawerComponent`).
 */
@Component({
  selector: 'app-nova-comanda-drawer',
  standalone: true,
  imports: [AgendaNovoClientSidebarComponent, ReactiveFormsModule],
  templateUrl: './nova-comanda-drawer.component.html',
  styleUrl: './nova-comanda-drawer.component.scss',
})
export class NovaComandaDrawerComponent implements OnInit {
  private readonly api = inject(SheetsApiService);
  private readonly destroyRef = inject(DestroyRef);

  /** Preenchido ao abrir a partir do drawer de agendamento (cliente / data correntes). */
  readonly contexto = input<ComandaDrawerContextoAgenda | null>(null);
  readonly fechar = output<void>();
  /** Após excluir o atendimento (comanda) na API com sucesso. */
  readonly comandaExcluida = output<void>();
  /** Pede ao pai para abrir o drawer de edição do agendamento (id em `contexto`). */
  readonly editarAgendamento = output<void>();
  /** Pede ao pai para abrir o sub-drawer de Faturar. */
  readonly faturarComanda = output<{
    idAtendimento: string;
    resumo: ComandaResumoPagamentos;
  }>();

  readonly clienteComandaCtrl = new FormControl('', { nonNullable: true });
  readonly clienteNomeCtrl = new FormControl('', { nonNullable: true });
  readonly dataComandaCtrl = new FormControl('', { nonNullable: true });

  /** Linhas espelhadas do atendimento para exibição (modo leitura). */
  readonly linhasAtendimentoApi: AtendimentoListaItem[] = [];
  carregandoItens = false;
  erroItens = '';

  /** Resumo financeiro consolidado (vem da API; recalculado a cada open). */
  resumoPagamentos: ComandaResumoPagamentos = RESUMO_VAZIO;
  pagamentos: ComandaPagamentoItem[] = [];
  carregandoPagamentos = false;

  outrosMenuAberto = false;
  modalConfirmExcluirAberto = false;
  modalOutrosOpcao: 'imprimir' | 'historico' | null = null;
  excluindo = false;
  erroExcluir = '';

  constructor() {
    effect(() => {
      const ctx = this.contexto();
      const id = ctx?.clienteId?.trim() ?? '';
      if (this.clienteComandaCtrl.value !== id) {
        this.clienteComandaCtrl.setValue(id, { emitEvent: false });
      }
      const nomeCliente = ctx?.cliente?.nome?.trim() || '';
      if (this.clienteNomeCtrl.value !== nomeCliente) {
        this.clienteNomeCtrl.setValue(nomeCliente, { emitEvent: false });
      }
      const dataExibicao = this.dataComandaExibicao();
      if (this.dataComandaCtrl.value !== dataExibicao) {
        this.dataComandaCtrl.setValue(dataExibicao, { emitEvent: false });
      }
    });

    effect(
      (onCleanup) => {
        const ctx = this.contexto();
        const ymd = (ctx?.dataYmd ?? '').trim();
        const idAt = (ctx?.idAtendimento ?? '').trim();
        this.linhasAtendimentoApi.length = 0;
        this.resumoPagamentos = RESUMO_VAZIO;
        this.pagamentos = [];
        if (!idAt || !/^\d{4}-\d{2}-\d{2}$/.test(ymd)) {
          this.carregandoItens = false;
          this.erroItens = '';
          return;
        }
        this.carregandoItens = true;
        this.erroItens = '';
        const sub = this.api
          .listAgendamentos(ymd, ymd, idAt)
          .pipe(
            takeUntilDestroyed(this.destroyRef),
            catchError((e: Error) => {
              this.erroItens =
                e.message || 'Não foi possível carregar os itens do agendamento.';
              return of([] as AtendimentoListaItem[]);
            }),
          )
          .subscribe({
            next: (rows) => {
              const copy = [...rows];
              ordenarLinhasAtendimentoInPlace(copy);
              this.linhasAtendimentoApi.length = 0;
              this.linhasAtendimentoApi.push(...copy);
              this.carregandoItens = false;
            },
          });
        onCleanup(() => sub.unsubscribe());
        this.recarregarResumoPagamentos(idAt);
      },
    );
  }

  ngOnInit(): void {
    /** Sem fetch de catálogos: o drawer não edita itens; só apresenta. */
  }

  /** Re-busca pagamentos + resumo da comanda actual. */
  private recarregarResumoPagamentos(idAtendimento: string): void {
    const id = (idAtendimento || '').trim();
    if (!id) {
      this.resumoPagamentos = RESUMO_VAZIO;
      this.pagamentos = [];
      return;
    }
    this.carregandoPagamentos = true;
    this.api
      .listComandaPagamentos(id)
      .pipe(
        takeUntilDestroyed(this.destroyRef),
        catchError(() =>
          of({ items: [] as ComandaPagamentoItem[], resumo: RESUMO_VAZIO }),
        ),
      )
      .subscribe({
        next: (r) => {
          this.pagamentos = r.items ?? [];
          this.resumoPagamentos = r.resumo ?? RESUMO_VAZIO;
          this.carregandoPagamentos = false;
        },
      });
  }

  /** Chamado pelo pai depois de fechar o sub-drawer Faturar (para refrescar resumo). */
  recarregarAposFaturar(): void {
    const id = this.contexto()?.idAtendimento?.trim();
    if (id) this.recarregarResumoPagamentos(id);
  }

  // ----- Itens (leitura) ----------------------------------------------------

  blocosLeitura(): LinhaResumoComanda[] {
    const out: LinhaResumoComanda[] = [];
    /** Mega e Pacote: agrupar por nome do pacote. */
    const grupos = new Map<string, AtendimentoListaItem[]>();
    const soltas: AtendimentoListaItem[] = [];

    for (const l of this.linhasAtendimentoApi) {
      const tp = String(l.tipo ?? '').trim().toLowerCase();
      if (tp === 'mega' || tp === 'pacote') {
        const k = `${tp}::${String(l.pacote ?? '').trim() || '(sem pacote)'}`;
        const arr = grupos.get(k) ?? [];
        arr.push(l);
        grupos.set(k, arr);
      } else {
        soltas.push(l);
      }
    }

    for (const [, linhas] of grupos) {
      ordenarLinhasAtendimentoInPlace(linhas);
      const cabeca = linhas[0];
      const tipoCab = String(cabeca.tipo ?? '').trim().toLowerCase();
      const tipo: LinhaResumoComanda['tipo'] =
        tipoCab === 'mega' ? 'Mega' : 'Pacote';
      const nome =
        String(cabeca.pacote ?? '').trim() ||
        linhaResumoAtendimentoLista(cabeca);
      const etapas: LinhaResumoComanda['etapas'] = [];
      for (const l of linhas) {
        const et = String(l.etapa ?? '').trim();
        if (!et) continue;
        const prof = String(l.profissional ?? '').trim();
        etapas.push({
          titulo: et,
          subtitulo: prof ? `Profissional: ${prof}` : '',
        });
      }
      out.push({
        linha: cabeca,
        titulo: `${tipo} • ${nome}`,
        subtitulo: cabeca.profissional
          ? `Profissional: ${cabeca.profissional}`
          : '',
        etapas,
        tipo,
        quantidade: null,
      });
    }

    for (const l of soltas) {
      const tp = String(l.tipo ?? '').trim().toLowerCase();
      const tipo: LinhaResumoComanda['tipo'] =
        tp === 'serviço' || tp === 'servico'
          ? 'Serviço'
          : tp === 'produto'
            ? 'Produto'
            : tp === 'cabelo'
              ? 'Cabelo'
              : 'Outro';
      const titulo = linhaResumoAtendimentoLista(l) || l.descricao || '—';
      const profissional = String(l.profissional ?? '').trim();
      const subParts: string[] = [];
      if (profissional) subParts.push(`Profissional: ${profissional}`);
      const qNum = this.quantidadeLinha(l);
      if (qNum != null && qNum > 1) subParts.push(`Qtde.: ${qNum}`);
      out.push({
        linha: l,
        titulo,
        subtitulo: subParts.join(' · '),
        etapas: [],
        tipo,
        quantidade: qNum,
      });
    }

    return out;
  }

  private quantidadeLinha(l: AtendimentoListaItem): number | null {
    const itens = l.itens_catalogo ?? l.itens;
    if (!itens || itens.length === 0) return null;
    const principal =
      itens.find((it) => it.tipo === 'servico') ??
      itens.find((it) => it.tipo === 'produto') ??
      itens[0];
    const q = Number(principal?.quantidade);
    return Number.isFinite(q) && q > 0 ? q : null;
  }

  // ----- Resumo / status ----------------------------------------------------

  /** Texto pt-BR do status para badge. */
  rotuloStatus(): string {
    switch (this.resumoPagamentos.status) {
      case 'pago':
        return 'Quitada';
      case 'parcial':
        return 'Parcialmente paga';
      case 'pendente':
        return 'Pagamento pendente';
      default:
        return 'Em aberto';
    }
  }

  /** Slug do status para CSS modifier. */
  classeStatus(): string {
    return `nc-status--${this.resumoPagamentos.status}`;
  }

  // ----- Ações --------------------------------------------------------------

  podeFaturar(): boolean {
    return Boolean(
      this.contexto()?.idAtendimento?.trim() &&
        this.linhasAtendimentoApi.length > 0,
    );
  }

  podeEditar(): boolean {
    return Boolean(this.contexto()?.idAtendimento?.trim());
  }

  podeExcluirComanda(): boolean {
    return Boolean(this.contexto()?.idAtendimento?.trim());
  }

  abrirEditarAgendamento(): void {
    if (!this.podeEditar()) return;
    this.fecharOutrosMenu();
    this.editarAgendamento.emit();
  }

  abrirFaturar(): void {
    const id = this.contexto()?.idAtendimento?.trim();
    if (!id || !this.podeFaturar()) return;
    this.fecharOutrosMenu();
    this.faturarComanda.emit({
      idAtendimento: id,
      resumo: this.resumoPagamentos,
    });
  }

  // ----- Outros / excluir ---------------------------------------------------

  @HostListener('click', ['$event'])
  onHostClickFecharOutros(ev: MouseEvent): void {
    if (!this.outrosMenuAberto) return;
    const el = ev.target as HTMLElement | null;
    if (el && !el.closest('.nc-outros-wrap')) {
      this.fecharOutrosMenu();
    }
  }

  @HostListener('document:click', ['$event'])
  onDocumentClick(ev: MouseEvent): void {
    const el = ev.target as HTMLElement | null;
    if (this.outrosMenuAberto && el && !el.closest('.nc-outros-wrap')) {
      this.fecharOutrosMenu();
    }
  }

  toggleOutrosMenu(ev?: MouseEvent): void {
    ev?.stopPropagation();
    this.outrosMenuAberto = !this.outrosMenuAberto;
  }

  fecharOutrosMenu(): void {
    this.outrosMenuAberto = false;
  }

  abrirModalExcluir(): void {
    if (!this.podeExcluirComanda() || this.excluindo) return;
    this.fecharOutrosMenu();
    this.erroExcluir = '';
    this.modalConfirmExcluirAberto = true;
  }

  fecharModalExcluir(): void {
    if (this.excluindo) return;
    this.modalConfirmExcluirAberto = false;
    this.erroExcluir = '';
  }

  confirmarExcluirComanda(): void {
    const id = this.contexto()?.idAtendimento?.trim();
    if (!id || this.excluindo) return;
    this.erroExcluir = '';
    this.excluindo = true;
    this.api.excluirAtendimento(id).subscribe({
      next: () => {
        this.excluindo = false;
        this.modalConfirmExcluirAberto = false;
        this.comandaExcluida.emit();
      },
      error: (e: Error) => {
        this.excluindo = false;
        this.erroExcluir =
          e.message ||
          'Não foi possível excluir. Verifique a internet e tente de novo.';
      },
    });
  }

  onOutrosImprimir(): void {
    this.fecharOutrosMenu();
    this.modalOutrosOpcao = 'imprimir';
  }

  onOutrosHistorico(): void {
    this.fecharOutrosMenu();
    this.modalOutrosOpcao = 'historico';
  }

  fecharModalOutrosOpcao(): void {
    this.modalOutrosOpcao = null;
  }

  // ----- Helpers ------------------------------------------------------------

  dataComandaExibicao(): string {
    const ymd = this.contexto()?.dataYmd?.trim();
    if (!ymd || !/^\d{4}-\d{2}-\d{2}$/.test(ymd)) return '—';
    const p = /^(\d{4})-(\d{2})-(\d{2})/.exec(ymd);
    return p ? `${p[3]}/${p[2]}/${p[1]}` : ymd;
  }

  tituloComandaDrawer(): string {
    const idAt = this.contexto()?.idAtendimento?.trim();
    if (!idAt) return 'Nova comanda';
    const n = this.contexto()?.numeroComandaTitulo;
    const num = typeof n === 'number' && Number.isFinite(n) && n > 0 ? n : 1;
    return `Editando comanda #${num}`;
  }

  brl(n: number): string {
    return formataMoedaBrl(n);
  }

  contextoPodeSincronizarItens(): boolean {
    return Boolean(
      (this.contexto()?.idAtendimento ?? '').trim() &&
        /^\d{4}-\d{2}-\d{2}$/.test(
          (this.contexto()?.dataYmd ?? '').trim(),
        ),
    );
  }
}
