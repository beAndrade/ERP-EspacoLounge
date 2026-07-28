import { CurrencyPipe, DecimalPipe } from '@angular/common';
import {
  AfterViewInit,
  Component,
  ElementRef,
  HostListener,
  inject,
  LOCALE_ID,
  OnInit,
  ViewChild,
} from '@angular/core';
import { FormsModule } from '@angular/forms';
import { ProdutoCatalogoItem, EstoqueMovimentoItem } from '../../../../core/models/api.models';
import { SheetsApiService } from '../../../../core/services/sheets-api.service';
import { extractApiErrorMessage } from '../../../../core/utils/api-error-message';
import { AppToastService } from '../../../../shared/app-toast/app-toast.service';
import { DRAWER_ANIM_MS } from '../../../../shared/cliente-cadastro-drawer/cliente-cadastro-drawer.service';
import { ProdutoCadastroDrawerService } from '../../../../shared/produto-cadastro-drawer/produto-cadastro-drawer.service';
import { UiTipTriggerComponent } from '../../../../shared/ui-tip-trigger/ui-tip-trigger.component';
import { tooltipOrdenacaoProximoClique } from '../../../../shared/table-sort-tip.util';
import {
  sufixoUnidadeProduto,
  unidadeProdutoUsaEquivalente,
} from '../../../../core/utils/produto-unidade';

export type ProdutosAba = 'produtos' | 'lotes';
export type ProdutosOrdenacaoColuna =
  | 'nome'
  | 'estoque'
  | 'preco'
  | 'comissao';

@Component({
  selector: 'app-estoque',
  standalone: true,
  imports: [FormsModule, CurrencyPipe, DecimalPipe, UiTipTriggerComponent],
  providers: [{ provide: LOCALE_ID, useValue: 'pt-BR' }],
  templateUrl: './estoque.component.html',
  styleUrl: './estoque.component.scss',
})
export class EstoqueComponent implements OnInit, AfterViewInit {
  private readonly api = inject(SheetsApiService);
  private readonly produtoDrawer = inject(ProdutoCadastroDrawerService);
  private readonly toast = inject(AppToastService);

  @ViewChild('tabsNav', { read: ElementRef })
  private tabsNav?: ElementRef<HTMLElement>;

  carregando = false;
  erro = '';
  itens: ProdutoCatalogoItem[] = [];

  entradaProduto: ProdutoCatalogoItem | null = null;
  entradaQtd = '1';
  entradaSalvando = false;
  entradaErro = '';
  movimentosDrawerAberto = false;
  movimentosPanelOpen = false;
  movimentos: EstoqueMovimentoItem[] = [];
  movimentosCarregando = false;
  movimentosErro = '';
  formEntradaAberto = false;
  /** Ordenação da coluna Data no drawer de movimentações. */
  movimentosOrdenacaoDir: 'asc' | 'desc' = 'desc';
  private movimentosCloseTimer: ReturnType<typeof setTimeout> | null = null;

  excluirModalAberto = false;
  excluirAlvo: ProdutoCatalogoItem | null = null;
  excluirErro = '';
  excluindo = false;

  aba: ProdutosAba = 'produtos';
  tabsIndicatorLeft = 0;
  tabsIndicatorWidth = 0;

  busca = '';
  buscaAberta = false;
  filtrosAbertos = false;
  pulsoToolbarBusca = false;
  pulsoToolbarFiltro = false;
  /** `null` = todas selecionadas. */
  private filtroMarcas: Set<string> | null = null;
  private filtroCategorias: Set<string> | null = null;
  private readonly duracaoPulsoToolbarMs = 600;
  private tPulsoBusca = 0;
  private tPulsoFiltro = 0;

  ordenacaoColuna: ProdutosOrdenacaoColuna = 'nome';
  ordenacaoDir: 'asc' | 'desc' = 'asc';

  pagina = 1;
  itensPorPagina = 20;
  readonly opcoesItensPorPagina = [10, 20, 40, 50, 100];
  perPageMenuAberto = false;
  selecionados = new Set<number>();

  ngOnInit(): void {
    this.carregar();
  }

  ngAfterViewInit(): void {
    this.sincronizarIndicadorTabs();
  }

