import {
  Component,
  EventEmitter,
  inject,
  Input,
  LOCALE_ID,
  OnChanges,
  OnInit,
  Output,
  SimpleChanges,
} from '@angular/core';
import { Router, RouterLink } from '@angular/router';
import { DecimalPipe, registerLocaleData } from '@angular/common';
import localePt from '@angular/common/locales/pt';
import { SheetsApiService } from '../../core/services/sheets-api.service';
import { AtendimentoListaItem } from '../../core/models/api.models';
import {
  dataDdMmBarraAaaa,
  horaInicialMenorDasLinhasAtendimento,
  linhaResumoAtendimentoLista,
  ordenarLinhasAtendimentoInPlace,
  profissionalIdPreferidoParaServicoExtra,
  toYmd,
  valorMonetarioParaNumero,
} from '../../core/utils/atendimento-display';

registerLocaleData(localePt);

export type DiaCards = 'hoje' | 'amanha';

export type SecaoGrupoId = 'aberto' | 'pagamento-pendente' | 'pagamento-ok';

/** Um card por ID de atendimento no dia (várias linhas = mesmo atendimento). */
interface GrupoClienteDia {
  id: string;
  /** AAAA-MM-DD */
  data: string;
  nomeCliente: string;
  linhas: AtendimentoListaItem[];
  /** Soma dos valores das linhas (antes do desconto) */
  valorSubtotal: number | null;
  /** Desconto em R$ (coluna Desconto), aplicado na finalização */
  descontoValor: number | null;
  /** Subtotal − desconto (mín. 0) */
  valorTotal: number | null;
}

@Component({
  selector: 'app-atendimentos',
  standalone: true,
  imports: [RouterLink, DecimalPipe],
  providers: [{ provide: LOCALE_ID, useValue: 'pt-BR' }],
  templateUrl: './atendimentos.component.html',
  styleUrl: './atendimentos.component.scss',
})
export class AtendimentosComponent implements OnInit, OnChanges {
  private readonly api = inject(SheetsApiService);
  private readonly router = inject(Router);

  /** Quando true, mostra o dia em `dataAgenda` e esconde o toggle Hoje/Amanhã. */
  @Input() modoAgendaHub = false;
  /** `AAAA-MM-DD` quando embutido na agenda. */
  @Input() dataAgenda: string | null = null;
  /** Incrementar no pai para forçar novo carregamento. */
  @Input() reloadKey = 0;

  /** Emitido após exclusão (e após recarregar a lista) quando embutido na agenda — atualiza grelha no pai. */
  @Output() agendaDadosAlterados = new EventEmitter<void>();

  /** Data no topo do card: dd/mm/aaaa */
  readonly dataDdMmBarraAaaa = dataDdMmBarraAaaa;
  readonly valorNum = valorMonetarioParaNumero;

  dia: DiaCards = 'hoje';
  carregando = false;
  erro = '';
  /** Após confirmar pagamento com sucesso (movimentação no financeiro). */
  mensagemFinanceiroOk = '';
  grupos: GrupoClienteDia[] = [];
  /** `id` do grupo com detalhes abertos, ou null */
  grupoExpandidoId: string | null = null;

  /** Painéis dos três blocos (sempre visíveis no ecrã); clicar no título expande/recolhe. */
  secoesExpandidas: Record<SecaoGrupoId, boolean> = {
    aberto: true,
    'pagamento-pendente': true,
    'pagamento-ok': true,
  };

  /** Texto do input de desconto (formatado em R$), por grupo. */
  descontoFinalizarDraft: Record<string, string> = {};
  /** Apenas dígitos: valor em centavos = parseInt(dígitos) / 100 (digitação estilo caixa). */
  descontoDigitosCentavos: Record<string, string> = {};
  /** Desconto confirmado com «Incluir» (ainda não gravado até finalizar). */
  descontoIncluidoNum: Record<string, number> = {};

  private readonly fmtBrl = new Intl.NumberFormat('pt-BR', {
    style: 'currency',
    currency: 'BRL',
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });

  ngOnInit(): void {
    if (this.modoAgendaHub) {
      return;
    }
    this.carregar();
  }

  ngOnChanges(ch: SimpleChanges): void {
    if (!this.modoAgendaHub) return;
    if (!(ch['dataAgenda'] || ch['reloadKey'])) return;
    if (this.dataAgendaValida()) this.carregar();
  }

