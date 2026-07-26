import { Component, HostListener, OnDestroy, OnInit, inject } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { SheetsApiService } from '../../../../core/services/sheets-api.service';
import { AppToastService } from '../../../../shared/app-toast/app-toast.service';
import { UiTipTriggerComponent } from '../../../../shared/ui-tip-trigger/ui-tip-trigger.component';
import { tooltipOrdenacaoProximoClique } from '../../../../shared/table-sort-tip.util';

export interface MarcaListaItem {
  id: string;
  nome: string;
  qtdItens: number;
}

const DRAWER_ANIM_MS = 430;

@Component({
  selector: 'app-marcas',
  standalone: true,
  imports: [FormsModule, UiTipTriggerComponent],
  templateUrl: './marcas.component.html',
  styleUrl: './marcas.component.scss',
})
export class MarcasComponent implements OnInit, OnDestroy {
  private readonly api = inject(SheetsApiService);
  private readonly toast = inject(AppToastService);

  carregando = false;
  erro = '';
  itens: MarcaListaItem[] = [];

  busca = '';
  buscaAberta = false;
  filtrosAbertos = false;
  pulsoToolbarBusca = false;

  pagina = 1;
  porPagina = 20;
  readonly opcoesPorPagina = [10, 20, 50];
  perPageMenuAberto = false;
  selecionados = new Set<string>();

  ordenacaoColuna: 'nome' = 'nome';
  ordenacaoDir: 'asc' | 'desc' = 'asc';

  private readonly labelByKey = new Map<string, string>();

  cadastroAberto = false;
  cadastroPanelOpen = false;
  cadastroNome = '';
  cadastroAtivo = true;
  cadastroSalvando = false;
  cadastroNomeErro = false;
  /** `null` = nova; item = edição. */
  cadastroEditando: MarcaListaItem | null = null;
  private cadastroCloseTimer: ReturnType<typeof setTimeout> | null = null;

  get cadastroTitulo(): string {
    return this.cadastroEditando ? 'Editar marca' : 'Nova marca';
  }

  ngOnInit(): void {
    this.carregar();
  }

  ngOnDestroy(): void {
    if (this.cadastroCloseTimer != null) {
      clearTimeout(this.cadastroCloseTimer);
    }
  }

  get buscaPlaceholder(): string {
    return this.buscaAberta ? 'Buscar marcas…' : '';
  }

  carregar(): void {
    this.carregando = true;
    this.erro = '';
    this.api.listProdutos().subscribe({
      next: (produtos) => {
        const counts = new Map<string, number>();
        this.labelByKey.clear();
        for (const p of produtos) {
          const nome = String(p.marca ?? '').trim();
          if (!nome) continue;
          const key = nome.toLocaleLowerCase('pt-BR');
          counts.set(key, (counts.get(key) ?? 0) + 1);
          if (!this.labelByKey.has(key)) this.labelByKey.set(key, nome);
        }
        this.itens = [...counts.entries()]
          .map(([key, qtd]) => ({
            id: key,
            nome: this.labelByKey.get(key) ?? key,
            qtdItens: qtd,
          }))
          .sort((a, b) => a.nome.localeCompare(b.nome, 'pt-BR'));
        this.carregando = false;
        this.pagina = 1;
        this.selecionados.clear();
      },
      error: (e: Error) => {
        this.erro =
          e.message || 'Não foi possível carregar marcas. Tente novamente.';
        this.carregando = false;
      },
    });
  }

  onBuscaWrapClick(): void {
    if (!this.buscaAberta) {
      this.pulsoToolbarBusca = true;
      window.setTimeout(() => (this.pulsoToolbarBusca = false), 600);
      this.buscaAberta = true;
      queueMicrotask(() =>
        document.getElementById('marcas-busca-input')?.focus(),
      );
    }
  }

  onBuscaInput(): void {
    this.pagina = 1;
  }

  toggleFiltros(): void {
    this.filtrosAbertos = !this.filtrosAbertos;
  }

  limparFiltros(): void {
    this.pagina = 1;
  }

  aplicarFiltros(): void {
    this.pagina = 1;
    this.filtrosAbertos = false;
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
      document.getElementById('marcas-cadastro-nome')?.focus();
    });
  }

  private abrirCadastro(item: MarcaListaItem | null, focarNome = false): void {
    if (this.cadastroCloseTimer != null) {
      clearTimeout(this.cadastroCloseTimer);
      this.cadastroCloseTimer = null;
    }
    this.cadastroEditando = item;
    this.cadastroNome = item?.nome ?? '';
    this.cadastroAtivo = true;
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
    this.toast.show(
      this.cadastroEditando
        ? `Edição de «${nome}» em breve.`
        : 'Cadastro de marcas em breve.',
    );
  }

  onEditar(item: MarcaListaItem): void {
    this.abrirCadastro(item, false);
  }

  onExcluir(item: MarcaListaItem): void {
    this.toast.show(`Exclusão de «${item.nome}» em breve.`);
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

  filtrados(): MarcaListaItem[] {
    const q = this.normalizar(this.busca);
    let list = this.itens.slice();
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

  paginaItens(): MarcaListaItem[] {
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

  rotuloItens(n: number): string {
    if (n <= 0) return 'Nenhum item associado';
    if (n === 1) return 'Possui um item associado';
    return `Possui ${n} itens associados`;
  }

  estaSelecionado(id: string): boolean {
    return this.selecionados.has(id);
  }

  toggleSelecionado(item: MarcaListaItem, ev: Event): void {
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
    if (this.cadastroAberto) {
      ev.preventDefault();
      this.fecharCadastro();
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