  carregar(): void {
    this.carregando = true;
    this.erro = '';
    this.api.listProdutos().subscribe({
      next: (items) => {
        this.itens = items;
        this.carregando = false;
        this.pagina = 1;
        this.selecionados.clear();
      },
      error: (e: Error) => {
        this.erro =
          e.message ||
          'Não foi possível carregar o catálogo de produtos. Tente novamente.';
        this.carregando = false;
      },
    });
  }

  get buscaPlaceholder(): string {
    return this.buscaAberta
      ? 'Buscar por nome, marca ou categoria…'
      : '';
  }

  definirAba(aba: ProdutosAba): void {
    if (this.aba === aba) return;
    this.aba = aba;
    this.pagina = 1;
    this.selecionados.clear();
    this.sincronizarIndicadorTabs();
  }

  private sincronizarIndicadorTabs(): void {
    const medir = () => {
      const nav = this.tabsNav?.nativeElement;
      if (!nav) return;
      const alvo = nav.querySelector(
        `.list-page__tab[data-aba="${this.aba}"]`,
      ) as HTMLElement | null;
      if (!alvo) return;
      this.tabsIndicatorLeft = alvo.offsetLeft;
      this.tabsIndicatorWidth = alvo.offsetWidth;
    };
    requestAnimationFrame(medir);
  }

  private dispararPulsoToolbar(which: 'busca' | 'filtro'): void {
    if (which === 'busca') {
      window.clearTimeout(this.tPulsoBusca);
      this.pulsoToolbarBusca = false;
      queueMicrotask(() => {
        this.pulsoToolbarBusca = true;
        this.tPulsoBusca = window.setTimeout(() => {
          this.pulsoToolbarBusca = false;
        }, this.duracaoPulsoToolbarMs);
      });
    } else {
      window.clearTimeout(this.tPulsoFiltro);
      this.pulsoToolbarFiltro = false;
      queueMicrotask(() => {
        this.pulsoToolbarFiltro = true;
        this.tPulsoFiltro = window.setTimeout(() => {
          this.pulsoToolbarFiltro = false;
        }, this.duracaoPulsoToolbarMs);
      });
    }
  }

  fecharPainelBusca(): void {
    this.buscaAberta = false;
  }

  onBuscaWrapClick(): void {
    if (!this.buscaAberta) {
      this.dispararPulsoToolbar('busca');
      this.buscaAberta = true;
      queueMicrotask(() => {
        document.getElementById('produtos-busca-input')?.focus();
      });
    }
  }

  onBuscaInput(): void {
    this.pagina = 1;
  }

  onBuscaEnter(ev: Event): void {
    ev.preventDefault();
    this.pagina = 1;
  }

  toggleFiltros(ev?: Event): void {
    ev?.stopPropagation();
    this.dispararPulsoToolbar('filtro');
    this.filtrosAbertos = !this.filtrosAbertos;
  }

  marcasDisponiveis(): string[] {
    return [
      ...new Set(
        this.itens
          .map((p) => String(p.marca ?? '').trim())
          .filter(Boolean),
      ),
    ].sort((a, b) => a.localeCompare(b, 'pt-BR'));
  }

  categoriasDisponiveis(): string[] {
    return [
      ...new Set(
        this.itens
          .map((p) => String(p.categoria ?? '').trim())
          .filter(Boolean),
      ),
    ].sort((a, b) => a.localeCompare(b, 'pt-BR'));
  }

  todasMarcasSelecionadas(): boolean {
    return this.filtroMarcas === null;
  }

  marcaFiltroMarcada(marca: string): boolean {
    return this.filtroMarcas === null || this.filtroMarcas.has(marca);
  }

  toggleTodasMarcas(ev: Event): void {
    const checked = (ev.target as HTMLInputElement).checked;
    this.filtroMarcas = checked ? null : new Set();
    this.pagina = 1;
  }

  toggleFiltroMarca(marca: string, ev: Event): void {
    const checked = (ev.target as HTMLInputElement).checked;
    const todas = this.marcasDisponiveis();
    if (this.filtroMarcas === null) {
      this.filtroMarcas = new Set(todas);
    }
    if (checked) this.filtroMarcas.add(marca);
    else this.filtroMarcas.delete(marca);
    if (
      this.filtroMarcas.size === 0 ||
      (todas.length > 0 && todas.every((m) => this.filtroMarcas!.has(m)))
    ) {
      this.filtroMarcas = this.filtroMarcas.size === 0 ? new Set() : null;
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
      this.filtroCategorias =
        this.filtroCategorias.size === 0 ? new Set() : null;
    }
    this.pagina = 1;
  }

