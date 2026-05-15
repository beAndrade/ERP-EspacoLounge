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
import { catchError, map, of, take } from 'rxjs';
import { AgendaNovoClientSidebarComponent } from '../agenda-novo/agenda-novo-client-sidebar.component';
import type {
  AtendimentoItemCatalogo,
  AtendimentoListaItem,
  Cliente,
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

/** Máscara de moeda nos campos do resumo (placeholder + valor exibido). */
const PLACEHOLDER_MOEDA_RESUMO = 'R$0,00';

/**
 * Entrada só por dígitos: cada dígito acrescenta à direita em centavos
 * (ex.: 1 → R$ 0,01; 15 → R$ 0,15; 150 → R$ 1,50).
 */
function moedaResumoAPartirDosDigitos(raw: string): string {
  const digits = String(raw ?? '').replace(/\D/g, '');
  const MAX_DIG = 12;
  const trimmed =
    digits.length > MAX_DIG ? digits.slice(-MAX_DIG) : digits;
  const centInt =
    trimmed === '' ? 0 : Math.min(parseInt(trimmed, 10), 999999999999);
  const n =
    Number.isFinite(centInt) && centInt >= 0 ? Math.round(centInt) / 100 : 0;
  return formataMoedaBrl(n);
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
  /** Resumo manual: desconto (moeda em texto pt-BR). */
  readonly descontoResumoCtrl = new FormControl(formataMoedaBrl(0), {
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

  outrosMenuAberto = false;
  modalConfirmExcluirAberto = false;
  modalOutrosOpcao: 'imprimir' | 'historico' | null = null;
  excluindo = false;
  erroExcluir = '';
  /** Último GET `/api/clientes/:id` para `creditoSaldo` e sidebar. */
  private clienteApi: Cliente | null = null;
  private lastClienteFetchId = '';
  /** Evita repor crédito ao reexecutar o effect com o mesmo `id_atendimento`. */
  private lastIdAtParaCamposResumo = '';

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
          this.lastIdAtParaCamposResumo = '';
          this.lastClienteFetchId = '';
          this.clienteApi = null;
          this.descontoResumoCtrl.setValue(formataMoedaBrl(0), {
            emitEvent: false,
          });
          this.descontoResumoCtrl.markAsPristine();
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
              }
            });
        }
        if (idAt !== this.lastIdAtParaCamposResumo) {
          this.lastIdAtParaCamposResumo = idAt;
          this.descontoResumoCtrl.setValue(formataMoedaBrl(0), {
            emitEvent: false,
          });
          this.descontoResumoCtrl.markAsPristine();
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
          if (this.contexto()?.idAtendimento?.trim() !== id) return;
          this.pagamentos = r.items ?? [];
          this.resumoPagamentos = r.resumo ?? RESUMO_VAZIO;
          this.sincronizarDescontoResumoDoBackendELeitura(true);
          this.carregandoPagamentos = false;
        },
      });
  }

  /** Chamado pelo pai depois de fechar o sub-drawer Faturar (para refrescar resumo). */
  recarregarAposFaturar(): void {
    const id = this.contexto()?.idAtendimento?.trim();
    if (id) this.recarregarResumoPagamentos(id);
    const cid = this.contexto()?.clienteId?.trim();
    if (cid) {
      this.api
        .getCliente(cid)
        .pipe(take(1), catchError(() => of(null)))
        .subscribe((row) => {
          if (row && (this.contexto()?.clienteId ?? '').trim() === cid) {
            this.clienteApi = row;
          }
        });
    }
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
                '—',
            )
          : linhaResumoAtendimentoLista(l) || l.descricao || '—';
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
      tipoNorm === 'mega' || tipoNorm === 'pacote';
    /** Mega/Pacote: não usar pivot partilhado (ver `totalLinhaPreferencialAtendimento`). */
    const totalN = megaOuPac
      ? totalLinhaPreferencialAtendimento(l)
      : (itemRef?.total_linha != null
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
      desconto: desc > 0 ? formataMoedaBrl(desc) : '—',
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
    const tpMega = bloco.tipo === 'Mega' || bloco.tipo === 'Pacote';
    if (tpMega) {
      const lCab = bloco.linha;
      const q = this.quantidadeLinha(lCab);
      const qEff = q != null && q > 0 ? q : 1;
      const mostrarQtd = q != null && q > 0;
      const textoQtd = String(qEff).replace('.', ',');

      if (bloco.tipo === 'Pacote') {
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
          desconto: '—',
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
      /** Mega: total na coluna Total; V. unit. fica «—» (valor por etapa ao lado do nome). */
      return {
        mostrarQtd,
        textoQtd,
        unitario: '—',
        desconto: '—',
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
        next: () => {
          this.sincronizarDescontoResumoDoBackendELeitura(false);
        },
      });
  }

  /**
   * Mantém o input «Desconto» alinhado ao resumo da API e aos descontos por linha
   * mostrados na tabela (evita total certo com campo a R$ 0,00).
   */
  private sincronizarDescontoResumoDoBackendELeitura(forcar: boolean): void {
    if (!forcar && !this.descontoResumoCtrl.pristine) return;
    const implicit = this.somaDescontosExibidosPorItensComanda();
    const api = this.resumoPagamentos?.desconto ?? 0;
    const v = Math.round(Math.max(api, implicit) * 100) / 100;
    this.descontoResumoCtrl.setValue(formataMoedaBrl(v), {
      emitEvent: false,
    });
    this.descontoResumoCtrl.markAsPristine();
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

      if (pivotTipo === 'mega' || pivotTipo === 'pacote') {
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

  /**
   * Rótulos alinhados à lista de comandas (`rotuloStatus` em `comandas.component.ts`).
   */
  rotuloStatus(): string {
    switch (this.resumoPagamentos.status) {
      case 'pago':
        return 'Pago';
      case 'parcial':
        return 'Parcial';
      case 'pendente':
        return 'Pendente';
      default:
        return 'Em aberto';
    }
  }

  /** Mesma lógica de cor que `classeBadgeStatus` na lista de comandas. */
  classeBadgeComanda():
    | 'badge--ok'
    | 'badge--warn'
    | 'badge--info'
    | 'badge--aviso' {
    const s = this.resumoPagamentos.status;
    if (s === 'pago') return 'badge--ok';
    if (s === 'parcial') return 'badge--warn';
    if (s === 'pendente') return 'badge--info';
    return 'badge--aviso';
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
    const r = this.resumoPagamentos;
    const bruto = this.subtotalBrutoAntesDescontoResumo();
    const desc = this.valorMonetarioCampoResumo(this.descontoResumoCtrl.value);
    const total = this.totalComandaResumoCalculado();
    const totalPago = r.total_pago ?? 0;
    const saldo = Math.max(
      0,
      Math.round((total - totalPago) * 100) / 100,
    );
    this.faturarComanda.emit({
      idAtendimento: id,
      resumo: {
        ...r,
        total_bruto: bruto,
        desconto: desc,
        total,
        saldo,
      },
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

  /** Cliente para a sidebar: funde contexto com último GET (ex.: `creditoSaldo`). */
  clienteParaSidebar(): Cliente | null {
    const ctx = this.contexto();
    if (!ctx) return null;
    const base = ctx.cliente;
    const api = this.clienteApi;
    if (api && base && api.id === base.id) {
      return {
        ...base,
        ...api,
        creditoSaldo: api.creditoSaldo ?? base.creditoSaldo ?? 0,
      };
    }
    return api ?? base ?? null;
  }

  /** Saldo de crédito do cliente (só leitura no resumo). */
  creditoClienteResumoBrl(): string {
    return formataMoedaBrl(this.clienteParaSidebar()?.creditoSaldo ?? 0);
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
    const num = this.numeroComandaExibicao();
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

  /** Soma das colunas «Desc.» por linha (Mega/Pacote costumam vir «—»; aí prevalece o desconto da API). */
  private somaDescontosExibidosPorItensComanda(): number {
    let sum = 0;
    for (const b of this.blocosLeitura()) {
      const stripe = this.faixaPrecoBloc(b);
      if (!stripe) continue;
      const raw = String(stripe.desconto ?? '').trim();
      if (!raw || raw === '—') continue;
      const n = valorMonetarioParaNumero(raw);
      if (n != null && Number.isFinite(n) && n > 0) sum += n;
    }
    return Math.round(sum * 100) / 100;
  }

  /**
   * Subtotal «bruto» antes do campo resumo: totais já líquidos na tabela + descontos
   * mostrados por linha, para não duplicar a subtracção no total.
   */
  private subtotalBrutoAntesDescontoResumo(): number {
    return (
      Math.round(
        (this.somaTotaisItensComanda() +
          this.somaDescontosExibidosPorItensComanda()) *
          100,
      ) / 100
    );
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
    const bruto = this.subtotalBrutoAntesDescontoResumo();
    const desc = this.valorMonetarioCampoResumo(this.descontoResumoCtrl.value);
    const cash = this.cashbackComandaReais();
    return Math.max(
      0,
      Math.round((bruto - desc - cash) * 100) / 100,
    );
  }

  normalizarCampoMoedaResumo(c: FormControl<string>): void {
    const n = this.valorMonetarioCampoResumo(c.value);
    c.setValue(formataMoedaBrl(n), { emitEvent: false });
  }

  /**
   * Reformata a cada tecla: interpreta os dígitos como centavos em cadeia
   * e posiciona o cursor no fim (caixa / TEF).
   */
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