  setDia(d: DiaCards): void {
    if (this.dia === d) return;
    this.dia = d;
    this.grupoExpandidoId = null;
    this.secoesExpandidas = {
      aberto: true,
      'pagamento-pendente': true,
      'pagamento-ok': true,
    };
    this.carregar();
  }

  private dataAlvo(): Date {
    if (this.modoAgendaHub && this.dataAgendaValida()) {
      const [y, m, d] = this.dataAgenda!.trim().split('-').map((x) => parseInt(x, 10));
      return new Date(y, m - 1, d);
    }
    const d = new Date();
    if (this.dia === 'amanha') {
      d.setDate(d.getDate() + 1);
    }
    return d;
  }

  private dataAgendaValida(): boolean {
    const s = this.dataAgenda?.trim();
    return !!s && /^\d{4}-\d{2}-\d{2}$/.test(s);
  }

  tituloPeriodo(): string {
    if (this.modoAgendaHub && this.dataAgendaValida()) {
      return dataDdMmBarraAaaa(this.dataAgenda!.trim());
    }
    return this.dia === 'hoje' ? 'Hoje' : 'Amanhã';
  }

  /** ID Cliente na primeira linha (para pré-preencher novo atendimento). */
  idClienteParaNovoServico(g: GrupoClienteDia): string | null {
    const id = g.linhas[0]?.idCliente?.trim();
    return id || null;
  }

  /**
   * Mesmo padrão de `editar`: `Router.navigate` explícito.
   * Inclui `atendimento_ref` para `agenda-novo` pedir o horário à API quando
   * `hora` não puder ser inferida só das linhas do cartão.
   */
  irParaNovoServicoMesmoCliente(g: GrupoClienteDia, ev: Event): void {
    ev.preventDefault();
    const cid = this.idClienteParaNovoServico(g);
    if (!cid) return;
    const data = (g.data || '').slice(0, 10);
    const hora = horaInicialMenorDasLinhasAtendimento(g.linhas, data);
    const pid = profissionalIdPreferidoParaServicoExtra(g.linhas);
    const idAt = String(g.linhas[0]?.id || '').trim();
    const q: Record<string, string | number> = {
      cliente_id: cid,
      data,
    };
    if (hora) q['hora'] = hora;
    if (pid != null) q['profissional_id'] = pid;
    if (idAt) q['atendimento_ref'] = idAt;
    void this.router.navigate(['/agenda/novo'], { queryParams: q });
  }

  toggleGrupo(id: string): void {
    this.grupoExpandidoId = this.grupoExpandidoId === id ? null : id;
  }

  /** ID estável no DOM para focar/rolar até o card (evita `\u0001` em `g.id`). */
  domIdGrupoResumo(g: GrupoClienteDia): string {
    const idAt = g.linhas[0]?.id?.trim();
    if (idAt) return `atend-resumo-${encodeURIComponent(idAt)}`;
    return `atend-grupo-${encodeURIComponent(g.id)}`;
  }

  /**
   * Abre o card desse atendimento na receção (ex.: clique na grelha da agenda).
   * Garante que o bloco da secção correspondente fica visível.
   */
  expandirGrupoPorIdAtendimento(idAtendimento: string): void {
    const id = idAtendimento.trim();
    if (!id) return;
    const g = this.grupos.find((x) =>
      x.linhas.some((l) => String(l.id || '').trim() === id),
    );
    if (!g) return;
    this.grupoExpandidoId = g.id;
    if (!this.cobrancaFinalizada(g)) {
      this.secoesExpandidas = { ...this.secoesExpandidas, aberto: true };
    } else if (!this.pagamentoConfirmado(g)) {
      this.secoesExpandidas = {
        ...this.secoesExpandidas,
        'pagamento-pendente': true,
      };
    } else {
      this.secoesExpandidas = {
        ...this.secoesExpandidas,
        'pagamento-ok': true,
      };
    }
    const anchor = this.domIdGrupoResumo(g);
    queueMicrotask(() => {
      document.getElementById(anchor)?.scrollIntoView({
        behavior: 'smooth',
        block: 'nearest',
      });
    });
  }

  descontoDraft(grupoId: string): string {
    return this.descontoFinalizarDraft[grupoId] ?? '';
  }