  get filtroAlgumAtivo(): boolean {
    return this.filtroMarcas !== null || this.filtroCategorias !== null;
  }

  onLimparFiltros(): void {
    this.filtroMarcas = null;
    this.filtroCategorias = null;
    this.pagina = 1;
  }

  onAplicarFiltros(): void {
    this.pagina = 1;
    this.filtrosAbertos = false;
  }

  onNovo(): void {
    const marcas = [
      ...new Set(
        this.itens
          .map((p) => String(p.marca ?? '').trim())
          .filter(Boolean),
      ),
    ].sort((a, b) => a.localeCompare(b, 'pt-BR'));
    this.api.listCategoriasCatalogo(false).subscribe({
      next: (cats) => {
        const categorias = (cats ?? [])
          .map((c) => String(c.nome ?? '').trim())
          .filter(Boolean)
          .sort((a, b) => a.localeCompare(b, 'pt-BR'));
        this.produtoDrawer.abrirNovo({
          categorias,
          marcas,
          onSalvo: () => this.carregar(),
        });
      },
      error: () => {
        const categorias = [
          ...new Set(
            this.itens
              .map((p) => String(p.categoria ?? '').trim())
              .filter(Boolean),
          ),
        ].sort((a, b) => a.localeCompare(b, 'pt-BR'));
        this.produtoDrawer.abrirNovo({
          categorias,
          marcas,
          onSalvo: () => this.carregar(),
        });
      },
    });
  }

  abrirEditar(p: ProdutoCatalogoItem): void {
    const marcas = [
      ...new Set(
        this.itens
          .map((x) => String(x.marca ?? '').trim())
          .filter(Boolean),
      ),
    ].sort((a, b) => a.localeCompare(b, 'pt-BR'));
    const categoriasFallback = [
      ...new Set(
        this.itens
          .map((x) => String(x.categoria ?? '').trim())
          .filter(Boolean),
      ),
    ].sort((a, b) => a.localeCompare(b, 'pt-BR'));
    this.api.listCategoriasCatalogo(false).subscribe({
      next: (cats) => {
        const categorias = (cats ?? [])
          .map((c) => String(c.nome ?? '').trim())
          .filter(Boolean)
          .sort((a, b) => a.localeCompare(b, 'pt-BR'));
        this.produtoDrawer.abrirEdicao(p, {
          categorias: categorias.length ? categorias : categoriasFallback,
          marcas,
          onSalvo: () => this.carregar(),
        });
      },
      error: () => {
        this.produtoDrawer.abrirEdicao(p, {
          categorias: categoriasFallback,
          marcas,
          onSalvo: () => this.carregar(),
        });
      },
    });
  }

  pedirExcluir(p: ProdutoCatalogoItem, ev?: Event): void {
    ev?.stopPropagation();
    this.excluirAlvo = p;
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
    const p = this.excluirAlvo;
    if (!p || this.excluindo) return;
    this.excluindo = true;
    this.excluirErro = '';
    this.api.deleteProduto(p.id).subscribe({
      next: () => {
        this.excluindo = false;
        this.selecionados.delete(p.id);
        this.fecharExcluir();
        this.toast.show('Produto excluído.');
        this.carregar();
      },
      error: (e: Error) => {
        this.excluindo = false;
        this.excluirErro = extractApiErrorMessage(
          e,
          'Não foi possível excluir o produto.',
        );
      },
    });
  }

  abrirEntrada(p: ProdutoCatalogoItem, ev?: Event): void {
    ev?.stopPropagation();
    this.entradaProduto = p;
    this.entradaQtd = '1';
    this.entradaErro = '';
    this.entradaSalvando = false;
    this.formEntradaAberto = false;
    this.movimentosErro = '';
    this.movimentos = [];
    this.movimentosOrdenacaoDir = 'desc';
    this.movimentosDrawerAberto = true;
    this.movimentosPanelOpen = false;
    if (this.movimentosCloseTimer != null) {
      clearTimeout(this.movimentosCloseTimer);
      this.movimentosCloseTimer = null;
    }
    queueMicrotask(() => {
      requestAnimationFrame(() => {
        requestAnimationFrame(() => {
          this.movimentosPanelOpen = true;
        });
      });
    });
    this.carregarMovimentos(p.id);
  }

