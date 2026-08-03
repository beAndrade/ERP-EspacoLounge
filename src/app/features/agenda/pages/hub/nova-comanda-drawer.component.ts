import {
  Component,
  DestroyRef,
  HostListener,
  effect,
  inject,
  input,
  OnInit,
  output,
  viewChild,
} from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { FormControl, ReactiveFormsModule } from '@angular/forms';
import {
  catchError,
  debounceTime,
  finalize,
  map,
  of,
  shareReplay,
  take,
  startWith,
  distinctUntilChanged,
  switchMap,
  type Observable,
} from 'rxjs';
import { ComandaResumoBarComponent } from '../../../../shared/comanda-resumo-bar/comanda-resumo-bar.component';
import { AgendaNovoClientSidebarComponent } from '../novo/agenda-novo-client-sidebar.component';
import { AgendaModalCalendarComponent } from '../novo/agenda-modal-calendar.component';
import type {
  AtendimentoItemCatalogo,
  AtendimentoListaItem,
  Cliente,
  ComandaPagamentoItem,
  ComandaResumoPagamentos,
} from '../../../../core/models/api.models';
import { SheetsApiService } from '../../../../core/services/sheets-api.service';
import { AppToastService } from '../../../../shared/app-toast/app-toast.service';
import { extractApiErrorMessage } from '../../../../core/utils/api-error-message';
import {
  isTipoPacoteQueratinaNorm,
  linhaResumoAtendimentoLista,
  ordenarLinhasAtendimentoInPlace,
  parseFiltroDataDdMm,
  totalLinhaPreferencialAtendimento,
  valorMonetarioParaNumero,
} from '../../../../core/utils/atendimento-display';
import type { ComandaDrawerContextoAgenda } from './comanda-drawer.types';
import type { AbrirCadastroClientePayload } from '../../../../shared/cliente-cadastro-drawer/cliente-cadastro-drawer.service';
import { resolverHoraWhatsappAgendamento } from '../../../../core/utils/whatsapp-agendamento-hora';
import {
  formataMoedaBrl,
  moedaAPartirDosDigitos,
} from '../../../../core/utils/brl-digit-input';

/** Máscara de moeda nos campos do resumo (placeholder + valor exibido). */
const PLACEHOLDER_MOEDA_RESUMO = 'R$ 0,00';

/**
 * Entrada só por dígitos: cada dígito acrescenta à direita em centavos
 * (ex.: 1 → R$ 0,01; 15 → R$ 0,15; 150 → R$ 1,50).
 */
function moedaResumoAPartirDosDigitos(raw: string): string {
  return moedaAPartirDosDigitos(raw);
}

