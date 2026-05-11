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
import { catchError, map, of } from 'rxjs';
import { AgendaNovoClientSidebarComponent } from '../agenda-novo/agenda-novo-client-sidebar.component';
import type {
  AtendimentoItemCatalogo,
  AtendimentoListaItem,
  ComandaPagamentoItem,
  ComandaResumoPagamentos,
} from '../../core/models/api.models';
import { SheetsApiService } from '../../core/services/sheets-api.service';
import {
  linhaResumoAtendimentoLista,
  ordenarLinhasAtendimentoInPlace,
  totalLinhaPreferencialAtendimento,
  valorMonetarioParaNumero,
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
  /** Quando há etapas (Mega/Pacote), descrição rápida + linha BD para valores. */
  etapas: {
    titulo: string;
    subtitulo: string;
    linhaEtapa: AtendimentoListaItem | null;
  }[];
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
  /** Pede gravar o agendamento (hub: formulário atrás da comanda; comandas: editor em modo modal). */
  readonly salvarComanda = output<void>();

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
  /** Quantidade por linha (`linha_id`) inferida da pivot `itens_catalogo`. */
  private quantidadePorLinhaId = new Map<number, number>();
  /** Pivot correspondente por `linha_id` (ordem igual a `quantidadePorLinhaId`). */
  private pivotCatalogoPorLinhaId = new Map<number, AtendimentoItemCatalogo>();

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
        this.quantidadePorLinhaId.clear();
        this.pivotCatalogoPorLinhaId.clear();
        this.resumoPagamentos = RESUMO_VAZIO;
        this.pagamentos = [];
        if (!idAt || !/^\d{4}-\d{2}-\d{2}$/.test(ymd)) {
          this.carregandoItens = false;
          this.erroItens = '';
          return;
        }
        this.carregandoItens = true;
        this.erroItens = '';
        const sub = this.carregarLinhasAtendimento(ymd, idAt);
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

  /** Recarrega itens + resumo com o contexto actual (usado após salvar edição). */
  recarregarDadosComanda(): void {
    const ctx = this.contexto();
    const ymd = (ctx?.dataYmd ?? '').trim();
    const idAt = (ctx?.idAtendimento ?? '').trim();
    if (!idAt || !/^\d{4}-\d{2}-\d{2}$/.test(ymd)) return;
    this.carregarLinhasAtendimento(ymd, idAt);
    this.recarregarResumoPagamentos(idAt);
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
          linhaEtapa: l,
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

  /** Colunas monetárias (V. unit., desc., total) nas listagens de item. */
  faixaPrecoLinha(l: AtendimentoListaItem | null): {
    mostrarQtd: boolean;
    textoQtd: string;
    unitario: string;
    desconto: string;
    total: string;
  } | null {
    if (!l) return null;
    const lid = l.linha_id;
    const porLinha =
      lid != null ? this.pivotCatalogoPorLinhaId.get(lid) : undefined;
    /** Preferir vínculo por linha — evita pegar sempre o primeiro serviço quando há produto a seguir. */
    const itemRef =
      porLinha ??
      (l.itens_catalogo ?? l.itens ?? []).find((it) =>
        String(l.tipo ?? '').trim().toLowerCase() === 'produto'
          ? it.tipo === 'produto'
          : String(l.tipo ?? '').trim().toLowerCase() === 'serviço' ||
              String(l.tipo ?? '').trim().toLowerCase() === 'servico'
            ? it.tipo === 'servico'
            : String(l.tipo ?? '').trim().toLowerCase() === 'cabelo'
              ? it.tipo === 'cabelo'
              : false,
      ) ??
      (l.itens_catalogo ?? l.itens ?? []).find(
        (it) =>
          it.tipo === 'servico' ||
          it.tipo === 'produto' ||
          it.tipo === 'cabelo',
      );
    const tipoNorm = String(l.tipo ?? '').trim().toLowerCase();
    const megaOuPac =
      tipoNorm === 'mega' || tipoNorm === 'pacote';
    const totalN =
      (itemRef?.total_linha != null
        ? valorMonetarioParaNumero(itemRef.total_linha)
        : null) ?? totalLinhaPreferencialAtendimento(l);
    /** Mega/Pacote: desconto é só ao nível da comanda — nunca por linha. */
    const descN = megaOuPac
      ? null
      : ((itemRef?.desconto != null
          ? valorMonetarioParaNumero(itemRef.desconto)
          : null) ?? valorMonetarioParaNumero(l.desconto));
    if (
      totalN === null &&
      (descN === null || descN <= 0)
    ) {
      return null;
    }
    const total = totalN ?? 0;
    const desc = descN && descN > 0 ? descN : 0;
    const q = this.quantidadeLinha(l);
    const qEff = q != null && q > 0 ? q : 1;
    /** Quantidade sempre que a pivot/catalogo trouxer um valor (>0), não só quando >1. */
    const mostrarQtd = q != null && q > 0;
    const textoQtd = String(qEff).replace('.', ',');
    const unitRaw =
      (itemRef?.valor_unitario != null
        ? valorMonetarioParaNumero(itemRef.valor_unitario)
        : null) ?? (qEff > 0 ? total / qEff : total);
    return {
      mostrarQtd,
      textoQtd,
      unitario: formataMoedaBrl(Math.max(0, unitRaw ?? 0)),
      desconto: desc > 0 ? formataMoedaBrl(desc) : '—',
      total: formataMoedaBrl(total),
    };
  }

  /**
   * Faixa monetária do cartão inteiro (não Mega/Pacote quando etapas já mostram valores).
   */
  faixaPrecoBloc(bloco: LinhaResumoComanda): {
    mostrarQtd: boolean;
    textoQtd: string;
    unitario: string;
    desconto: string;
    total: string;
  } | null {
    const tpMega =
      bloco.tipo === 'Mega' || bloco.tipo === 'Pacote';
    if (
      tpMega &&
      bloco.etapas.some(
        (e) => e.linhaEtapa != null && this.faixaPrecoLinha(e.linhaEtapa) != null,
      )
    ) {
      return null;
    }
    return this.faixaPrecoLinha(bloco.linha);
  }

  private quantidadeLinha(l: AtendimentoListaItem): number | null {
    const id = l.linha_id;
    if (id != null) {
      const qKnown = this.quantidadePorLinhaId.get(id);
      if (qKnown != null && qKnown > 0) return qKnown;
    }
    const itens = l.itens_catalogo ?? l.itens;
    if (!itens || itens.length === 0) return null;
    const principal =
      itens.find((it) => it.tipo === 'servico') ??
      itens.find((it) => it.tipo === 'produto') ??
      itens[0];
    const q = Number(principal?.quantidade);
    return Number.isFinite(q) && q > 0 ? q : null;
  }

  /**
   * Carrega linhas do atendimento e atualiza o mapa de quantidade por `linha_id`.
   * A API pode devolver `itens_catalogo` completo só numa linha; aqui distribuímos
   * as quantidades por ordem/tipo para cada linha renderizada da comanda.
   */
  private carregarLinhasAtendimento(
    ymd: string,
    idAt: string,
  ): { unsubscribe(): void } {
    this.carregandoItens = true;
    this.erroItens = '';
    return this.api
      .listAgendamentos(ymd, ymd, idAt)
      .pipe(
      takeUntilDestroyed(this.destroyRef),
      catchError((e: Error) => {
        this.erroItens =
          e.message || 'Não foi possível carregar os itens do agendamento.';
        return of([] as AtendimentoListaItem[]);
      }),
      map((rows) => {
        const copy = [...rows];
        ordenarLinhasAtendimentoInPlace(copy);
        this.linhasAtendimentoApi.length = 0;
        this.linhasAtendimentoApi.push(...copy);
        this.reconstruirMapaQuantidade(copy);
        this.carregandoItens = false;
        return copy;
      }),
      )
      .subscribe({
        next: () => {},
      });
  }

  private reconstruirMapaQuantidade(rows: AtendimentoListaItem[]): void {
    this.quantidadePorLinhaId.clear();
    this.pivotCatalogoPorLinhaId.clear();
    const itensAny = rows.find((r) => (r.itens_catalogo?.length ?? 0) > 0 || (r.itens?.length ?? 0) > 0);
    const catalogo = (itensAny?.itens_catalogo ?? itensAny?.itens ?? []).slice();
    if (!catalogo.length) return;
    const filaServicoProduto = catalogo.filter(
      (it) => it.tipo === 'servico' || it.tipo === 'produto',
    );
    const filaMegaPacote = catalogo.filter(
      (it) => it.tipo === 'mega' || it.tipo === 'pacote',
    );
    const filaCabelo = catalogo.filter((it) => it.tipo === 'cabelo');

    for (const row of rows) {
      if (row.linha_id == null) continue;
      const tipo = String(row.tipo ?? '').trim().toLowerCase();
      let q: number | null = null;
      let hit: AtendimentoItemCatalogo | undefined;
      if (tipo === 'serviço' || tipo === 'servico' || tipo === 'produto') {
        hit = filaServicoProduto.shift();
        q = Number(hit?.quantidade ?? 0);
      } else if (tipo === 'mega' || tipo === 'pacote') {
        hit = filaMegaPacote.shift();
        q = Number(hit?.quantidade ?? 0);
      } else if (tipo === 'cabelo') {
        hit = filaCabelo.shift();
        q = Number(hit?.quantidade ?? 0);
      }
      if (hit != null) {
        this.pivotCatalogoPorLinhaId.set(row.linha_id, hit);
      }
      if (q != null && Number.isFinite(q) && q > 0) {
        this.quantidadePorLinhaId.set(row.linha_id, q);
      }
    }
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

  podeSalvarComandaRodape(): boolean {
    return this.podeEditar();
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

  gravarRodape(): void {
    if (!this.podeSalvarComandaRodape()) return;
    this.fecharOutrosMenu();
    this.salvarComanda.emit();
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