  fecharEntrada(): void {
    if (this.entradaSalvando) return;
    this.movimentosPanelOpen = false;
    this.formEntradaAberto = false;
    if (this.movimentosCloseTimer != null) clearTimeout(this.movimentosCloseTimer);
    this.movimentosCloseTimer = setTimeout(() => {
      this.movimentosCloseTimer = null;
      this.movimentosDrawerAberto = false;
      this.entradaProduto = null;
      this.entradaErro = '';
      this.movimentos = [];
      this.movimentosErro = '';
    }, DRAWER_ANIM_MS);
  }

  carregarMovimentos(produtoId: number): void {
    this.movimentosCarregando = true;
    this.movimentosErro = '';
    this.api.listEstoqueMovimentos(produtoId).subscribe({
      next: (items) => {
        this.movimentos = this.ordenarMovimentosPorData(items ?? []);
        this.movimentosCarregando = false;
      },
      error: (e: unknown) => {
        this.movimentosCarregando = false;
        this.movimentosErro =
          extractApiErrorMessage(e) ||
          'Não foi possível carregar as movimentações.';
      },
    });
  }

  onOrdenarMovimentosData(ev?: Event): void {
    ev?.stopPropagation();
    this.movimentosOrdenacaoDir =
      this.movimentosOrdenacaoDir === 'asc' ? 'desc' : 'asc';
    this.movimentos = this.ordenarMovimentosPorData(this.movimentos);
  }

  tooltipOrdenacaoMovimentosData(): string {
    return tooltipOrdenacaoProximoClique(
      'data',
      this.movimentosOrdenacaoDir,
      'data',
    );
  }

  private ordenarMovimentosPorData(
    items: EstoqueMovimentoItem[],
  ): EstoqueMovimentoItem[] {
    const dir = this.movimentosOrdenacaoDir === 'asc' ? 1 : -1;
    return items.slice().sort((a, b) => {
      const ta = Date.parse(String(a.created_at ?? '')) || 0;
      const tb = Date.parse(String(b.created_at ?? '')) || 0;
      if (ta !== tb) return (ta - tb) * dir;
      return (a.id - b.id) * dir;
    });
  }

  abrirFormNovaEntrada(): void {
    this.entradaQtd = '1';
    this.entradaErro = '';
    this.formEntradaAberto = true;
  }

  cancelarFormEntrada(): void {
    if (this.entradaSalvando) return;
    this.formEntradaAberto = false;
    this.entradaErro = '';
  }

  rotuloUnidadeEstoque(
    p: ProdutoCatalogoItem,
    quantidade?: number | string | null,
  ): string {
    const q =
      quantidade != null && String(quantidade).trim() !== ''
        ? Math.abs(this.parseQuantidadeTexto(quantidade))
        : Math.abs(this.estoqueUnidades(p));
    return sufixoUnidadeProduto(p.unidade, q);
  }

  private parseQuantidadeTexto(v: number | string | null | undefined): number {
    if (typeof v === 'number' && Number.isFinite(v)) return v;
    let t = String(v ?? '').replace(/\s/g, '').trim();
    if (!t) return 0;
    if (t.includes(',')) {
      t = t.replace(/\./g, '').replace(',', '.');
    }
    const n = parseFloat(t.replace(/[^\d.-]/g, ''));
    return Number.isFinite(n) ? n : 0;
  }

  rotuloEntradaUnidade(p: ProdutoCatalogoItem): string {
    if (unidadeProdutoUsaEquivalente(p.unidade)) return 'frasco(s)';
    return sufixoUnidadeProduto(p.unidade, 2);
  }

  formatarDataMovimento(iso: string): string {
    const raw = String(iso ?? '').trim();
    if (!raw) return '—';
    const d = new Date(raw);
    if (Number.isNaN(d.getTime())) return raw.slice(0, 10);
    return d.toLocaleDateString('pt-BR');
  }

