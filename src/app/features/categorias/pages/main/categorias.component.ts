import { Component, HostListener, OnDestroy, OnInit, inject } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { forkJoin } from 'rxjs';
import { SheetsApiService } from '../../../../core/services/sheets-api.service';
import { AppToastService } from '../../../../shared/app-toast/app-toast.service';
import { lerServicoTexto } from '../../../../core/utils/servico-campos';
import type {
  ProdutoCatalogoItem,
  Servico,
} from '../../../../core/models/api.models';
import { UiTipTriggerComponent } from '../../../../shared/ui-tip-trigger/ui-tip-trigger.component';
import { TableEmptyComponent } from '../../../../shared/table-empty/table-empty.component';
import { tooltipOrdenacaoProximoClique } from '../../../../shared/table-sort-tip.util';
import { FlipDropdownPanelDirective } from '../../../../shared/flip-dropdown-panel/flip-dropdown-panel.directive';

export interface CategoriaListaItem {
  id: number;
  nome: string;
  ativo: boolean;
  qtdItens: number;
}

export interface CategoriaAssociacaoItem {
  id: string;
  nome: string;
  tipo: 'servico' | 'produto';
}

const DRAWER_ANIM_MS = 430;
const CATEGORIA_SALVA_TOAST_MSG = 'Categoria salva com sucesso!';
const CATEGORIA_EXCLUIDA_TOAST_MSG = 'Categoria excluída com sucesso!';

@Component({
  selector: 'app-categorias',
  standalone: true,
  imports: [
    FlipDropdownPanelDirective,TableEmptyComponent, FormsModule, UiTipTriggerComponent],
  templateUrl: './categorias.component.html',
  styleUrl: './categorias.component.scss',
})
export class CategoriasComponent implements OnInit, OnDestroy {
  private readonly api = inject(SheetsApiService);
  private readonly toast = inject(AppToastService);

  carregando = false;
  erro = '';
  itens: CategoriaListaItem[] = [];

  busca = '';
  buscaAberta = false;
  filtrosAbertos = false;
  pulsoToolbarBusca = false;
  pulsoToolbarFiltro = false;
  private readonly duracaoPulsoToolbarMs = 600;
  private tPulsoFiltro = 0;
  /** Filtro de status: só ativas por omissão; inativas só com filtro. */
  filtroAtivas = true;
  filtroInativas = false;

  pagina = 1;
  porPagina = 20;
  readonly opcoesPorPagina = [10, 20, 50];
  perPageMenuAberto = false;
  selecionados = new Set<number>();

  ordenacaoColuna: 'nome' = 'nome';
  ordenacaoDir: 'asc' | 'desc' = 'asc';

  /** Catálogo em memória para o drawer de associações. */
  private produtosCatalogo: ProdutoCatalogoItem[] = [];
  private servicosCatalogo: Servico[] = [];

  associacoesAberto = false;
  associacoesPanelOpen = false;
  associacoesCategoria: CategoriaListaItem | null = null;
  associacoesItens: CategoriaAssociacaoItem[] = [];
  private associacoesCloseTimer: ReturnType<typeof setTimeout> | null = null;

  cadastroAberto = false;
  cadastroPanelOpen = false;
  cadastroNome = '';
  cadastroAtivo = true;
  cadastroSalvando = false;
  cadastroNomeErro = false;
  /** `null` = nova; item = edição. */
  cadastroEditando: CategoriaListaItem | null = null;
  private cadastroCloseTimer: ReturnType<typeof setTimeout> | null = null;

  exclusaoModalItem: CategoriaListaItem | null = null;
  exclusaoModalSalvando = false;

  get cadastroTitulo(): string {
    return this.cadastroEditando ? 'Editar categoria' : 'Nova categoria';
  }

  ngOnInit(): void {
    this.carregar();
  }

  ngOnDestroy(): void {
    if (this.associacoesCloseTimer != null) {
      clearTimeout(this.associacoesCloseTimer);
    }
    if (this.cadastroCloseTimer != null) {
      clearTimeout(this.cadastroCloseTimer);
    }
  }

  get buscaPlaceholder(): string {
    return this.buscaAberta ? 'Buscar categorias…' : '';
  }

