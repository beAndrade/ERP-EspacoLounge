import { CurrencyPipe } from '@angular/common';
import { Component, HostListener, OnDestroy, OnInit, inject } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { Subscription, forkJoin } from 'rxjs';
import { SheetsApiService } from '../../../../core/services/sheets-api.service';
import type { Servico } from '../../../../core/models/api.models';
import { valorMonetarioParaNumero } from '../../../../core/utils/atendimento-display';
import { formataMoedaBrl } from '../../../../core/utils/brl-digit-input';
import { lerServicoTexto } from '../../../../core/utils/servico-campos';
import { ServicoCadastroDrawerService } from '../../../../shared/servico-cadastro-drawer/servico-cadastro-drawer.service';
import { UiTipTriggerComponent } from '../../../../shared/ui-tip-trigger/ui-tip-trigger.component';
import { TableEmptyComponent } from '../../../../shared/table-empty/table-empty.component';
import { tooltipOrdenacaoProximoClique } from '../../../../shared/table-sort-tip.util';

@Component({
  selector: 'app-servicos',
  standalone: true,
  imports: [TableEmptyComponent, FormsModule, CurrencyPipe, UiTipTriggerComponent],
  templateUrl: './servicos.component.html',
  styleUrl: './servicos.component.scss',
})
export class ServicosComponent implements OnInit, OnDestroy {
  private readonly api = inject(SheetsApiService);
  private readonly drawer = inject(ServicoCadastroDrawerService);
  private salvoSub: Subscription | null = null;

  carregando = false;
  erro = '';
  itens: Servico[] = [];
  /** Categorias ativas do catálogo (para datalist do drawer). */
  private categoriasAtivas: string[] = [];

  busca = '';
  buscaAberta = false;
  buscaPlaceholder = 'Buscar serviços';
  pulsoToolbarBusca = false;
  pulsoToolbarFiltro = false;
  private readonly duracaoPulsoToolbarMs = 420;
  private tPulsoFiltro = 0;

  filtrosAbertos = false;
  /** Status: Ativos = mostra no site; Inativos = ocultos do site. */
  filtroMostraSim = true;
  filtroMostraNao = true;
  filtroTipoFixo = true;
  filtroTipoTamanho = true;
  /** `null` = todas as categorias; Set = só as marcadas. */
  private filtroCategorias: Set<string> | null = null;

  pagina = 1;
  porPagina = 20;
  readonly opcoesPorPagina = [10, 20, 50];
  perPageMenuAberto = false;

  selecionados = new Set<string>();

  /** Coluna activa e direcção (padrão Nome asc). */
  ordenacaoColuna:
    | 'nome'
    | 'valor'
    | 'comissao'
    | 'duracao'
    | 'categoria'
    | 'mostra' = 'nome';
  ordenacaoDir: 'asc' | 'desc' = 'asc';

  excluirModalAberto = false;
  excluindo = false;
  excluirAlvo: Servico | null = null;
  excluirErro = '';

  ngOnInit(): void {
    this.carregar();
    this.salvoSub = this.drawer.salvo$.subscribe((item) =>
      this.aplicarServicoSalvo(item),
    );
  }

  ngOnDestroy(): void {
    this.salvoSub?.unsubscribe();
    this.salvoSub = null;
  }

  /**
   * Recarrega o catálogo. Com `focarId`, limpa busca/filtros e abre a página
   * onde o serviço cai (evita “sumir” na pág. 1 após Novo).
   */
  carregar(opts?: { focarId?: string }): void {
    this.carregando = true;
    this.erro = '';
    forkJoin({
      servicos: this.api.listServicos(),
      categorias: this.api.listCategoriasCatalogo(false),
    }).subscribe({
      next: ({ servicos, categorias }) => {
        this.itens = servicos;
        this.categoriasAtivas = (categorias ?? [])
          .map((c) => String(c.nome ?? '').trim())
          .filter(Boolean)
          .sort((a, b) => a.localeCompare(b, 'pt-BR'));
        this.carregando = false;
        this.selecionados.clear();
        if (opts?.focarId) {
          this.irParaServicoNaLista(opts.focarId);
        } else {
          this.pagina = 1;
        }
      },
      error: (e: Error) => {
        this.erro =
          e.message || 'Não foi possível carregar serviços. Tente novamente.';
        this.carregando = false;
      },
    });
  }