/** Remove sufixo «— Qtd: n» do título do produto (a quantidade vai na faixa monetária). */
function tituloProdutoLeituraSemQtd(titulo: string): string {
  return (titulo || '')
    .replace(/\s*[—–]\s*Qtd\.?\s*:?\s*[\d.,]+\s*$/i, '')
    .replace(/\s*[—–]\s*Qtde\.?\s*:?\s*[\d.,]+\s*$/i, '')
    .trim();
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
    /** Só Mega: valor da etapa (ex.: ao lado do nome «Retirada — R$ …»). */
    valorEtapaBrl?: string | null;
  }[];
  /** Tipo do bloco (`Serviço`/`Produto`/`Mega`/`Pacote`/`Pacote Adesivo+Queratina`/`Cabelo`). */
  tipo: 'Serviço' | 'Produto' | 'Mega' | 'Pacote' | 'Pacote Adesivo+Queratina' | 'Cabelo' | 'Outro';
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
  imports: [
    AgendaNovoClientSidebarComponent,
    AgendaModalCalendarComponent,
    ComandaResumoBarComponent,
    ReactiveFormsModule,
  ],
  templateUrl: './nova-comanda-drawer.component.html',
  styleUrl: './nova-comanda-drawer.component.scss',
})
export class NovaComandaDrawerComponent implements OnInit {
  private readonly clientSidebarRef =
    viewChild(AgendaNovoClientSidebarComponent);
  private readonly api = inject(SheetsApiService);
  private readonly toast = inject(AppToastService);
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
    /** Crédito do cliente indicado no resumo da comanda (só aplica ao clicar «Faturar»). */
    creditoAUsar?: number;
    /** Data da comanda (`AAAA-MM-DD`) para alinhar «Data do pagamento» / «Atrasado». */
    dataComandaYmd?: string | null;
    /** Comanda já finalizada: abre drawer de pagamentos em modo consulta/edição. */
    modoVerPagamentos?: boolean;
  }>();
  /** Data da comanda (campo editável) — o hub/comandas ligam ao Faturar em tempo real. */
  readonly comandaDataYmd = output<string | null>();
  /** Pede gravar o agendamento (hub: formulário atrás da comanda; comandas: editor em modo modal). */
  readonly salvarComanda = output<void>();

  /** Abrir ficha do cliente (sidebar); `aba` opcional (ex.: «Cashback»). */
  readonly abrirCadastroCliente = output<AbrirCadastroClientePayload>();

  readonly clienteComandaCtrl = new FormControl('', { nonNullable: true });
  readonly clienteNomeCtrl = new FormControl('', { nonNullable: true });
  readonly dataComandaCtrl = new FormControl('', { nonNullable: true });
  /** Resumo manual: desconto (moeda em texto pt-BR). */
  readonly descontoResumoCtrl = new FormControl(formataMoedaBrl(0), {
    nonNullable: true,
  });
  /** Valor de crédito do cliente a aplicar nesta comanda (≤ total e ≤ saldo). */
  readonly creditoResumoCtrl = new FormControl(formataMoedaBrl(0), {
    nonNullable: true,
  });
  readonly placeholderMoedaResumo = PLACEHOLDER_MOEDA_RESUMO;

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

  excluirMenuAberto = false;
  /** Em animação de fechamento do dropdown Excluir (fade para baixo). */
  excluirMenuFechando = false;
  /** Pulse no botão Excluir (mesmo padrão do menu Novo / toolbar). */
  pulsoExcluir = false;
  private tPulsoExcluir: ReturnType<typeof setTimeout> | null = null;
  private tExcluirMenuFechar: ReturnType<typeof setTimeout> | null = null;
  private readonly duracaoPulsoExcluirMs = 600;
  private readonly duracaoExcluirMenuFecharMs = 280;
  modalConfirmExcluirAberto = false;
  /** Confirmação ao alterar a data da comanda (finalizada ou com pagamentos). */
  modalConfirmDataAberto = false;
  /** YMD pendente no modal de data. */
  dataPendenteYmd: string | null = null;
  persistindoDataComanda = false;
  erroDataComanda = '';
  /** Última data persistida (servidor / contexto). */
  private dataYmdPersistida: string | null = null;
  /** Calendário do campo Data (mesmo padrão do Faturar). */
  dataComandaPickerOpen = false;
  /** Opção escolhida no menu antes do modal de confirmação. */
  modoExclusaoConfirmar: 'somente_comanda' | 'completo' = 'completo';
  excluindo = false;
  erroExcluir = '';
  /** Último GET `/api/clientes/:id` para `creditoSaldo` e sidebar. */
  private clienteApi: Cliente | null = null;
  private lastClienteFetchId = '';
  /** Evita repor crédito ao reexecutar o effect com o mesmo `id_atendimento`. */
  private lastIdAtParaCamposResumo = '';
  /**
   * Desconto digitado nesta abertura do drawer (fonte de verdade local).
   * Impede o sync da API (ainda a 0) de apagar o valor antes do PATCH.
   */
  private descontoSessaoReais: number | null = null;
  private persistindoDesconto = false;
  /**
   * Sequência + sub activa do GET de itens: ignora respostas stale após
   * excluir/recriar o mesmo `id_atendimento` (edição de itens).
   */
  private linhasLoadSeq = 0;
  private linhasLoadSub: { unsubscribe(): void } | null = null;
  /** Idem para o GET de pagamentos/resumo. */
  private pagamentosLoadSeq = 0;
  private pagamentosLoadSub: { unsubscribe(): void } | null = null;

  constructor() {
    this.destroyRef.onDestroy(() => {
      if (this.tPulsoExcluir != null) window.clearTimeout(this.tPulsoExcluir);
      if (this.tExcluirMenuFechar != null) {
        window.clearTimeout(this.tExcluirMenuFechar);
      }
    });

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
      const ymdCtx = (ctx?.dataYmd ?? '').trim();
      if (
        !this.modalConfirmDataAberto &&
        !this.persistindoDataComanda &&
        /^\d{4}-\d{2}-\d{2}$/.test(ymdCtx)
      ) {
        this.dataYmdPersistida = ymdCtx;
      }
      if (
        !this.modalConfirmDataAberto &&
        !this.persistindoDataComanda &&
        this.dataComandaCtrl.value !== dataExibicao
      ) {
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
          this.linhasLoadSub?.unsubscribe();
          this.linhasLoadSub = null;
          this.linhasLoadSeq++;
          this.pagamentosLoadSub?.unsubscribe();
          this.pagamentosLoadSub = null;
          this.pagamentosLoadSeq++;
          this.lastIdAtParaCamposResumo = '';
          this.lastClienteFetchId = '';
          this.clienteApi = null;
          this.descontoSessaoReais = null;
          this.descontoResumoCtrl.setValue(formataMoedaBrl(0), {
            emitEvent: false,
          });
          this.descontoResumoCtrl.markAsPristine();
          this.creditoResumoCtrl.setValue(formataMoedaBrl(0), {
            emitEvent: false,
          });
          this.creditoResumoCtrl.markAsPristine();
          this.carregandoItens = false;
          this.erroItens = '';
          return;
        }
        const cid = (ctx?.clienteId ?? '').trim();
        if (cid && cid !== this.lastClienteFetchId) {
          this.lastClienteFetchId = cid;
          this.api
            .getCliente(cid)
            .pipe(take(1), catchError(() => of(null)))
            .subscribe((row) => {
              if (
                row &&
                (this.contexto()?.clienteId ?? '').trim() === cid
              ) {
                this.clienteApi = row;
                this.aplicarCreditoAutomaticoSeElegivel();
              }
            });
        }
        if (idAt !== this.lastIdAtParaCamposResumo) {
          this.lastIdAtParaCamposResumo = idAt;
          this.descontoSessaoReais = null;
          this.descontoResumoCtrl.setValue(formataMoedaBrl(0), {
            emitEvent: false,
          });
          this.descontoResumoCtrl.markAsPristine();
          this.creditoResumoCtrl.setValue(formataMoedaBrl(0), {
            emitEvent: false,
          });
          this.creditoResumoCtrl.markAsPristine();
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
    this.dataComandaCtrl.valueChanges
      .pipe(
        startWith(this.dataComandaCtrl.value),
        distinctUntilChanged(),
        takeUntilDestroyed(this.destroyRef),
      )
      .subscribe(() => {
        // Só propaga ao pai após confirmação/persistência — evita “sujar” a data no Cancelar.
        if (this.modalConfirmDataAberto || this.persistindoDataComanda) return;
        this.comandaDataYmd.emit(this.dataComandaYmdParaFaturar());
      });
    this.descontoResumoCtrl.valueChanges
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe((raw) => {
        if (this.descontoResumoCtrl.dirty) {
          this.descontoSessaoReais = this.valorMonetarioCampoResumo(raw);
        }
        this.clampCreditoResumoAoMaximo();
      });
    /** Grava o desconto ao sair do campo / após pausa na digitação. */
    this.descontoResumoCtrl.valueChanges
      .pipe(
        debounceTime(450),
        takeUntilDestroyed(this.destroyRef),
        switchMap(() => {
          if (this.comandaFinalizada()) return of(null);
          if (
            this.descontoSessaoReais == null &&
            this.descontoResumoCtrl.pristine
          ) {
            return of(null);
          }
          const id = this.contexto()?.idAtendimento?.trim();
          if (!id) return of(null);
          return this.persistirDescontoComanda$(id, this.descontoAtualReais());
        }),
      )
      .subscribe();
    this.creditoResumoCtrl.valueChanges
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe(() => this.clampCreditoResumoAoMaximo());
  }

  /** Re-busca pagamentos + resumo da comanda actual. */
  private recarregarResumoPagamentos(idAtendimento: string): void {
    const id = (idAtendimento || '').trim();
    if (!id) {
      this.pagamentosLoadSub?.unsubscribe();
      this.pagamentosLoadSub = null;
      this.pagamentosLoadSeq++;
      this.resumoPagamentos = RESUMO_VAZIO;
      this.pagamentos = [];
      this.carregandoPagamentos = false;
      return;
    }
    this.pagamentosLoadSub?.unsubscribe();
    this.carregandoPagamentos = true;
    const seq = ++this.pagamentosLoadSeq;
    this.pagamentosLoadSub = this.api
      .listComandaPagamentos(id)
      .pipe(
        take(1),
        catchError(() =>
          of({ items: [] as ComandaPagamentoItem[], resumo: RESUMO_VAZIO }),
        ),
      )
      .subscribe({
        next: (r) => {
          if (seq !== this.pagamentosLoadSeq) return;
          if (this.contexto()?.idAtendimento?.trim() !== id) return;
          this.pagamentos = r.items ?? [];
          this.resumoPagamentos = r.resumo ?? RESUMO_VAZIO;
          this.sincronizarDescontoResumoDoBackendELeitura(true);
          this.sincronizarCreditoUsadoDosPagamentos();
          this.carregandoPagamentos = false;
        },
        error: () => {
          if (seq !== this.pagamentosLoadSeq) return;
          this.carregandoPagamentos = false;
        },
      });
  }

  /** Chamado pelo pai depois de fechar o sub-drawer Faturar (para refrescar resumo). */
  recarregarAposFaturar(): void {
    this.recarregarDadosComanda();
    const id = this.contexto()?.idAtendimento?.trim();
    if (id) {
      this.recarregarResumoPagamentos(id);
    }
    const cid = this.contexto()?.clienteId?.trim();
    if (cid) {
      this.api
        .getCliente(cid)
        .pipe(take(1), catchError(() => of(null)))
        .subscribe((row) => {
          if (row && (this.contexto()?.clienteId ?? '').trim() === cid) {
            this.clienteApi = row;
            if (!this.comandaFinalizada()) {
              this.creditoResumoCtrl.setValue(formataMoedaBrl(0), {
                emitEvent: false,
              });
              this.creditoResumoCtrl.markAsPristine();
              this.aplicarCreditoAutomaticoSeElegivel();
            }
          }
        });
    }
  }

  /**
   * Após gravar a ficha no drawer de cliente (comandas): repõe dados do cliente
   * na sidebar — o effect não volta a disparar GET sozinho.
   */
  recarregarClienteAposSalvarFicha(clienteId: string): void {
    const cid = (clienteId || '').trim();
    if (!cid) return;
    this.api
      .getCliente(cid)
      .pipe(take(1), catchError(() => of(null)))
      .subscribe((row) => {
        if (!row || (this.contexto()?.clienteId ?? '').trim() !== cid) return;
        this.clienteApi = row;
        this.aplicarCreditoAutomaticoSeElegivel();
      });
  }

  /** Recarrega itens + resumo com o contexto actual (usado após salvar edição). */
  recarregarDadosComanda(): void {
    const ctx = this.contexto();
    const ymd = (ctx?.dataYmd ?? '').trim();
    const idAt = (ctx?.idAtendimento ?? '').trim();
    if (!idAt || !/^\d{4}-\d{2}-\d{2}$/.test(ymd)) return;
    /** Mantém a lista visível (sem flash) quando já há itens — evita shake no drawer. */
    this.carregarLinhasAtendimento(ymd, idAt, { soft: true });
    this.recarregarResumoPagamentos(idAt);
    this.notificarSidebarContagens();
  }

  private notificarSidebarContagens(): void {
    this.clientSidebarRef()?.refreshContagens();
  }

  // ----- Itens (leitura) ----------------------------------------------------

  blocosLeitura(): LinhaResumoComanda[] {
    const out: LinhaResumoComanda[] = [];
    /** Mega e Pacote: agrupar por nome do pacote. */
    const grupos = new Map<string, AtendimentoListaItem[]>();
    const soltas: AtendimentoListaItem[] = [];

    for (const l of this.linhasAtendimentoApi) {
      const tp = String(l.tipo ?? '').trim().toLowerCase();
      if (tp === 'mega' || tp === 'pacote' || isTipoPacoteQueratinaNorm(tp)) {
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
        tipoCab === 'mega'
          ? 'Mega'
          : isTipoPacoteQueratinaNorm(tipoCab)
            ? 'Pacote Adesivo+Queratina'
            : 'Pacote';
      const nome =
        String(cabeca.pacote ?? '').trim() ||
        linhaResumoAtendimentoLista(cabeca);
      const etapas: LinhaResumoComanda['etapas'] = [];
      for (const l of linhas) {
        const et = String(l.etapa ?? '').trim();
        if (!et) continue;
        const prof = String(l.profissional ?? '').trim();
        let valorEtapaBrl: string | null = null;
        if (tipo === 'Mega') {
          const v = valorMonetarioParaNumero(l.valor);
          if (v != null && v >= 0) {
            valorEtapaBrl = formataMoedaBrl(v);
          }
        }
        etapas.push({
          titulo: et,
          subtitulo: prof ? `Profissional: ${prof}` : '',
          linhaEtapa: l,
          valorEtapaBrl,
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

    soltas.sort((a, b) => (a.linha_id ?? 0) - (b.linha_id ?? 0));

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
      /** Produto: só o nome de catálogo; `descricao` agrega pacote/etapa e não deve ir ao título. */
      let titulo =
        tipo === 'Produto'
          ? tituloProdutoLeituraSemQtd(
              String(l.produtoNome ?? '').trim() ||
                linhaResumoAtendimentoLista(l) ||
                String(l.descricao ?? '').trim() ||
                '',
            )
          : linhaResumoAtendimentoLista(l) || l.descricao || '';
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

    /** Ordem de criação na BD (`atendimentos.id`): o último item gravado fica por baixo. */
    out.sort((a, b) => {
      const ida = a.linha.linha_id ?? 0;
      const idb = b.linha.linha_id ?? 0;
      return ida - idb;
    });
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
      tipoNorm === 'mega' ||
      tipoNorm === 'pacote' ||
      isTipoPacoteQueratinaNorm(tipoNorm);
    /** Mega/Pacote: não usar pivot partilhado (ver `totalLinhaPreferencialAtendimento`). */
    const totalN = megaOuPac
      ? totalLinhaPreferencialAtendimento(l)
      : (itemRef?.total_linha != null
          ? valorMonetarioParaNumero(itemRef.total_linha)
          : null) ?? totalLinhaPreferencialAtendimento(l);
    /**
     * Desconto por item: só a pivot (`itemRef.desconto`).
     * Desconto da comanda vive em `desconto_comanda` / resumo — nunca em «Desc.».
     * Mega/Pacote: desconto só no resumo da comanda.
     */
    const descN = megaOuPac
      ? null
      : itemRef?.desconto != null
        ? valorMonetarioParaNumero(itemRef.desconto)
        : null;
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
    const unitRaw = megaOuPac
      ? qEff > 0
        ? total / qEff
        : total
      : (itemRef?.valor_unitario != null
          ? valorMonetarioParaNumero(itemRef.valor_unitario)
          : null) ?? (qEff > 0 ? total / qEff : total);
    return {
      mostrarQtd,
      textoQtd,
      unitario: formataMoedaBrl(Math.max(0, unitRaw ?? 0)),
      desconto: formataMoedaBrl(desc),
      total: formataMoedaBrl(total),
    };
  }

  /**
   * Faixa monetária do cartão. Mega/Pacote: sempre na linha principal (etapas só texto);
   * se a cabeça não tiver totais, usa a primeira etapa com valores.
   */
  faixaPrecoBloc(bloco: LinhaResumoComanda): {
    mostrarQtd: boolean;
    textoQtd: string;
    unitario: string;
    desconto: string;
    total: string;
  } | null {
    const tpMega =
      bloco.tipo === 'Mega' ||
      bloco.tipo === 'Pacote' ||
      bloco.tipo === 'Pacote Adesivo+Queratina';
    if (tpMega) {
      const lCab = bloco.linha;
      const q = this.quantidadeLinha(lCab);
      const qEff = q != null && q > 0 ? q : 1;
      const mostrarQtd = q != null && q > 0;
      const textoQtd = String(qEff).replace('.', ',');

      if (bloco.tipo === 'Pacote' || bloco.tipo === 'Pacote Adesivo+Queratina') {
        /** Valor do pacote na BD (cabeça; etapas costumam vir 0). */
        const totalN = valorMonetarioParaNumero(lCab.valor);
        if (totalN == null) {
          const fb = this.faixaPrecoLinha(lCab);
          if (fb != null) return fb;
          for (const e of bloco.etapas) {
            const s =
              e.linhaEtapa != null ? this.faixaPrecoLinha(e.linhaEtapa) : null;
            if (s != null) return s;
          }
          return null;
        }
        const total = Math.max(0, totalN);
        const unit = qEff > 0 ? total / qEff : total;
        return {
          mostrarQtd,
          textoQtd,
          unitario: formataMoedaBrl(unit),
          desconto: formataMoedaBrl(0),
          total: formataMoedaBrl(total),
        };
      }

      /** Mega: total cobrado = soma dos `valor` das etapas (regras_mega gravados na BD). */
      let somaEtapas = 0;
      let algumValor = false;
      for (const e of bloco.etapas) {
        const le = e.linhaEtapa;
        if (!le) continue;
        const v = valorMonetarioParaNumero(le.valor);
        if (v != null) {
          algumValor = true;
          somaEtapas += Math.max(0, v);
        }
      }
      let totalMega = somaEtapas;
      if (!algumValor && bloco.etapas.length === 0) {
        const vCab = valorMonetarioParaNumero(lCab.valor);
        if (vCab != null) totalMega = Math.max(0, vCab);
      }
      if (!algumValor && bloco.etapas.length > 0) {
        const fb = this.faixaPrecoLinha(lCab);
        if (fb != null) return fb;
        for (const e of bloco.etapas) {
          const s =
            e.linhaEtapa != null ? this.faixaPrecoLinha(e.linhaEtapa) : null;
          if (s != null) return s;
        }
        return null;
      }
      /**
       * Mega: unitário = total do serviço (soma das etapas). O detalhe por etapa
       * continua ao lado do nome; as colunas unitário/total ficam iguais (qtd 1).
       */
      const unit = qEff > 0 ? totalMega / qEff : totalMega;
      return {
        mostrarQtd,
        textoQtd,
        unitario: formataMoedaBrl(unit),
        desconto: formataMoedaBrl(0),
        total: formataMoedaBrl(totalMega),
      };
    }
    return this.faixaPrecoLinha(bloco.linha);
  }

  private quantidadeLinha(l: AtendimentoListaItem): number | null {
    const id = l.linha_id;
    if (id != null) {
      const qKnown = this.quantidadePorLinhaId.get(id);
      if (qKnown != null && qKnown > 0) return qKnown;
      const hit = this.pivotCatalogoPorLinhaId.get(id);
      const qPivot = Number(hit?.quantidade);
      if (Number.isFinite(qPivot) && qPivot > 0) return qPivot;
    }
    const itens = l.itens_catalogo ?? l.itens;
    if (!itens || itens.length === 0) return null;
    const tipoL = String(l.tipo ?? '').trim().toLowerCase();
    const pivotTipo =
      tipoL === 'serviço' || tipoL === 'servico'
        ? 'servico'
        : tipoL === 'produto'
          ? 'produto'
          : tipoL === 'cabelo'
            ? 'cabelo'
            : null;
    const principal =
      (pivotTipo ? itens.find((it) => it.tipo === pivotTipo) : null) ??
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
   *
   * Importante: GET só por `id_atendimento` (com cache-bust), sem filtrar pela
   * data do contexto — após editar itens a data pode divergir e o filtro
   * `data+id` devolvia lista vazia/antiga. Também ignora respostas fora de ordem
   * (GET em voo antes do excluir+recriar sobrescrevia o UI).
   */
  private carregarLinhasAtendimento(
    _ymd: string,
    idAt: string,
    opts?: { soft?: boolean },
  ): { unsubscribe(): void } {
    this.linhasLoadSub?.unsubscribe();
    const soft =
      opts?.soft === true && this.linhasAtendimentoApi.length > 0;
    if (!soft) {
      this.carregandoItens = true;
    }
    this.erroItens = '';
    const seq = ++this.linhasLoadSeq;
    const id = idAt.trim();
    const sub = this.api
      .listAgendamentosPorIdParaEdicao(id)
      .pipe(
        take(1),
        catchError((e: Error) => {
          if (seq === this.linhasLoadSeq) {
            this.erroItens =
              e.message || 'Não foi possível carregar os itens do agendamento.';
            this.carregandoItens = false;
          }
          return of([] as AtendimentoListaItem[]);
        }),
        map((rows) => {
          if (seq !== this.linhasLoadSeq) return rows;
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
        next: () => {
          if (seq !== this.linhasLoadSeq) return;
          if (this.contexto()?.idAtendimento?.trim() !== id) return;
          this.sincronizarDescontoResumoDoBackendELeitura(false);
          this.aplicarCreditoAutomaticoSeElegivel();
          this.aplicarEstadoCamposComandaFinalizada();
          this.sincronizarCreditoUsadoDosPagamentos();
        },
      });
    this.linhasLoadSub = sub;
    return sub;
  }

  /** Comanda finalizada: desabilita campos editáveis (Data permanece editável). */
  private aplicarEstadoCamposComandaFinalizada(): void {
    const fin = this.comandaFinalizada();
    const ctrls = [
      this.clienteNomeCtrl,
      this.descontoResumoCtrl,
      this.creditoResumoCtrl,
      this.clienteComandaCtrl,
    ];
    for (const c of ctrls) {
      if (fin) {
        c.disable({ emitEvent: false });
      } else if (c.disabled) {
        c.enable({ emitEvent: false });
      }
    }
    if (this.dataComandaCtrl.disabled) {
      this.dataComandaCtrl.enable({ emitEvent: false });
    }
  }

  private sincronizarDescontoResumoDoBackendELeitura(_forcar: boolean): void {
    const api = this.resumoPagamentos?.desconto ?? 0;
    const local = this.descontoAtualReais();
    /**
     * Utilizador já digitou nesta sessão: não deixar o GET (ainda sem desconto)
     * apagar o valor local antes do PATCH terminar.
     */
    if (
      this.descontoSessaoReais != null &&
      this.descontoSessaoReais > 0.005 &&
      api <= 0.005
    ) {
      return;
    }
    if (!this.descontoResumoCtrl.pristine && api <= 0.005) {
      return;
    }
    if (
      this.descontoResumoCtrl.dirty &&
      local > 0.005 &&
      Math.abs(local - api) > 0.005
    ) {
      return;
    }
    /**
     * Só `desconto_comanda` (API). Nunca copiar «Desc.» dos itens para este
     * campo — isso gravava o desconto do item como desconto da comanda e,
     * ao Salvar, apagava o da pivot.
     */
    const v = Math.round(Math.max(0, api) * 100) / 100;
    if (Math.abs(local - v) <= 0.005) {
      this.descontoResumoCtrl.markAsPristine();
      this.descontoSessaoReais = v > 0.005 ? v : null;
      return;
    }
    this.descontoResumoCtrl.setValue(formataMoedaBrl(v), {
      emitEvent: false,
    });
    this.descontoResumoCtrl.markAsPristine();
    this.descontoSessaoReais = v > 0.005 ? v : null;
  }

  /** Valor a persistir: sessão do utilizador tem prioridade sobre o controlo. */
  private descontoAtualReais(): number {
    if (this.descontoSessaoReais != null) {
      return Math.max(0, this.descontoSessaoReais);
    }
    return this.valorMonetarioCampoResumo(this.descontoResumoCtrl.value);
  }

  /** Soma pagamentos `outros` gravados como uso de crédito do cliente. */
  private somaCreditoClienteUsadoEmPagamentos(): number {
    let s = 0;
    for (const p of this.pagamentos) {
      if (p.metodo !== 'outros') continue;
      const obs = String(p.observacao ?? '').toLowerCase();
      if (!obs.includes('crédito') && !obs.includes('credito')) continue;
      s += parseFloat(p.valor) || 0;
    }
    return Math.round(s * 100) / 100;
  }

  /** Em comanda finalizada, exibe o crédito já utilizado (readonly). */
  private sincronizarCreditoUsadoDosPagamentos(): void {
    if (!this.comandaFinalizada()) return;
    const usado = this.somaCreditoClienteUsadoEmPagamentos();
    this.creditoResumoCtrl.setValue(formataMoedaBrl(usado), {
      emitEvent: false,
    });
    this.creditoResumoCtrl.markAsPristine();
  }

  private reconstruirMapaQuantidade(rows: AtendimentoListaItem[]): void {
    this.quantidadePorLinhaId.clear();
    this.pivotCatalogoPorLinhaId.clear();
    const itensAny = rows.find((r) => (r.itens_catalogo?.length ?? 0) > 0 || (r.itens?.length ?? 0) > 0);
    const catalogo = (itensAny?.itens_catalogo ?? itensAny?.itens ?? []).slice();
    if (!catalogo.length) return;

    const tipoLinhaParaPivot = (
      tipo: string,
    ): AtendimentoItemCatalogo['tipo'] | null => {
      const t = tipo.trim().toLowerCase();
      if (t === 'serviço' || t === 'servico') return 'servico';
      if (t === 'produto') return 'produto';
      if (t === 'mega') return 'mega';
      if (t === 'pacote') return 'pacote';
      if (isTipoPacoteQueratinaNorm(t)) return 'pacote_queratina';
      if (t === 'cabelo') return 'cabelo';
      return null;
    };

    const pivotJaUsado = new Set<AtendimentoItemCatalogo>();

    const escolherPivotParaLinha = (
      row: AtendimentoListaItem,
    ): AtendimentoItemCatalogo | undefined => {
      const pivotTipo = tipoLinhaParaPivot(String(row.tipo ?? ''));
      if (!pivotTipo) return undefined;
      const candidatos = catalogo.filter(
        (it) => it.tipo === pivotTipo && !pivotJaUsado.has(it),
      );
      if (!candidatos.length) return undefined;

      if (pivotTipo === 'servico' && candidatos.length > 1) {
        const tam = String(row.tamanho ?? '').trim();
        const pid = row.profissional_id;
        const porTamProf = candidatos.find(
          (it) =>
            (!tam || String(it.tamanho ?? '').trim() === tam) &&
            (pid == null ||
              it.profissional_id == null ||
              it.profissional_id === pid),
        );
        const hit = porTamProf ?? candidatos[0];
        pivotJaUsado.add(hit);
        return hit;
      }

      if (pivotTipo === 'produto' && candidatos.length > 1) {
        const nome = String(row.produtoNome ?? '').trim().toLowerCase();
        if (nome) {
          const porValor = candidatos.find((it) => {
            const vu = valorMonetarioParaNumero(it.valor_unitario);
            const rowV = valorMonetarioParaNumero(row.valor);
            if (vu == null || rowV == null) return false;
            return Math.abs(vu - rowV) < 0.02;
          });
          const hit = porValor ?? candidatos[0];
          pivotJaUsado.add(hit);
          return hit;
        }
      }

      if (
        pivotTipo === 'mega' ||
        pivotTipo === 'pacote' ||
        pivotTipo === 'pacote_queratina'
      ) {
        const pac = String(row.pacote ?? '').trim();
        const et = String(row.etapa ?? '').trim();
        const filtro = candidatos.filter((it) => {
          const ip = String(it.pacote ?? '').trim();
          if (pac && ip && ip !== pac) return false;
          const ie = String(it.etapa ?? '').trim();
          return ie === et;
        });
        const hit = filtro[0] ?? candidatos[0];
        pivotJaUsado.add(hit);
        return hit;
      }

      const hit = candidatos[0];
      pivotJaUsado.add(hit);
      return hit;
    };

    const ordenados = [...rows].sort(
      (a, b) => (a.linha_id ?? 0) - (b.linha_id ?? 0),
    );
    for (const row of ordenados) {
      if (row.linha_id == null) continue;
      const hit = escolherPivotParaLinha(row);
      if (hit == null) continue;
      this.pivotCatalogoPorLinhaId.set(row.linha_id, hit);
      const q = Number(hit.quantidade ?? 0);
      if (Number.isFinite(q) && q > 0) {
        this.quantidadePorLinhaId.set(row.linha_id, q);
      }
    }
  }

  // ----- Resumo / status ----------------------------------------------------

  comandaFinalizada(): boolean {
    return (
      String(this.linhasAtendimentoApi[0]?.cobrancaStatus ?? '')
        .trim()
        .toLowerCase() === 'finalizada'
    );
  }

  /**
   * Coluna Status alinhada à lista de comandas: Pendente (não faturada) | Finalizado.
   */
  rotuloStatus(): string {
    return this.comandaFinalizada() ? 'Finalizado' : 'Pendente';
  }

  classeBadgeComanda(): 'badge--finalizado' | 'badge--warn' {
    return this.comandaFinalizada() ? 'badge--finalizado' : 'badge--warn';
  }

  // ----- Ações --------------------------------------------------------------

  podeFaturar(): boolean {
    return Boolean(
      this.contexto()?.idAtendimento?.trim() &&
        this.linhasAtendimentoApi.length > 0,
    );
  }

  podeEditar(): boolean {
    return (
      Boolean(this.contexto()?.idAtendimento?.trim()) &&
      !this.comandaFinalizada()
    );
  }

  podeSalvarComandaRodape(): boolean {
    return this.podeEditar();
  }

  /** Mostra o botão Excluir sempre que há comanda aberta. */
  podeMostrarBotaoExcluir(): boolean {
    return Boolean(this.contexto()?.idAtendimento?.trim());
  }

  /** Pode confirmar exclusão na API (sem dinheiro em caixa). */
  podeExcluirComanda(): boolean {
    return this.podeMostrarBotaoExcluir() && !this.exclusaoBloqueadaPorCaixa();
  }

  /**
   * Só bloqueia exclusão quando já entrou dinheiro em caixa (`total_pago`).
   * Status «pago» só por parcelas a receber (cartão) não impede excluir.
   */
  comandaTemPagamentosRegistados(): boolean {
    return this.exclusaoBloqueadaPorCaixa();
  }

  exclusaoBloqueadaPorCaixa(): boolean {
    const r = this.resumoPagamentos;
    const pago = Number(r?.total_pago ?? 0);
    if (Number.isFinite(pago) && pago > 0.005) return true;
    return this.pagamentos.some((p) => {
      const m = String(p.metodo ?? '')
        .trim()
        .toLowerCase();
      return m !== '' && m !== 'a_receber_cartao' && m !== 'pendente';
    });
  }

  /** Fiado ou parcelas de cartão ainda a receber — saem no cascade, mas avisamos. */
  temPendenciasFinanceirasSemCaixa(): boolean {
    if (this.exclusaoBloqueadaPorCaixa()) return false;
    return this.pagamentos.some((p) => {
      const m = String(p.metodo ?? '')
        .trim()
        .toLowerCase();
      return m === 'a_receber_cartao' || m === 'pendente';
    });
  }

  motivoExclusaoBloqueada(): string {
    return 'Esta comanda tem pagamentos em caixa. Remova-os em «Ver pagamentos» antes de excluir, para não afetar o financeiro.';
  }

  abrirEditarAgendamento(): void {
    if (!this.podeEditar()) return;
    this.fecharExcluirMenu();
    this.editarAgendamento.emit();
  }

  abrirFaturar(): void {
    const id = this.contexto()?.idAtendimento?.trim();
    if (!id || !this.podeFaturar()) return;
    this.fecharExcluirMenu();
    const r = this.resumoPagamentos;
    /** Subtotal = soma dos totais de linha (já com desconto por item). */
    const bruto = this.somaTotaisItensComanda();
    const desc = this.descontoAtualReais();
    const creditoAUsar = this.valorMonetarioCampoResumo(
      this.creditoResumoCtrl.value,
    );
    const cash = this.cashbackComandaReais();
    const total = Math.max(
      0,
      Math.round((bruto - desc - cash) * 100) / 100,
    );
    const totalPago = r.total_pago ?? 0;
    const saldo = Math.max(
      0,
      Math.round((total - totalPago - creditoAUsar) * 100) / 100,
    );
    const resumoEmit = {
      ...r,
      total_bruto: bruto,
      desconto: desc,
      total,
      saldo,
    };
    const emitir = () => {
      this.faturarComanda.emit({
        idAtendimento: id,
        creditoAUsar: creditoAUsar > 0.005 ? creditoAUsar : undefined,
        dataComandaYmd: this.dataComandaYmdParaFaturar(),
        modoVerPagamentos: this.comandaFinalizada(),
        resumo: resumoEmit,
      });
    };
    this.persistirDescontoComanda$(id, desc).subscribe((resumoApi) => {
      if (resumoApi) {
        this.resumoPagamentos = {
          ...this.resumoPagamentos,
          ...resumoApi,
          total_bruto: bruto,
          desconto: desc,
          total,
          saldo,
        };
      }
      emitir();
    });
  }

  gravarRodape(): void {
    if (!this.podeSalvarComandaRodape()) return;
    this.fecharExcluirMenu();
    const id = this.contexto()?.idAtendimento?.trim();
    if (!id) {
      this.salvarComanda.emit();
      return;
    }
    const desc = this.descontoAtualReais();
    /** Sempre emite Salvar — o desconto tenta gravar, mas não bloqueia o fecho. */
    this.persistirDescontoComanda$(id, desc)
      .pipe(
        take(1),
        catchError(() => of(null)),
      )
      .subscribe(() => this.salvarComanda.emit());
  }

  /** Grava o desconto assim que o utilizador sai do campo (não espera o Salvar). */
  onDescontoResumoBlur(): void {
    if (this.comandaFinalizada()) return;
    const id = this.contexto()?.idAtendimento?.trim();
    if (!id) return;
    this.descontoSessaoReais = this.valorMonetarioCampoResumo(
      this.descontoResumoCtrl.value,
    );
    this.persistirDescontoComanda$(id, this.descontoAtualReais())
      .pipe(take(1))
      .subscribe();
  }

  /**
   * Grava `desconto_comanda` na API. Pedidos iguais em paralelo partilham o HTTP;
   * se o valor mudou, inicia um novo PATCH.
   */
  private descontoPersistInFlight$: Observable<ComandaResumoPagamentos | null> | null =
    null;
  private descontoPersistInFlightKey: string | null = null;

  private persistirDescontoComanda$(
    idAtendimento: string,
    desc: number,
  ): Observable<ComandaResumoPagamentos | null> {
    this.descontoSessaoReais = desc;
    const key = `${idAtendimento}|${Math.round(desc * 100)}`;
    if (
      this.descontoPersistInFlight$ &&
      this.descontoPersistInFlightKey === key
    ) {
      return this.descontoPersistInFlight$;
    }
    this.persistindoDesconto = true;
    this.descontoPersistInFlightKey = key;
    this.descontoPersistInFlight$ = this.api
      .aplicarDescontoComanda(
        idAtendimento,
        desc > 0.005 ? formataMoedaBrl(desc) : '',
      )
      .pipe(
        take(1),
        map((resp) => {
          this.descontoResumoCtrl.setValue(formataMoedaBrl(desc), {
            emitEvent: false,
          });
          this.descontoResumoCtrl.markAsPristine();
          const descontoApi = Math.max(
            desc,
            Number(resp?.resumo?.desconto) || 0,
          );
          this.resumoPagamentos = {
            ...this.resumoPagamentos,
            ...(resp?.resumo ?? {}),
            desconto: descontoApi,
          };
          this.descontoSessaoReais = descontoApi > 0.005 ? descontoApi : desc;
          return this.resumoPagamentos;
        }),
        catchError((err: unknown) => {
          console.error('[comanda] falha ao gravar desconto', err);
          const msg =
            err instanceof Error && err.message.trim()
              ? err.message
              : 'Não foi possível gravar o desconto.';
          this.toast.showWarning(msg);
          return of(null);
        }),
        finalize(() => {
          if (this.descontoPersistInFlightKey === key) {
            this.persistindoDesconto = false;
            this.descontoPersistInFlight$ = null;
            this.descontoPersistInFlightKey = null;
          }
        }),
        shareReplay({ bufferSize: 1, refCount: true }),
      );
    return this.descontoPersistInFlight$;
  }

  // ----- Excluir ------------------------------------------------------------

  /**
   * Chevron + dropdown só quando há cartão na agenda (hora de início)
   * e comanda criada — aí faz sentido escolher «só comanda» vs «tudo».
   */
  temAgendamentoVinculado(): boolean {
    return this.linhasAtendimentoApi.some((l) =>
      Boolean(String(l.inicio ?? '').trim()),
    );
  }

  mostrarMenuExcluirComanda(): boolean {
    return this.podeMostrarBotaoExcluir() && this.temAgendamentoVinculado();
  }

  /**
   * Fecha o menu Excluir ao clicar fora do `.nc-excluir-wrap`.
   * O painel `app-drawer` faz stopPropagation no click, então document:click
   * sozinho não basta — mesmo padrão do faturar-drawer.
   */
  @HostListener('click', ['$event'])
  onHostClickFecharExcluirMenu(ev: MouseEvent): void {
    const el = ev.target as HTMLElement | null;
    if (
      this.dataComandaPickerOpen &&
      el &&
      !el.closest?.('.nc-data-field__wrap')
    ) {
      this.dataComandaPickerOpen = false;
    }
    if (!this.excluirMenuAberto || this.excluirMenuFechando) return;
    if (el?.closest?.('.nc-excluir-wrap')) return;
    this.fecharExcluirMenu();
  }

  /** Overlay / fora do drawer, quando o evento ainda chega ao document. */
  @HostListener('document:click', ['$event'])
  onDocumentClickFecharExcluirMenu(ev: MouseEvent): void {
    if (!this.excluirMenuAberto || this.excluirMenuFechando) return;
    const el = ev.target as HTMLElement | null;
    if (el?.closest?.('.nc-excluir-wrap')) return;
    this.fecharExcluirMenu();
  }

  onExcluirTriggerClick(ev?: MouseEvent): void {
    ev?.stopPropagation();
    if (this.excluindo || !this.podeMostrarBotaoExcluir()) return;
    this.dispararPulsoExcluir();
    if (this.mostrarMenuExcluirComanda()) {
      this.toggleExcluirMenu();
      return;
    }
    // Walk-in / sem slot na agenda: exclui a comanda sem menu.
    this.abrirModalExcluir('completo');
  }

  private dispararPulsoExcluir(): void {
    if (this.tPulsoExcluir != null) window.clearTimeout(this.tPulsoExcluir);
    this.pulsoExcluir = false;
    queueMicrotask(() => {
      this.pulsoExcluir = true;
      this.tPulsoExcluir = window.setTimeout(() => {
        this.pulsoExcluir = false;
        this.tPulsoExcluir = null;
      }, this.duracaoPulsoExcluirMs);
    });
  }

  private cancelarFechamentoExcluirMenu(): void {
    if (this.tExcluirMenuFechar != null) {
      window.clearTimeout(this.tExcluirMenuFechar);
      this.tExcluirMenuFechar = null;
    }
    this.excluirMenuFechando = false;
  }

  toggleExcluirMenu(): void {
    if (this.excluirMenuAberto && !this.excluirMenuFechando) {
      this.fecharExcluirMenu();
      return;
    }
    this.cancelarFechamentoExcluirMenu();
    // Abre no próximo tick para o click do mesmo gesto não fechar de imediato.
    setTimeout(() => {
      this.excluirMenuAberto = true;
    }, 0);
  }

  fecharExcluirMenu(): void {
    if (!this.excluirMenuAberto || this.excluirMenuFechando) return;
    this.excluirMenuFechando = true;
    this.tExcluirMenuFechar = window.setTimeout(() => {
      this.excluirMenuAberto = false;
      this.excluirMenuFechando = false;
      this.tExcluirMenuFechar = null;
    }, this.duracaoExcluirMenuFecharMs);
  }

  abrirModalExcluir(modo: 'somente_comanda' | 'completo'): void {
    if (!this.podeMostrarBotaoExcluir() || this.excluindo) return;
    this.cancelarFechamentoExcluirMenu();
    this.excluirMenuAberto = false;
    this.modoExclusaoConfirmar = modo;
    this.erroExcluir = '';
    this.modalConfirmExcluirAberto = true;
  }

  textoModalExcluir(): string {
    if (this.exclusaoBloqueadaPorCaixa()) {
      return this.motivoExclusaoBloqueada();
    }
    let base: string;
    if (!this.temAgendamentoVinculado()) {
      base = 'A comanda será removida. Esta ação não pode ser anulada.';
    } else if (this.modoExclusaoConfirmar === 'somente_comanda') {
      base =
        'A comanda será removida. O agendamento permanece na agenda para criar uma nova comanda.';
    } else {
      base =
        'A comanda e o cartão do agendamento na agenda serão removidos. Esta ação não pode ser anulada.';
    }
    if (this.temPendenciasFinanceirasSemCaixa()) {
      return (
        base +
        ' Parcelas a receber (cartão) e valores pendentes (fiado) também saem do financeiro.'
      );
    }
    return base;
  }

  fecharModalExcluir(): void {
    if (this.excluindo) return;
    this.modalConfirmExcluirAberto = false;
    this.erroExcluir = '';
  }

  /** Bloqueio por caixa: fecha o modal e abre Ver pagamentos. */
  irParaVerPagamentosAposBloqueio(): void {
    this.fecharModalExcluir();
    this.abrirFaturar();
  }

  confirmarExcluirComanda(): void {
    const id = this.contexto()?.idAtendimento?.trim();
    if (!id || this.excluindo) return;
    if (this.exclusaoBloqueadaPorCaixa()) {
      this.erroExcluir = this.motivoExclusaoBloqueada();
      return;
    }
    this.erroExcluir = '';
    this.excluindo = true;
    this.api
      .excluirAtendimento(id, { modoExclusao: this.modoExclusaoConfirmar })
      .subscribe({
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

  /** Cliente fundido (contexto + GET) com saldo bruto, sem descontar uso na comanda. */
  private clienteMergedBruto(): Cliente | null {
    const ctx = this.contexto();
    if (!ctx) return null;
    const base = ctx.cliente;
    const api = this.clienteApi;
    if (api && base && api.id === base.id) {
      return {
        ...base,
        ...api,
        creditoSaldo: api.creditoSaldo ?? base.creditoSaldo ?? 0,
        cashbackSaldo: api.cashbackSaldo ?? base.cashbackSaldo ?? 0,
      };
    }
    return api ?? base ?? null;
  }

  /** Cliente para a sidebar (saldo bruto da API; só muda após «Faturar» + refresh). */
  clienteParaSidebar(): Cliente | null {
    return this.clienteMergedBruto();
  }

  creditoDisponivelCliente(): number {
    const n = Number(this.clienteMergedBruto()?.creditoSaldo ?? 0);
    return Number.isFinite(n) ? Math.max(0, Math.round(n * 100) / 100) : 0;
  }

  /** Total antes de abater crédito (subtotal dos itens − desconto da comanda − cashback). */
  totalAntesAplicarCredito(): number {
    const cash = this.cashbackComandaReais();
    /** Totais das linhas já vêm líquidos do desconto por item (igual à lista de leitura). */
    const subtotalItens = this.somaTotaisItensComanda();
    const descComanda = this.descontoAtualReais();
    return Math.max(
      0,
      Math.round((subtotalItens - descComanda - cash) * 100) / 100,
    );
  }

  creditoMaximoUsavel(): number {
    return Math.max(
      0,
      Math.round(
        Math.min(
          this.creditoDisponivelCliente(),
          this.totalAntesAplicarCredito(),
        ) * 100,
      ) / 100,
    );
  }

  private aplicarCreditoAutomaticoSeElegivel(): void {
    if (this.comandaFinalizada()) return;
    const max = this.creditoMaximoUsavel();
    if (!this.creditoResumoCtrl.pristine) {
      this.clampCreditoResumoAoMaximo();
      return;
    }
    this.creditoResumoCtrl.setValue(formataMoedaBrl(max), { emitEvent: false });
  }

  private clampCreditoResumoAoMaximo(): void {
    const max = this.creditoMaximoUsavel();
    const cur = this.valorMonetarioCampoResumo(this.creditoResumoCtrl.value);
    if (cur > max + 0.0001) {
      this.creditoResumoCtrl.setValue(formataMoedaBrl(max), {
        emitEvent: false,
      });
    }
  }

  // ----- Helpers ------------------------------------------------------------

  dataComandaExibicao(): string {
    const ymd = this.contexto()?.dataYmd?.trim();
    if (!ymd || !/^\d{4}-\d{2}-\d{2}$/.test(ymd)) return '';
    const p = /^(\d{4})-(\d{2})-(\d{2})/.exec(ymd);
    return p ? `${p[3]}/${p[2]}/${p[1]}` : ymd;
  }

  whatsappDataSidebarFmt(): string | null {
    const d = this.dataComandaExibicao().trim();
    return d && d !== '—' ? d : null;
  }

  whatsappHoraSidebar(): string | null {
    return resolverHoraWhatsappAgendamento({
      linhasInicio: this.linhasAtendimentoApi,
    });
  }

  /** Data canónica da comanda para o sub-drawer Faturar (campo da UI ou contexto). */
  private dataComandaYmdParaFaturar(): string | null {
    const fromCtrl = parseFiltroDataDdMm(this.dataComandaCtrl.value);
    if (fromCtrl) return fromCtrl;
    const y = (this.contexto()?.dataYmd ?? '').trim();
    return /^\d{4}-\d{2}-\d{2}$/.test(y) ? y : null;
  }

  private dataYmdAtualPersistida(): string | null {
    const p = (this.dataYmdPersistida ?? '').trim();
    if (/^\d{4}-\d{2}-\d{2}$/.test(p)) return p;
    const y = (this.contexto()?.dataYmd ?? '').trim();
    return /^\d{4}-\d{2}-\d{2}$/.test(y) ? y : null;
  }

  private formatarYmdDdMm(ymd: string): string {
    const p = /^(\d{4})-(\d{2})-(\d{2})$/.exec(ymd.trim());
    return p ? `${p[3]}/${p[2]}/${p[1]}` : ymd;
  }

  private restaurarDataComandaNoCampo(): void {
    const ymd = this.dataYmdAtualPersistida();
    const txt = ymd ? this.formatarYmdDdMm(ymd) : this.dataComandaExibicao();
    this.dataComandaCtrl.setValue(txt, { emitEvent: false });
    this.dataComandaPickerOpen = false;
    this.comandaDataYmd.emit(ymd);
  }

  temPagamentosComanda(): boolean {
    return this.pagamentos.length > 0;
  }

  textoModalDataComanda(): string {
    const ymd = (this.dataPendenteYmd ?? '').trim();
    const fmt = ymd ? this.formatarYmdDdMm(ymd) : '—';
    if (this.temPagamentosComanda()) {
      return `Alterar a data da comanda para ${fmt}? Você pode atualizar só a comanda ou também as datas dos pagamentos (caixa).`;
    }
    return `Alterar a data da comanda para ${fmt}?`;
  }

  dataComandaYmdCalendario(): string {
    const y =
      this.dataComandaYmdParaFaturar() ?? this.dataYmdAtualPersistida() ?? '';
    if (/^\d{4}-\d{2}-\d{2}$/.test(y)) return y;
    return new Date().toISOString().slice(0, 10);
  }

  dataComandaExibicaoCampo(): string {
    const ymd = this.dataComandaYmdParaFaturar();
    if (ymd) return this.formatarYmdDdMm(ymd);
    const raw = this.dataComandaCtrl.value.trim();
    return raw || 'DD/MM/AAAA';
  }

  onDataComandaFieldClick(ev: Event): void {
    const t = ev.target as HTMLElement;
    if (
      t.closest('app-agenda-modal-calendar') ||
      t.closest('.nc-data-field__calendar-pop')
    ) {
      return;
    }
    ev.preventDefault();
    this.dataComandaPickerOpen = !this.dataComandaPickerOpen;
  }

  onDataComandaPicked(ymd: string): void {
    const y = String(ymd ?? '').trim();
    if (!/^\d{4}-\d{2}-\d{2}$/.test(y)) return;
    this.dataComandaPickerOpen = false;
    // Não emite ainda: o pai só atualiza depois de confirmar/persistir.
    this.dataComandaCtrl.setValue(this.formatarYmdDdMm(y), {
      emitEvent: false,
    });
    this.aplicarAlteracaoDataComanda(y);
  }

  onDataComandaBlur(): void {
    if (this.persistindoDataComanda || this.modalConfirmDataAberto) return;
    if (this.dataComandaPickerOpen) return;
    const id = this.contexto()?.idAtendimento?.trim();
    if (!id) return;

    const ymd = parseFiltroDataDdMm(this.dataComandaCtrl.value);
    if (!ymd) {
      this.restaurarDataComandaNoCampo();
      return;
    }
    this.dataComandaCtrl.setValue(this.formatarYmdDdMm(ymd), {
      emitEvent: false,
    });
    this.aplicarAlteracaoDataComanda(ymd);
  }

  onDataComandaKeydown(ev: KeyboardEvent): void {
    if (ev.key !== 'Enter') return;
    ev.preventDefault();
    (ev.target as HTMLElement | null)?.blur?.();
  }

  private aplicarAlteracaoDataComanda(ymd: string): void {
    const id = this.contexto()?.idAtendimento?.trim();
    if (!id) {
      this.comandaDataYmd.emit(ymd);
      return;
    }
    const atual = this.dataYmdAtualPersistida();
    if (atual && ymd === atual) return;

    if (this.comandaFinalizada() || this.temPagamentosComanda()) {
      this.dataPendenteYmd = ymd;
      this.erroDataComanda = '';
      this.modalConfirmDataAberto = true;
      return;
    }
    this.persistirDataComanda(ymd, false);
  }

  fecharModalDataComanda(): void {
    if (this.persistindoDataComanda) return;
    this.modalConfirmDataAberto = false;
    this.dataPendenteYmd = null;
    this.erroDataComanda = '';
    // Volta para a data persistida da comanda (antes da escolha no calendário).
    this.restaurarDataComandaNoCampo();
  }

  confirmarDataComandaSomente(): void {
    const ymd = (this.dataPendenteYmd ?? '').trim();
    if (!ymd) return;
    this.persistirDataComanda(ymd, false);
  }

  confirmarDataComandaComPagamentos(): void {
    const ymd = (this.dataPendenteYmd ?? '').trim();
    if (!ymd) return;
    this.persistirDataComanda(ymd, true);
  }

  private persistirDataComanda(
    ymd: string,
    atualizarPagamentos: boolean,
  ): void {
    const id = this.contexto()?.idAtendimento?.trim();
    if (!id || this.persistindoDataComanda) return;
    this.persistindoDataComanda = true;
    this.erroDataComanda = '';
    this.api
      .atualizarDataComanda(id, ymd, atualizarPagamentos)
      .pipe(take(1), takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: (r) => {
          this.persistindoDataComanda = false;
          this.dataYmdPersistida = r.data;
          this.dataComandaCtrl.setValue(this.formatarYmdDdMm(r.data), {
            emitEvent: false,
          });
          this.comandaDataYmd.emit(r.data);
          this.modalConfirmDataAberto = false;
          this.dataPendenteYmd = null;
          this.dataComandaPickerOpen = false;
          if (atualizarPagamentos) {
            this.recarregarResumoPagamentos(id);
          }
          this.toast.show(
            atualizarPagamentos
              ? 'Data da comanda e dos pagamentos atualizada.'
              : 'Data da comanda atualizada.',
          );
        },
        error: (err: unknown) => {
          this.persistindoDataComanda = false;
          const msg =
            extractApiErrorMessage(err) ||
            'Não foi possível atualizar a data.';
          this.erroDataComanda = msg;
          if (!this.modalConfirmDataAberto) {
            this.restaurarDataComandaNoCampo();
            this.toast.showWarning(msg);
          }
        },
      });
  }

  tituloComandaDrawer(): string {
    const ctx = this.contexto();
    if (!ctx?.acessar) return 'Nova comanda';
    const idAt = ctx?.idAtendimento?.trim();
    if (!idAt) return 'Nova comanda';
    const num = this.numeroComandaExibicao();
    if (this.podeEditar()) {
      return `Editando comanda #${num}`;
    }
    return `Visualizando comanda #${num}`;
  }

  /**
   * `#N` na UI: prioriza `numero_comanda` vindo da API nas linhas carregadas
   * (canónico após gravar); senão usa o contexto do pai.
   */
  numeroComandaExibicao(): number {
    const fromApi = this.numeroComandaDasLinhasCarregadas();
    if (fromApi != null) return fromApi;
    const n = this.contexto()?.numeroComandaTitulo;
    return typeof n === 'number' && Number.isFinite(n) && n > 0 ? n : 1;
  }

  private numeroComandaDasLinhasCarregadas(): number | null {
    let best: number | null = null;
    for (const r of this.linhasAtendimentoApi) {
      const n = r.numeroComanda;
      if (typeof n === 'number' && Number.isFinite(n) && n > 0) {
        best = best == null ? n : Math.max(best, n);
      }
    }
    return best;
  }

  brl(n: number): string {
    return formataMoedaBrl(n);
  }

  /** Soma dos totais exibidos por item/bloco (alinhado às faixas `faixaPrecoBloc`). */
  somaTotaisItensComanda(): number {
    let sum = 0;
    for (const b of this.blocosLeitura()) {
      const stripe = this.faixaPrecoBloc(b);
      if (!stripe) continue;
      const n = valorMonetarioParaNumero(stripe.total);
      if (n != null) sum += Math.max(0, n);
    }
    return Math.round(sum * 100) / 100;
  }

  valorMonetarioCampoResumo(s: string): number {
    const n = valorMonetarioParaNumero(s);
    return n != null && Number.isFinite(n) ? Math.max(0, n) : 0;
  }

  /** Reservado: quando existir crédito/cashback na API, devolver aqui. */
  cashbackComandaReais(): number {
    return 0;
  }

  totalComandaResumoCalculado(): number {
    const cred = this.valorMonetarioCampoResumo(this.creditoResumoCtrl.value);
    const antes = this.totalAntesAplicarCredito();
    return Math.max(0, Math.round((antes - cred) * 100) / 100);
  }

  normalizarCampoMoedaResumo(c: FormControl<string>): void {
    const n = this.valorMonetarioCampoResumo(c.value);
    c.setValue(formataMoedaBrl(n), { emitEvent: false });
  }

  /**
   * Reformata a cada tecla: interpreta os dígitos como centavos em cadeia
   * e posiciona o cursor no fim (caixa / TEF).
   */
  onCreditoResumoMoedaInput(ev: Event): void {
    this.creditoResumoCtrl.markAsDirty();
    this.onResumoMoedaInput(this.creditoResumoCtrl, ev);
  }

  onResumoMoedaInput(c: FormControl<string>, ev: Event): void {
    const el = ev.target as HTMLInputElement | null;
    if (!el) return;
    const formatted = moedaResumoAPartirDosDigitos(el.value);
    if (c.value !== formatted) {
      c.setValue(formatted, { emitEvent: true });
    }
    queueMicrotask(() => {
      const len = el.value.length;
      el.setSelectionRange(len, len);
    });
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