  /**
   * Digitação estilo terminal: cada dígito entra à direita em centavos
   * (ex.: 1 → 0,01; 10 → 0,10; 100 → 1,00; 1000 → 10,00). Cola valores com vírgula/ponto.
   */
  onDescontoDraftInput(grupoId: string, ev: Event): void {
    const e = ev as InputEvent;
    const el = e.target as HTMLInputElement;
    const prev = this.descontoDigitosCentavos[grupoId] ?? '';

    let nextDigits: string;
    const it = e.inputType ?? '';

    if (it === 'insertText' && e.data) {
      const chunk = e.data.replace(/\D/g, '');
      nextDigits = chunk ? prev + chunk : prev;
    } else if (
      it === 'deleteContentBackward' ||
      it === 'deleteContentForward' ||
      it === 'deleteByCut'
    ) {
      nextDigits = prev.slice(0, -1);
    } else if (it === 'insertFromPaste') {
      const n = valorMonetarioParaNumero(el.value);
      nextDigits =
        n != null && n >= 0
          ? String(Math.round(n * 100))
          : el.value.replace(/\D/g, '');
    } else {
      const allDigits = el.value.replace(/\D/g, '');
      if (allDigits.length < prev.length) {
        nextDigits = prev.slice(0, -1);
      } else if (allDigits.length > prev.length) {
        nextDigits = allDigits;
      } else {
        nextDigits = prev;
      }
    }

    nextDigits = nextDigits.replace(/\D/g, '');
    if (nextDigits.length > 14) {
      nextDigits = nextDigits.slice(0, 14);
    }

    if (nextDigits === '') {
      const { [grupoId]: _c, ...restCent } = this.descontoDigitosCentavos;
      this.descontoDigitosCentavos = restCent;
      const { [grupoId]: _d, ...restDraft } = this.descontoFinalizarDraft;
      this.descontoFinalizarDraft = restDraft;
      return;
    }

    const cents = parseInt(nextDigits, 10);
    if (!Number.isFinite(cents) || cents < 0) {
      return;
    }

    const reais = cents / 100;
    const display = this.fmtBrl.format(reais);
    this.descontoDigitosCentavos = {
      ...this.descontoDigitosCentavos,
      [grupoId]: nextDigits,
    };
    this.descontoFinalizarDraft = {
      ...this.descontoFinalizarDraft,
      [grupoId]: display,
    };

    queueMicrotask(() => {
      const len = display.length;
      el.setSelectionRange(len, len);
    });
  }

  incluirDesconto(g: GrupoClienteDia, ev: Event): void {
    ev.stopPropagation();
    const raw = this.descontoFinalizarDraft[g.id]?.trim() ?? '';
    const n = valorMonetarioParaNumero(raw);
    if (n == null || n <= 0) {
      this.erro = 'Informe um desconto maior que zero.';
      return;
    }
    const sub = g.valorSubtotal;
    if (sub != null && n > sub + 1e-6) {
      this.erro = 'O desconto não pode ser maior que o subtotal.';
      return;
    }
    this.erro = '';
    this.descontoIncluidoNum = { ...this.descontoIncluidoNum, [g.id]: n };
    const centStr = String(Math.round(n * 100));
    this.descontoDigitosCentavos = {
      ...this.descontoDigitosCentavos,
      [g.id]: centStr,
    };
    this.descontoFinalizarDraft = {
      ...this.descontoFinalizarDraft,
      [g.id]: this.fmtBrl.format(n),
    };
  }

  removerDesconto(g: GrupoClienteDia, ev: Event): void {
    ev.stopPropagation();
    const { [g.id]: _a, ...restIncl } = this.descontoIncluidoNum;
    this.descontoIncluidoNum = restIncl;
    const { [g.id]: _b, ...restDraft } = this.descontoFinalizarDraft;
    this.descontoFinalizarDraft = restDraft;
    const { [g.id]: _cent, ...restCent } = this.descontoDigitosCentavos;
    this.descontoDigitosCentavos = restCent;
    this.erro = '';
  }

  temDescontoIncluido(g: GrupoClienteDia): boolean {
    const n = this.descontoIncluidoNum[g.id];
    return n != null && n > 0;
  }

  incluirDescontoDisabled(g: GrupoClienteDia): boolean {
    const n = valorMonetarioParaNumero(
      this.descontoFinalizarDraft[g.id]?.trim() ?? '',
    );
    return n == null || n <= 0;
  }