  /** Insere/atualiza o item confirmado pela API e depois recarrega a lista. */
  private aplicarServicoSalvo(item: Servico): void {
    const id = String(item?.id ?? '').trim();
    const nome = String(item?.['Serviço'] ?? '').trim();
    if (!id || !nome) {
      this.erro =
        'O servidor não confirmou o serviço gravado. Recarregue e tente de novo.';
      this.carregar();
      return;
    }
    const rest = this.itens.filter((s) => String(s.id) !== id);
    this.itens = [...rest, item];
    this.irParaServicoNaLista(id);
    this.carregar({ focarId: id });
  }

  /** Limpa filtros ativos e posiciona a paginação no serviço indicado. */
  private irParaServicoNaLista(id: string): void {
    this.busca = '';
    this.buscaAberta = false;
    this.limparFiltros();
    this.filtrosAbertos = false;

    const idx = this.filtrados().findIndex((s) => String(s.id) === id);
    if (idx < 0) {
      this.pagina = 1;
      return;
    }
    this.pagina = Math.floor(idx / this.porPagina) + 1;
  }

  categoriasDisponiveis(): string[] {
    if (this.categoriasAtivas.length > 0) return this.categoriasAtivas.slice();
    const set = new Set<string>();
    for (const s of this.itens) {
      const c = String(s['Categoria'] ?? '').trim();
      if (c) set.add(c);
    }
    return Array.from(set).sort((a, b) => a.localeCompare(b, 'pt-BR'));
  }