  carregar(): void {
    this.carregando = true;
    this.erro = '';
    forkJoin({
      categorias: this.api.listCategoriasCatalogo(true),
      produtos: this.api.listProdutos(),
      servicos: this.api.listServicos(),
    }).subscribe({
      next: ({ categorias, produtos, servicos }) => {
        this.produtosCatalogo = produtos ?? [];
        this.servicosCatalogo = servicos ?? [];
        this.itens = (categorias ?? []).map((c) => ({
          id: c.id,
          nome: c.nome,
          ativo: c.ativo !== false,
          qtdItens: Number(c.qtd_itens ?? 0),
        }));
        this.carregando = false;
        this.pagina = 1;
        this.selecionados.clear();
      },
      error: (e: Error) => {
        this.erro =
          e.message || 'Não foi possível carregar categorias. Tente novamente.';
        this.carregando = false;
      },
    });
  }

  onBuscaWrapClick(): void {
    if (!this.buscaAberta) {
      this.dispararPulsoToolbar('busca');
      this.buscaAberta = true;
      queueMicrotask(() =>
        document.getElementById('categorias-busca-input')?.focus(),
      );
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

  toggleFiltroStatus(which: 'ativos' | 'inativos', ev: Event): void {
    const checked = (ev.target as HTMLInputElement).checked;
    if (which === 'ativos') this.filtroAtivas = checked;
    else this.filtroInativas = checked;
    // Evita lista vazia se ambos ficarem desmarcados.
    if (!this.filtroAtivas && !this.filtroInativas) {
      if (which === 'ativos') this.filtroInativas = true;
      else this.filtroAtivas = true;
    }
    this.pagina = 1;
  }

  get filtroStatusAtivo(): boolean {
    return !this.filtroAtivas || this.filtroInativas;
  }

  onNovo(): void {
    this.abrirCadastro(null, true);
  }

  toggleCadastroAtivo(ev: Event): void {
    if (this.cadastroSalvando) return;
    this.cadastroAtivo = !this.cadastroAtivo;
    const el = ev.currentTarget as HTMLElement | null;
    if (el) this.pulsarSwitch(el);
  }

  private pulsarSwitch(el: HTMLElement): void {
    el.classList.remove('drawer-switch--pulse');
    void el.offsetWidth;
    el.classList.add('drawer-switch--pulse');
    window.setTimeout(() => el.classList.remove('drawer-switch--pulse'), 1500);
  }

  private focarCampoNome(): void {
    queueMicrotask(() => {
      document.getElementById('categorias-cadastro-nome')?.focus();
    });
  }

  private abrirCadastro(
    item: CategoriaListaItem | null,
    focarNome = false,
  ): void {
    if (this.cadastroCloseTimer != null) {
      clearTimeout(this.cadastroCloseTimer);
      this.cadastroCloseTimer = null;
    }
    this.cadastroEditando = item;
    this.cadastroNome = item?.nome ?? '';
    this.cadastroAtivo = item ? item.ativo !== false : true;
    this.cadastroSalvando = false;
    this.cadastroNomeErro = false;
    this.cadastroAberto = true;
    this.cadastroPanelOpen = false;
    queueMicrotask(() => {
      requestAnimationFrame(() => {
        requestAnimationFrame(() => {
          this.cadastroPanelOpen = true;
          if (focarNome) this.focarCampoNome();
        });
      });
    });
  }

  fecharCadastro(): void {
    if (!this.cadastroAberto || this.cadastroSalvando) return;
    this.cadastroPanelOpen = false;
    if (this.cadastroCloseTimer != null) {
      clearTimeout(this.cadastroCloseTimer);
    }
    this.cadastroCloseTimer = setTimeout(() => {
      this.cadastroCloseTimer = null;
      this.cadastroAberto = false;
      this.cadastroEditando = null;
      this.cadastroNome = '';
      this.cadastroAtivo = true;
      this.cadastroNomeErro = false;
    }, DRAWER_ANIM_MS);
  }

  onCadastroNomeInput(): void {
    if (this.cadastroNomeErro && this.cadastroNome.trim()) {
      this.cadastroNomeErro = false;
    }
  }

  salvarCadastro(): void {
    const nome = this.cadastroNome.trim();
    if (this.cadastroSalvando) return;
    if (!nome) {
      this.cadastroNomeErro = true;
      return;
    }
    this.cadastroNomeErro = false;
    this.cadastroSalvando = true;
    this.erro = '';
    const editando = this.cadastroEditando;
    const onOk = () => {
      this.cadastroSalvando = false;
      this.fecharCadastro();
      this.toast.show(CATEGORIA_SALVA_TOAST_MSG);
      this.carregar();
    };
    const onErr = (e: Error) => {
      this.cadastroSalvando = false;
      this.toast.show(e.message || 'Não foi possível salvar a categoria.');
    };
    if (editando) {
      this.api
        .atualizarCategoriaCatalogo(editando.id, {
          nome,
          ativo: this.cadastroAtivo,
        })
        .subscribe({ next: onOk, error: onErr });
    } else {
      this.api
        .criarCategoriaCatalogo({ nome, ativo: this.cadastroAtivo })
        .subscribe({ next: onOk, error: onErr });
    }
  }

  onEditar(item: CategoriaListaItem): void {
    this.abrirCadastro(item, false);
  }

  onExcluir(item: CategoriaListaItem, ev?: Event): void {
    ev?.stopPropagation();
    this.exclusaoModalItem = item;
  }

  fecharModalExclusao(): void {
    if (this.exclusaoModalSalvando) return;
    this.exclusaoModalItem = null;
  }

  confirmarModalExclusao(): void {
    const item = this.exclusaoModalItem;
    if (!item || this.exclusaoModalSalvando) return;
    this.exclusaoModalSalvando = true;
    this.api.excluirCategoriaCatalogo(item.id).subscribe({
      next: (res) => {
        this.exclusaoModalSalvando = false;
        this.exclusaoModalItem = null;
        this.selecionados.delete(item.id);
        this.toast.show(
          res.result === 'deactivated'
            ? 'Categoria desativada (já usada em serviços ou produtos).'
            : CATEGORIA_EXCLUIDA_TOAST_MSG,
        );
        this.carregar();
      },
      error: (e: Error) => {
        this.exclusaoModalSalvando = false;
        this.toast.show(e.message || 'Não foi possível excluir a categoria.');
      },
    });
  }

  private keyNome(nome: string): string {
    return String(nome ?? '')
      .trim()
      .toLocaleLowerCase('pt-BR');
  }

  abrirAssociacoes(item: CategoriaListaItem, ev?: Event): void {
    ev?.stopPropagation();
    if (item.qtdItens <= 0) return;
    const key = this.keyNome(item.nome);
    const out: CategoriaAssociacaoItem[] = [];
    for (const s of this.servicosCatalogo) {
      const cat = lerServicoTexto(s, 'Categoria', 'categoria');
      if (this.keyNome(cat) !== key) continue;
      const nome =
        lerServicoTexto(s, 'Serviço', 'Servico', 'servico', 'nome') ||
        `Serviço #${s.id}`;
      out.push({ id: `s-${s.id}`, nome, tipo: 'servico' });
    }
    for (const p of this.produtosCatalogo) {
      const cat = String(p.categoria ?? '').trim();
      if (this.keyNome(cat) !== key) continue;
      const nome = String(p.produto ?? '').trim() || `Produto #${p.id}`;
      out.push({ id: `p-${p.id}`, nome, tipo: 'produto' });
    }
    out.sort((a, b) => a.nome.localeCompare(b.nome, 'pt-BR'));
    this.associacoesCategoria = item;
    this.associacoesItens = out;
    this.associacoesAberto = true;
    this.associacoesPanelOpen = false;
    if (this.associacoesCloseTimer != null) {
      clearTimeout(this.associacoesCloseTimer);
      this.associacoesCloseTimer = null;
    }
    queueMicrotask(() => {
      requestAnimationFrame(() => {
        requestAnimationFrame(() => {
          this.associacoesPanelOpen = true;
        });
      });
    });
  }

  fecharAssociacoes(): void {
    if (!this.associacoesAberto) return;
    this.associacoesPanelOpen = false;
    if (this.associacoesCloseTimer != null) {
      clearTimeout(this.associacoesCloseTimer);
    }
    this.associacoesCloseTimer = setTimeout(() => {
      this.associacoesCloseTimer = null;
      this.associacoesAberto = false;
      this.associacoesCategoria = null;
      this.associacoesItens = [];
    }, DRAWER_ANIM_MS);
  }

  onOrdenarColuna(col: 'nome', ev?: Event): void {
    ev?.stopPropagation();
    if (this.ordenacaoColuna === col) {
      this.ordenacaoDir = this.ordenacaoDir === 'asc' ? 'desc' : 'asc';
    } else {
      this.ordenacaoColuna = col;
      this.ordenacaoDir = 'asc';
    }
    this.pagina = 1;
  }

  tooltipOrdenacao(col: 'nome'): string {
    return tooltipOrdenacaoProximoClique(
      this.ordenacaoColuna,
      this.ordenacaoDir,
      col,
    );
  }

  private normalizar(s: string): string {
    return String(s ?? '')
      .trim()
      .toLowerCase()
      .normalize('NFD')
      .replace(/\p{M}/gu, '');
  }

  filtrados(): CategoriaListaItem[] {
    const q = this.normalizar(this.busca);
    let list = this.itens.filter((i) => {
      if (i.ativo) return this.filtroAtivas;
      return this.filtroInativas;
    });
    if (q) {
      list = list.filter((i) => this.normalizar(i.nome).includes(q));
    }
    const dir = this.ordenacaoDir === 'asc' ? 1 : -1;
    list.sort((a, b) => a.nome.localeCompare(b.nome, 'pt-BR') * dir);
    return list;
  }

  totalFiltrado(): number {
    return this.filtrados().length;
  }

  totalPaginas(): number {
    return Math.max(1, Math.ceil(this.totalFiltrado() / this.porPagina) || 1);
  }

  paginaItens(): CategoriaListaItem[] {
    const all = this.filtrados();
    const start = (this.pagina - 1) * this.porPagina;
    return all.slice(start, start + this.porPagina);
  }

  irPagina(delta: number): void {
    this.pagina = Math.min(
      this.totalPaginas(),
      Math.max(1, this.pagina + delta),
    );
  }

  togglePerPageMenu(ev: Event): void {
    ev.stopPropagation();
    this.perPageMenuAberto = !this.perPageMenuAberto;
  }

  selecionarPorPagina(n: number, ev: Event): void {
    ev.stopPropagation();
    this.porPagina = n;
    this.perPageMenuAberto = false;
    this.pagina = 1;
  }

  rotuloItens(n: number): string {
    if (n <= 0) return 'Nenhum item associado';
    if (n === 1) return 'Possui um item associado';
    return `Possui ${n} itens associados`;
  }

  estaSelecionado(id: number): boolean {
    return this.selecionados.has(id);
  }

  toggleSelecionado(item: CategoriaListaItem, ev: Event): void {
    const checked = (ev.target as HTMLInputElement).checked;
    if (checked) this.selecionados.add(item.id);
    else this.selecionados.delete(item.id);
  }

  todosDaPaginaSelecionados(): boolean {
    const page = this.paginaItens();
    return page.length > 0 && page.every((i) => this.selecionados.has(i.id));
  }

  toggleSelecionarTodos(ev: Event): void {
    const checked = (ev.target as HTMLInputElement).checked;
    for (const i of this.paginaItens()) {
      if (checked) this.selecionados.add(i.id);
      else this.selecionados.delete(i.id);
    }
  }

  @HostListener('document:keydown.escape', ['$event'])
  onEscape(ev: KeyboardEvent): void {
    if (this.exclusaoModalItem) {
      ev.preventDefault();
      this.fecharModalExclusao();
      return;
    }
    if (this.cadastroAberto) {
      ev.preventDefault();
      this.fecharCadastro();
      return;
    }
    if (this.associacoesAberto) {
      ev.preventDefault();
      this.fecharAssociacoes();
      return;
    }
    if (this.perPageMenuAberto) this.perPageMenuAberto = false;
    else if (this.filtrosAbertos) this.filtrosAbertos = false;
    else if (this.buscaAberta) this.buscaAberta = false;
  }

  @HostListener('document:click', ['$event'])
  onDocumentClick(ev: MouseEvent): void {
    const t = ev.target as HTMLElement | null;
    if (this.buscaAberta && !t?.closest?.('.list-head__busca-wrap')) {
      this.buscaAberta = false;
    }
    if (this.perPageMenuAberto && !t?.closest?.('.list-footer__per-page')) {
      this.perPageMenuAberto = false;
    }
  }
}