  confirmarEntrada(): void {
    const p = this.entradaProduto;
    if (!p || this.entradaSalvando) return;
    const q = Number(String(this.entradaQtd).replace(',', '.'));
    if (!Number.isFinite(q) || q <= 0) {
      this.entradaErro = 'Informe uma quantidade maior que zero.';
      return;
    }
    this.entradaSalvando = true;
    this.entradaErro = '';
    const opts = unidadeProdutoUsaEquivalente(p.unidade)
      ? { adicionar_unidades: q }
      : { adicionar: Math.trunc(q) };
    this.api.incrementarEstoqueProduto(p.id, opts).subscribe({
      next: () => {
        this.entradaSalvando = false;
        this.formEntradaAberto = false;
        this.toast.show('Estoque atualizado.');
        this.carregarMovimentos(p.id);
        this.carregar();
      },
      error: (e: unknown) => {
        this.entradaSalvando = false;
        this.entradaErro =
          extractApiErrorMessage(e) ||
          'Não foi possível registrar a entrada.';
      },
    });
  }

  onOrdenarColuna(col: ProdutosOrdenacaoColuna, ev?: Event): void {
    ev?.stopPropagation();
    if (this.ordenacaoColuna === col) {
      this.ordenacaoDir = this.ordenacaoDir === 'asc' ? 'desc' : 'asc';
    } else {
      this.ordenacaoColuna = col;
      this.ordenacaoDir = 'asc';
    }
    this.pagina = 1;
  }

  tooltipOrdenacao(col: ProdutosOrdenacaoColuna): string {
    return tooltipOrdenacaoProximoClique(
      this.ordenacaoColuna,
      this.ordenacaoDir,
      col,
    );
  }

  private normalizarBusca(s: string): string {
    return String(s ?? '')
      .trim()
      .toLowerCase()
      .normalize('NFD')
      .replace(/\p{M}/gu, '');
  }

  filtrados(): ProdutoCatalogoItem[] {
    if (this.aba === 'lotes') return [];

    const q = this.normalizarBusca(this.busca);
    let list = this.itens.slice();
    if (q) {
      list = list.filter((p) => {
        const campos = [p.produto, p.categoria, p.marca];
        return campos.some((c) =>
          this.normalizarBusca(String(c ?? '')).includes(q),
        );
      });
    }

    if (this.filtroMarcas) {
      list = list.filter((p) => {
        const m = String(p.marca ?? '').trim();
        return m.length > 0 && this.filtroMarcas!.has(m);
      });
    }
    if (this.filtroCategorias) {
      list = list.filter((p) => {
        const c = String(p.categoria ?? '').trim();
        return c.length > 0 && this.filtroCategorias!.has(c);
      });
    }

    const dir = this.ordenacaoDir === 'asc' ? 1 : -1;
    list.sort((a, b) => {
      switch (this.ordenacaoColuna) {
        case 'estoque':
          return (this.estoqueUnidades(a) - this.estoqueUnidades(b)) * dir;
        case 'preco': {
          const pa = this.precoNum(a) ?? 0;
          const pb = this.precoNum(b) ?? 0;
          return (pa - pb) * dir;
        }
        case 'comissao': {
          const ca = this.comissaoNum(a);
          const cb = this.comissaoNum(b);
          return (ca - cb) * dir;
        }
        case 'nome':
        default: {
          const na = this.normalizarBusca(a.produto ?? '');
          const nb = this.normalizarBusca(b.produto ?? '');
          return na.localeCompare(nb, 'pt-BR') * dir;
        }
      }
    });
    return list;
  }

  totalFiltrado(): number {
    return this.filtrados().length;
  }

  itensPagina(): ProdutoCatalogoItem[] {
    const all = this.filtrados();
    const start = (this.pagina - 1) * this.itensPorPagina;
    return all.slice(start, start + this.itensPorPagina);
  }

  totalPaginas(): number {
    const n = this.totalFiltrado();
    return Math.max(1, Math.ceil(n / this.itensPorPagina) || 1);
  }

  paginaAnterior(): void {
    if (this.pagina > 1) this.pagina--;
  }

  paginaSeguinte(): void {
    if (this.pagina < this.totalPaginas()) this.pagina++;
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
    this.pagina = 1;
  }

  estaSelecionado(id: number): boolean {
    return this.selecionados.has(id);
  }

  toggleSelecionado(p: ProdutoCatalogoItem, ev: Event): void {
    const checked = (ev.target as HTMLInputElement).checked;
    if (checked) this.selecionados.add(p.id);
    else this.selecionados.delete(p.id);
  }

  todosDaPaginaSelecionados(): boolean {
    const page = this.itensPagina();
    return page.length > 0 && page.every((p) => this.selecionados.has(p.id));
  }