  filtrados(): Servico[] {
    const q = this.busca.trim().toLowerCase();
    const list = this.itens.filter((s) => {
      const nome = this.rotuloServico(s).toLowerCase();
      const cat = String(s['Categoria'] ?? '')
        .trim()
        .toLowerCase();
      if (q && !nome.includes(q) && !cat.includes(q)) return false;

      const noSite = s['mostra_no_site'] !== false;
      if (noSite && !this.filtroMostraSim) return false;
      if (!noSite && !this.filtroMostraNao) return false;

      const t = String(s['Tipo'] ?? '')
        .trim()
        .toLowerCase();
      const isFixo = t !== 'tamanho';
      if (isFixo && !this.filtroTipoFixo) return false;
      if (!isFixo && !this.filtroTipoTamanho) return false;

      if (this.filtroCategorias) {
        const catNome = String(s['Categoria'] ?? '').trim();
        if (!this.filtroCategorias.has(catNome)) return false;
      }

      return true;
    });

    const dir = this.ordenacaoDir === 'asc' ? 1 : -1;
    return list.slice().sort((a, b) => this.compararOrdenacao(a, b) * dir);
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

  private compararOrdenacao(a: Servico, b: Servico): number {
    switch (this.ordenacaoColuna) {
      case 'nome':
        return this.rotuloServico(a).localeCompare(
          this.rotuloServico(b),
          'pt-BR',
          { sensitivity: 'base' },
        );
      case 'valor': {
        const va = this.valorExibicao(a) ?? -1;
        const vb = this.valorExibicao(b) ?? -1;
        return va - vb;
      }
      case 'comissao':
        return this.comissaoSortKey(a) - this.comissaoSortKey(b);
      case 'duracao': {
        return this.duracaoSortKey(a) - this.duracaoSortKey(b);
      }
      case 'categoria':
        return this.categoriaServico(a).localeCompare(
          this.categoriaServico(b),
          'pt-BR',
          { sensitivity: 'base' },
        );
      case 'mostra': {
        const ma = a['mostra_no_site'] === false ? 0 : 1;
        const mb = b['mostra_no_site'] === false ? 0 : 1;
        return ma - mb;
      }
      default:
        return 0;
    }
  }

  private comissaoSortKey(s: Servico): number {
    const tipo = lerServicoTexto(s, 'Tipo', 'tipo').toLowerCase();
    if (tipo === 'tamanho') {
      const pcts = this.comissaoPctsPorFaixa(s);
      if (pcts.length > 0) return Math.min(...pcts);
      return -1;
    }
    const pct = lerServicoTexto(s, 'Comissão %', 'comissao_pct')
      .replace('%', '')
      .replace(',', '.');
    if (pct) {
      const n = Number.parseFloat(pct);
      if (Number.isFinite(n)) return n;
    }
    return (
      valorMonetarioParaNumero(
        lerServicoTexto(s, 'Comissão Fixa', 'comissao_fixa'),
      ) ?? -1
    );
  }

  totalFiltrado(): number {
    return this.filtrados().length;
  }

  paginaItens(): Servico[] {
    const all = this.filtrados();
    const start = (this.pagina - 1) * this.porPagina;
    return all.slice(start, start + this.porPagina);
  }

  totalPaginas(): number {
    return Math.max(1, Math.ceil(this.totalFiltrado() / this.porPagina));
  }

  irPagina(delta: number): void {
    this.pagina = Math.min(
      this.totalPaginas(),
      Math.max(1, this.pagina + delta),
    );
  }

  togglePerPageMenu(ev?: Event): void {
    ev?.stopPropagation();
    this.perPageMenuAberto = !this.perPageMenuAberto;
  }

  selecionarPorPagina(n: number, ev?: Event): void {
    ev?.stopPropagation();
    this.porPagina = n;
    this.pagina = 1;
    this.perPageMenuAberto = false;
  }

  onBuscaWrapClick(): void {
    if (!this.buscaAberta) {
      this.buscaAberta = true;
      this.dispararPulsoToolbar('busca');
      queueMicrotask(() => {
        document.getElementById('servicos-busca-input')?.focus();
      });
    }
  }

  onBuscaInput(): void {
    this.pagina = 1;
  }

  toggleFiltros(ev?: Event): void {
    ev?.stopPropagation();
    this.dispararPulsoToolbar('filtro');
    this.filtrosAbertos = !this.filtrosAbertos;
  }

  private dispararPulsoToolbar(which: 'busca' | 'filtro'): void {
    if (which === 'busca') {
      this.pulsoToolbarBusca = false;
      queueMicrotask(() => {
        this.pulsoToolbarBusca = true;
        window.setTimeout(() => {
          this.pulsoToolbarBusca = false;
        }, this.duracaoPulsoToolbarMs);
      });
      return;
    }
    window.clearTimeout(this.tPulsoFiltro);
    this.pulsoToolbarFiltro = false;
    queueMicrotask(() => {
      this.pulsoToolbarFiltro = true;
      this.tPulsoFiltro = window.setTimeout(() => {
        this.pulsoToolbarFiltro = false;
      }, this.duracaoPulsoToolbarMs);
    });
  }

  toggleFiltroMostra(which: 'sim' | 'nao', ev: Event): void {
    const checked = (ev.target as HTMLInputElement).checked;
    if (which === 'sim') this.filtroMostraSim = checked;
    else this.filtroMostraNao = checked;
    if (!this.filtroMostraSim && !this.filtroMostraNao) {
      if (which === 'sim') this.filtroMostraNao = true;
      else this.filtroMostraSim = true;
    }
    this.pagina = 1;
  }

  toggleFiltroTipo(which: 'fixo' | 'tamanho', ev: Event): void {
    const checked = (ev.target as HTMLInputElement).checked;
    if (which === 'fixo') this.filtroTipoFixo = checked;
    else this.filtroTipoTamanho = checked;
    if (!this.filtroTipoFixo && !this.filtroTipoTamanho) {
      if (which === 'fixo') this.filtroTipoTamanho = true;
      else this.filtroTipoFixo = true;
    }
    this.pagina = 1;
  }

  todasCategoriasSelecionadas(): boolean {
    return this.filtroCategorias === null;
  }

  categoriaFiltroMarcada(cat: string): boolean {
    return this.filtroCategorias === null || this.filtroCategorias.has(cat);
  }

  toggleTodasCategorias(ev: Event): void {
    const checked = (ev.target as HTMLInputElement).checked;
    this.filtroCategorias = checked ? null : new Set();
    this.pagina = 1;
  }

  toggleFiltroCategoria(cat: string, ev: Event): void {
    const checked = (ev.target as HTMLInputElement).checked;
    const todas = this.categoriasDisponiveis();
    if (this.filtroCategorias === null) {
      this.filtroCategorias = new Set(todas);
    }
    if (checked) this.filtroCategorias.add(cat);
    else this.filtroCategorias.delete(cat);
    if (
      this.filtroCategorias.size === 0 ||
      (todas.length > 0 && todas.every((c) => this.filtroCategorias!.has(c)))
    ) {
      this.filtroCategorias = this.filtroCategorias.size === 0 ? new Set() : null;
    }
    this.pagina = 1;
  }

  get filtroAlgumAtivo(): boolean {
    return (
      !this.filtroMostraSim ||
      !this.filtroMostraNao ||
      !this.filtroTipoFixo ||
      !this.filtroTipoTamanho ||
      this.filtroCategorias !== null
    );
  }

  @HostListener('document:click', ['$event'])
  onDocClick(ev: MouseEvent): void {
    const t = ev.target as HTMLElement | null;
    if (this.buscaAberta && !t?.closest?.('.list-head__busca-wrap')) {
      if (!this.busca.trim()) this.buscaAberta = false;
    }
    if (this.perPageMenuAberto && !t?.closest?.('.list-footer__per-page')) {
      this.perPageMenuAberto = false;
    }
  }

  @HostListener('document:keydown.escape', ['$event'])
  onEscape(ev: KeyboardEvent): void {
    if (this.excluirModalAberto) {
      ev.preventDefault();
      this.fecharExcluir();
      return;
    }
    if (this.perPageMenuAberto) this.perPageMenuAberto = false;
    else if (this.filtrosAbertos) this.filtrosAbertos = false;
    else if (this.buscaAberta) this.buscaAberta = false;
  }

  abrirNovo(): void {
    this.drawer.abrirNovo({
      categorias: this.categoriasDisponiveis(),
    });
  }

  abrirEditar(s: Servico): void {
    this.drawer.abrirEdicao(s, {
      categorias: this.categoriasDisponiveis(),
    });
  }

  pedirExcluir(s: Servico): void {
    this.excluirAlvo = s;
    this.excluirErro = '';
    this.excluirModalAberto = true;
  }

  fecharExcluir(): void {
    if (this.excluindo) return;
    this.excluirModalAberto = false;
    this.excluirAlvo = null;
    this.excluirErro = '';
  }

  confirmarExcluir(): void {
    const s = this.excluirAlvo;
    if (!s || this.excluindo) return;
    this.excluindo = true;
    this.excluirErro = '';
    this.api.deleteServico(String(s.id)).subscribe({
      next: () => {
        this.excluindo = false;
        this.fecharExcluir();
        this.carregar();
      },
      error: (e: Error) => {
        this.excluindo = false;
        this.excluirErro =
          e.message || 'Não foi possível excluir o serviço.';
      },
    });
  }

  rotuloServico(s: Servico): string {
    return String(s['Serviço'] ?? '').trim();
  }

  categoriaServico(s: Servico): string {
    return String(s['Categoria'] ?? '').trim();
  }

  mostraNoSite(s: Servico): string {
    return s['mostra_no_site'] === false ? 'Não' : 'Sim';
  }

  valorExibicao(s: Servico): number | null {
    const tipo = String(s['Tipo'] ?? '')
      .trim()
      .toLowerCase();
    if (tipo === 'tamanho') {
      const precos = [
        s['Preço Curto'],
        s['Preço Médio'],
        s['Preço Médio/Longo'],
        s['Preço Longo'],
      ]
        .map((v) => valorMonetarioParaNumero(v))
        .filter((n): n is number => n != null && n > 0);
      if (precos.length === 0) return null;
      return Math.min(...precos);
    }
    return valorMonetarioParaNumero(s['Valor Base']);
  }

  valorPrefixo(s: Servico): string {
    const tipo = String(s['Tipo'] ?? '')
      .trim()
      .toLowerCase();
    return tipo === 'tamanho' ? 'a partir de ' : '';
  }

  comissaoExibicao(s: Servico): string {
    const tipo = lerServicoTexto(s, 'Tipo', 'tipo').toLowerCase();
    if (tipo === 'tamanho') {
      const pcts = this.comissaoPctsPorFaixa(s);
      if (pcts.length === 0) return '';
      const min = Math.min(...pcts);
      const max = Math.max(...pcts);
      return min === max ? `% ${min}` : `% ${min}–${max}`;
    }

    const pct = lerServicoTexto(s, 'Comissão %', 'comissao_pct');
    if (pct) {
      const n = pct.replace('%', '').trim();
      return n ? `% ${n}` : '';
    }
    const fixa = valorMonetarioParaNumero(
      lerServicoTexto(s, 'Comissão Fixa', 'comissao_fixa'),
    );
    if (fixa != null && fixa > 0) {
      return formataMoedaBrl(fixa);
    }
    return '';
  }

  /** % por faixa a partir de R$/preço (ou `comissao_pct` legado). */
  private comissaoPctsPorFaixa(s: Servico): number[] {
    const faixas: Array<[string[], string[]]> = [
      [['Preço Curto', 'preco_curto'], ['Curto', 'curto']],
      [['Preço Médio', 'preco_medio'], ['Médio', 'medio']],
      [['Preço Médio/Longo', 'preco_medio_longo'], ['M/L', 'm_l']],
      [['Preço Longo', 'preco_longo'], ['Longo', 'longo']],
    ];
    const out: number[] = [];
    for (const [precoKeys, comKeys] of faixas) {
      const preco = valorMonetarioParaNumero(lerServicoTexto(s, ...precoKeys));
      const comissao = valorMonetarioParaNumero(lerServicoTexto(s, ...comKeys));
      if (preco != null && preco > 0 && comissao != null && comissao > 0) {
        out.push(Math.round((comissao / preco) * 100));
      }
    }
    if (out.length > 0) return out;
    const pct = lerServicoTexto(s, 'Comissão %', 'comissao_pct')
      .replace('%', '')
      .replace(',', '.')
      .trim();
    if (pct) {
      const n = Number.parseFloat(pct);
      if (Number.isFinite(n) && n > 0) return [n];
    }
    return [];
  }

  duracaoExibicao(s: Servico): string {
    const tipo = String(s['Tipo'] ?? '')
      .trim()
      .toLowerCase();
    if (tipo === 'tamanho') {
      const faixas = this.duracoesFaixaMinutos(s);
      if (faixas.length > 0) {
        const min = Math.min(...faixas);
        const max = Math.max(...faixas);
        if (min === max) return `${min} min`;
        return `${min}–${max} min`;
      }
    }
    const m = Number(s['duracao_minutos'] ?? 30);
    if (!Number.isFinite(m) || m <= 0) return '';
    return `${m} min`;
  }

  private duracoesFaixaMinutos(s: Servico): number[] {
    const keys = [
      'duracao_curto',
      'duracao_medio',
      'duracao_m_l',
      'duracao_longo',
    ] as const;
    const out: number[] = [];
    for (const k of keys) {
      const raw = s[k];
      if (raw == null || raw === '') continue;
      const n = Number(raw);
      if (Number.isFinite(n) && n > 0) out.push(n);
    }
    return out;
  }

  private duracaoSortKey(s: Servico): number {
    const tipo = String(s['Tipo'] ?? '')
      .trim()
      .toLowerCase();
    if (tipo === 'tamanho') {
      const faixas = this.duracoesFaixaMinutos(s);
      if (faixas.length > 0) return Math.min(...faixas);
    }
    const m = Number(s['duracao_minutos'] ?? 0);
    return Number.isFinite(m) ? m : 0;
  }

  estaSelecionado(id: string): boolean {
    return this.selecionados.has(id);
  }

  toggleSelecionado(s: Servico, ev: Event): void {
    const checked = (ev.target as HTMLInputElement).checked;
    const id = String(s.id);
    if (checked) this.selecionados.add(id);
    else this.selecionados.delete(id);
  }

  todosDaPaginaSelecionados(): boolean {
    const page = this.paginaItens();
    return page.length > 0 && page.every((s) => this.selecionados.has(String(s.id)));
  }

  toggleSelecionarTodos(ev: Event): void {
    const checked = (ev.target as HTMLInputElement).checked;
    for (const s of this.paginaItens()) {
      const id = String(s.id);
      if (checked) this.selecionados.add(id);
      else this.selecionados.delete(id);
    }
  }

  limparFiltros(): void {
    this.filtroMostraSim = true;
    this.filtroMostraNao = true;
    this.filtroTipoFixo = true;
    this.filtroTipoTamanho = true;
    this.filtroCategorias = null;
    this.pagina = 1;
  }
}