  /** Desconto a mostrar na lista (gravado ou confirmado com «Incluir»). */
  descontoExibicaoNum(g: GrupoClienteDia): number | null {
    if (this.cobrancaFinalizada(g)) {
      const d = g.descontoValor;
      return d != null && d > 0 ? d : null;
    }
    const local = this.descontoIncluidoNum[g.id];
    return local != null && local > 0 ? local : null;
  }

  /** Valor no topo do card (subtotal − desconto em pré-visualização ou já finalizado). */
  valorCardExibicao(g: GrupoClienteDia): number | null {
    const sub = g.valorSubtotal;
    if (sub == null) return null;
    const dsc = this.descontoExibicaoNum(g);
    if (dsc != null && dsc > 0) {
      return Math.max(0, Math.round((sub - dsc) * 100) / 100);
    }
    return g.valorTotal;
  }

  /** Total na lista quando há desconto. */
  totalLinhaExibicao(g: GrupoClienteDia): number | null {
    return this.valorCardExibicao(g);
  }

  mostrarLinhaTotalComDesconto(g: GrupoClienteDia): boolean {
    const d = this.descontoExibicaoNum(g);
    return (
      g.valorSubtotal !== null &&
      d != null &&
      d > 0 &&
      this.totalLinhaExibicao(g) !== null
    );
  }

  isExpandido(g: GrupoClienteDia): boolean {
    return this.grupoExpandidoId === g.id;
  }

  toggleSecao(id: SecaoGrupoId): void {
    this.secoesExpandidas = {
      ...this.secoesExpandidas,
      [id]: !this.secoesExpandidas[id],
    };
  }

  isSecaoExpandida(id: SecaoGrupoId): boolean {
    return this.secoesExpandidas[id];
  }

  secaoTriggerId(id: SecaoGrupoId): string {
    return `atend-sec-${id}`;
  }

  secaoPanelId(id: SecaoGrupoId): string {
    return `atend-panel-${id}`;
  }

  /** Sempre três blocos (listas podem estar vazias), para os cartões não “saltarem” de sítio. */
  secoes(): {
    id: SecaoGrupoId;
    titulo: string;
    lista: GrupoClienteDia[];
  }[] {
    return [
      { id: 'aberto', titulo: 'Em aberto', lista: this.gruposAbertos },
      {
        id: 'pagamento-pendente',
        titulo: 'Aguardando pagamento',
        lista: this.gruposPagamentoPendente,
      },
      {
        id: 'pagamento-ok',
        titulo: 'Pagamento confirmado',
        lista: this.gruposPagamentoOk,
      },
    ];
  }

  get gruposAbertos(): GrupoClienteDia[] {
    return this.grupos.filter((g) => !this.cobrancaFinalizada(g));
  }

  get gruposPagamentoPendente(): GrupoClienteDia[] {
    return this.grupos.filter(
      (g) => this.cobrancaFinalizada(g) && !this.pagamentoConfirmado(g),
    );
  }

  get gruposPagamentoOk(): GrupoClienteDia[] {
    return this.grupos.filter(
      (g) => this.cobrancaFinalizada(g) && this.pagamentoConfirmado(g),
    );
  }

  /** Método gravado em qualquer linha do mesmo atendimento (pode não estar só na primeira). */
  private metodoPagamentoNoGrupo(g: GrupoClienteDia): string {
    for (const l of g.linhas) {
      const m = (l.pagamentoMetodo ?? '').trim();
      if (m) return m;
    }
    return '';
  }

  /** Texto único do selo de status (mesmo estilo visual para todos). */
  statusPillLabel(g: GrupoClienteDia): string {
    if (!this.cobrancaFinalizada(g)) return 'Em aberto';
    if (this.pagamentoConfirmado(g)) {
      const met = this.metodoPagamentoNoGrupo(g);
      return met ? `Pagamento confirmado · ${met}` : 'Pagamento confirmado';
    }
    return 'Pagamento pendente';
  }

  resumoCard(g: GrupoClienteDia): string {
    const n = g.linhas.length;
    if (n > 1) {
      const allProduto = g.linhas.every(
        (l) => (l.tipo || '').trim().toLowerCase() === 'produto',
      );
      return allProduto ? `${n} produtos` : `${n} serviços`;
    }
    const l = g.linhas[0];
    const t = (l?.tipo || '').trim().toLowerCase();
    if (t === 'produto') return '1 produto';
    return '1 serviço';
  }

  linhaDetalheTexto(l: AtendimentoListaItem): string {
    return linhaResumoAtendimentoLista(l);
  }