  toggleSelecionarTodos(ev: Event): void {
    const checked = (ev.target as HTMLInputElement).checked;
    for (const p of this.itensPagina()) {
      if (checked) this.selecionados.add(p.id);
      else this.selecionados.delete(p.id);
    }
  }

  exibirTexto(v: string | null | undefined): string {
    const s = String(v ?? '').trim();
    return s || '';
  }

  marcaProduto(p: ProdutoCatalogoItem): string {
    return this.exibirTexto(p.marca);
  }

  comissaoProduto(p: ProdutoCatalogoItem): string {
    const c = String(p.comissao_padrao ?? '').trim();
    if (!c) return '';
    return c.includes('%') ? c : `${c} %`;
  }

  private comissaoNum(p: ProdutoCatalogoItem): number {
    const raw = String(p.comissao_padrao ?? '').replace(/[^\d.,-]/g, '');
    if (!raw) return 0;
    const n = parseFloat(raw.replace(',', '.'));
    return Number.isFinite(n) ? n : 0;
  }

  precoNum(p: ProdutoCatalogoItem): number | null {
    const v = p.preco;
    if (v == null || v === '') return null;
    if (typeof v === 'number' && Number.isFinite(v)) return v;
    let t = String(v)
      .replace(/R\$/gi, '')
      .replace(/\u00a0/g, ' ')
      .replace(/\s/g, '')
      .trim();
    if (!t) return null;
    if (t.includes(',')) {
      t = t.replace(/\./g, '').replace(',', '.');
    }
    const n = parseFloat(t.replace(/[^\d.-]/g, ''));
    return Number.isFinite(n) ? n : null;
  }

  estoqueUnidades(p: ProdutoCatalogoItem): number {
    const v = p.estoque;
    if (v == null || v === '') return 0;
    if (typeof v === 'number' && Number.isFinite(v)) return v;
    let t = String(v).replace(/\s/g, '').trim();
    if (!t) return 0;
    if (t.includes(',')) {
      t = t.replace(/\./g, '').replace(',', '.');
    }
    const n = parseFloat(t.replace(/[^\d.-]/g, ''));
    return Number.isFinite(n) ? n : 0;
  }

  /** Zerado/negativo = baixo; até o mínimo = atenção; acima = ok (cor padrão). */
  nivelEstoque(p: ProdutoCatalogoItem): 'baixo' | 'atencao' | 'ok' {
    const q = this.estoqueUnidades(p);
    if (q <= 0) return 'baixo';
    const min = this.estoqueMinimoNum(p);
    if (min > 0 && q <= min) return 'atencao';
    return 'ok';
  }

  private estoqueMinimoNum(p: ProdutoCatalogoItem): number {
    const v = p.estoque_minimo;
    if (v == null || v === '') return 0;
    if (typeof v === 'number' && Number.isFinite(v)) return Math.max(0, v);
    let t = String(v).replace(/\s/g, '').trim();
    if (!t) return 0;
    if (t.includes(',')) {
      t = t.replace(/\./g, '').replace(',', '.');
    }
    const n = parseFloat(t.replace(/[^\d.-]/g, ''));
    return Number.isFinite(n) ? Math.max(0, n) : 0;
  }

  @HostListener('document:keydown.escape', ['$event'])
  onEscape(ev: KeyboardEvent): void {
    if (this.excluirModalAberto) {
      ev.preventDefault();
      this.fecharExcluir();
      return;
    }
    if (this.movimentosDrawerAberto) {
      ev.preventDefault();
      if (this.formEntradaAberto) {
        this.cancelarFormEntrada();
        return;
      }
      this.fecharEntrada();
      return;
    }
    if (this.filtrosAbertos) {
      ev.preventDefault();
      this.filtrosAbertos = false;
      return;
    }
    if (this.perPageMenuAberto) {
      ev.preventDefault();
      this.perPageMenuAberto = false;
      return;
    }
    if (this.buscaAberta) {
      ev.preventDefault();
      this.fecharPainelBusca();
    }
  }

  @HostListener('document:click', ['$event'])
  onDocumentClick(ev: MouseEvent): void {
    const t = ev.target as HTMLElement | null;
    if (this.buscaAberta && !t?.closest?.('.list-head__busca-wrap')) {
      this.fecharPainelBusca();
    }
    if (
      this.perPageMenuAberto &&
      t &&
      !t.closest('.list-footer__per-page')
    ) {
      this.perPageMenuAberto = false;
    }
  }
}