  readonly metodosPagamento = ['Dinheiro', 'Pix', 'Cartão'] as const;

  /** Método escolhido antes de «Confirmar pagamento», por grupo. */
  metodoPagamentoPorGrupo: Record<string, string> = {};

  finalizandoIdAt: string | null = null;
  confirmandoPagamentoIdAt: string | null = null;
  excluindoIdAt: string | null = null;

  cobrancaFinalizada(g: GrupoClienteDia): boolean {
    return g.linhas[0]?.cobrancaStatus === 'finalizada';
  }

  pagamentoConfirmado(g: GrupoClienteDia): boolean {
    return (g.linhas[0]?.pagamentoStatus ?? '') === 'confirmado';
  }

  finalizar(g: GrupoClienteDia, ev: Event): void {
    ev.stopPropagation();
    const idAt = g.linhas[0]?.id?.trim();
    if (!idAt || this.cobrancaFinalizada(g)) return;
    this.finalizandoIdAt = idAt;
    this.erro = '';
    const incl = this.descontoIncluidoNum[g.id];
    const descontoTxt =
      incl != null && incl > 0
        ? incl.toFixed(2).replace('.', ',')
        : undefined;
    this.api.finalizarCobranca(idAt, descontoTxt).subscribe({
      next: () => {
        this.finalizandoIdAt = null;
        const { [g.id]: _d, ...restDraft } = this.descontoFinalizarDraft;
        this.descontoFinalizarDraft = restDraft;
        const { [g.id]: _i, ...restIncl } = this.descontoIncluidoNum;
        this.descontoIncluidoNum = restIncl;
        this.carregar();
      },
      error: (e: Error) => {
        this.finalizandoIdAt = null;
        this.erro =
          e.message ||
          'Não foi possível finalizar. Tente novamente.';
      },
    });
  }

  metodoPagamentoSelecionado(g: GrupoClienteDia): string {
    return (this.metodoPagamentoPorGrupo[g.id] ?? '').trim();
  }

  onMetodoPagamentoChange(g: GrupoClienteDia, ev: Event): void {
    ev.stopPropagation();
    const v = (ev.target as HTMLSelectElement).value.trim();
    this.metodoPagamentoPorGrupo = {
      ...this.metodoPagamentoPorGrupo,
      [g.id]: v,
    };
  }

  confirmarPagamentoDisabled(g: GrupoClienteDia): boolean {
    return (
      !this.metodoPagamentoSelecionado(g) ||
      this.confirmandoPagamentoIdAt === g.linhas[0]?.id
    );
  }

  confirmarPagamento(g: GrupoClienteDia, ev: Event): void {
    ev.stopPropagation();
    const idAt = g.linhas[0]?.id?.trim();
    if (!idAt || !this.cobrancaFinalizada(g) || this.pagamentoConfirmado(g)) {
      return;
    }
    const metodo = this.metodoPagamentoSelecionado(g);
    if (!metodo) {
      this.erro = 'Selecione o método de pagamento (Dinheiro, Pix ou Cartão).';
      return;
    }
    this.confirmandoPagamentoIdAt = idAt;
    this.erro = '';
    this.mensagemFinanceiroOk = '';
    this.api.confirmarPagamento(idAt, metodo).subscribe({
      next: (res) => {
        this.confirmandoPagamentoIdAt = null;
        for (const l of g.linhas) {
          l.pagamentoStatus = 'confirmado';
          l.pagamentoMetodo = metodo;
        }
        const { [g.id]: _, ...rest } = this.metodoPagamentoPorGrupo;
        this.metodoPagamentoPorGrupo = rest;
        const mid = res?.movimentacao_id;
        this.mensagemFinanceiroOk =
          mid != null && mid > 0
            ? `Pagamento confirmado. Lançamento n.º ${mid} registado no financeiro.`
            : 'Pagamento confirmado.';
        window.setTimeout(() => {
          this.mensagemFinanceiroOk = '';
        }, 12000);
      },
      error: (e: Error) => {
        this.confirmandoPagamentoIdAt = null;
        this.erro =
          e.message ||
          'Não foi possível confirmar o pagamento. Tente novamente.';
      },
    });
  }

  editar(g: GrupoClienteDia, ev: Event): void {
    ev.stopPropagation();
    const idAt = g.linhas[0]?.id?.trim();
    if (!idAt) return;
    void this.router.navigate(['/agenda/novo'], {
      queryParams: { atendimento: idAt },
    });
  }

  excluir(g: GrupoClienteDia, ev: Event): void {
    ev.stopPropagation();
    const idAt = g.linhas[0]?.id?.trim();
    if (!idAt) return;
    const nome = g.nomeCliente?.trim() || 'este cliente';
    const dataTxt = dataDdMmBarraAaaa(g.data);
    const msg =
      `Deseja confirmar a exclusão do atendimento?\n\n` +
      `Cliente: ${nome}\n` +
      `Data: ${dataTxt}\n\n` +
      `Todas as linhas deste atendimento serão apagadas. Esta ação não pode ser desfeita.`;
    if (!window.confirm(msg)) {
      return;
    }
    this.excluindoIdAt = idAt;
    this.erro = '';
    this.api.excluirAtendimento(idAt).subscribe({
      next: () => {
        this.excluindoIdAt = null;
        if (this.grupoExpandidoId === g.id) {
          this.grupoExpandidoId = null;
        }
        this.carregar(() => {
          if (this.modoAgendaHub) this.agendaDadosAlterados.emit();
        });
      },
      error: (e: Error) => {
        this.excluindoIdAt = null;
        this.erro =
          e.message ||
          'Não foi possível excluir. Tente novamente.';
      },
    });
  }

  carregar(onComplete?: () => void): void {
    this.carregando = true;
    this.erro = '';
    const d = this.dataAlvo();
    const ymd = toYmd(d);
    this.api.listAgendamentos(ymd, ymd).subscribe({
      next: (items) => {
        this.descontoIncluidoNum = {};
        this.descontoFinalizarDraft = {};
        this.descontoDigitosCentavos = {};
        this.metodoPagamentoPorGrupo = {};
        this.grupos = this.agruparPorIdAtendimento(items);
        this.carregando = false;
        onComplete?.();
      },
      error: (e: Error) => {
        this.erro =
          e.message ||
          'Não foi possível carregar os atendimentos. Tente novamente.';
        this.carregando = false;
      },
    });
  }

  private agruparPorIdAtendimento(
    items: AtendimentoListaItem[],
  ): GrupoClienteDia[] {
    const map = new Map<string, AtendimentoListaItem[]>();
    let legacyIdx = 0;
    for (const a of items) {
      const ymd = (a.data || '').slice(0, 10);
      const idAt = String(a.id || '').trim();
      const nome = (a.nomeCliente || '').trim().toLowerCase();
      const key = idAt
        ? `${ymd}\u0001${idAt}`
        : `${ymd}\u0001legacy:${nome}:${legacyIdx++}`;
      if (!map.has(key)) map.set(key, []);
      map.get(key)!.push(a);
    }

    const grupos: GrupoClienteDia[] = [];
    for (const [key, linhas] of map) {
      ordenarLinhasAtendimentoInPlace(linhas);
      const metodoGrupo =
        linhas.map((l) => (l.pagamentoMetodo ?? '').trim()).find(Boolean) ?? '';
      if (metodoGrupo) {
        for (const l of linhas) {
          if (!(l.pagamentoMetodo ?? '').trim()) {
            l.pagamentoMetodo = metodoGrupo;
          }
        }
      }
      const nomeCliente = linhas[0].nomeCliente?.trim() || '—';
      const data = (linhas[0].data || '').slice(0, 10);
      let sum = 0;
      let temValor = false;
      for (const l of linhas) {
        const v = valorMonetarioParaNumero(l.valor);
        if (v !== null) {
          sum += v;
          temValor = true;
        }
      }
      const subtotal = temValor ? sum : null;
      const descontoN = valorMonetarioParaNumero(linhas[0]?.desconto);
      const descontoValor =
        descontoN !== null && descontoN > 0 ? descontoN : null;
      let valorTotal = subtotal;
      if (subtotal !== null && descontoValor !== null) {
        valorTotal = Math.max(
          0,
          Math.round((subtotal - descontoValor) * 100) / 100,
        );
      }
      grupos.push({
        id: key,
        data,
        nomeCliente,
        linhas,
        valorSubtotal: subtotal,
        descontoValor,
        valorTotal,
      });
    }

    return grupos.sort((a, b) => {
      const c = a.data.localeCompare(b.data);
      return c !== 0 ? c : a.nomeCliente.localeCompare(b.nomeCliente, 'pt-BR');
    });
  }

}
