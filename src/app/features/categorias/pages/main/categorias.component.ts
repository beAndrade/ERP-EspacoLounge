import { Component, HostListener, OnInit, inject } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { forkJoin } from 'rxjs';
import { SheetsApiService } from '../../../../core/services/sheets-api.service';
import { AppToastService } from '../../../../shared/app-toast/app-toast.service';
import { lerServicoTexto } from '../../../../core/utils/servico-campos';

export interface CategoriaListaItem {
  id: string;
  nome: string;
  qtdItens: number;
}

@Component({
  selector: 'app-categorias',
  standalone: true,
  imports: [FormsModule],
  templateUrl: './categorias.component.html',
  styleUrl: './categorias.component.scss',
})
export class CategoriasComponent implements OnInit {
  private readonly api = inject(SheetsApiService);
  private readonly toast = inject(AppToastService);

  carregando = false;
  erro = '';
  itens: CategoriaListaItem[] = [];

  busca = '';
  buscaAberta = false;
  filtrosAbertos = false;
  pulsoToolbarBusca = false;

  pagina = 1;
  porPagina = 20;
  readonly opcoesPorPagina = [10, 20, 50];
  selecionados = new Set<string>();

  ordenacaoColuna: 'nome' | 'itens' = 'nome';
  ordenacaoDir: 'asc' | 'desc' = 'asc';

  ngOnInit(): void {
    this.carregar();
  }

  get buscaPlaceholder(): string {
    return this.buscaAberta ? 'Buscar categorias…' : '';
  }

  carregar(): void {
    this.carregando = true;
    this.erro = '';
    forkJoin({
      produtos: this.api.listProdutos(),
      servicos: this.api.listServicos(),
    }).subscribe({
      next: ({ produtos, servicos }) => {
        const counts = new Map<string, number>();
        this.labelByKey.clear();
        const bump = (raw: string | null | undefined) => {
          const nome = String(raw ?? '').trim();
          if (!nome) return;
          const key = nome.toLocaleLowerCase('pt-BR');
          counts.set(key, (counts.get(key) ?? 0) + 1);
          if (!this.labelByKey.has(key)) this.labelByKey.set(key, nome);
        };
        for (const p of produtos) bump(p.categoria);
        for (const s of servicos) bump(lerServicoTexto(s, 'Categoria'));

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
          e.message || 'Não foi possível carregar categorias. Tente novamente.';
        this.carregando = false;
      },
    });
  }

  private readonly labelByKey = new Map<string, string>();

  onBuscaWrapClick(): void {
    if (!this.buscaAberta) {
      this.pulsoToolbarBusca = true;
      window.setTimeout(() => (this.pulsoToolbarBusca = false), 600);
      this.buscaAberta = true;
      queueMicrotask(() =>
        document.getElementById('categorias-busca-input')?.focus(),
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
    this.toast.show('Cadastro de categorias em breve.');
  }

  onEditar(item: CategoriaListaItem): void {
    this.toast.show(`Edição de «${item.nome}» em breve.`);
  }

  onExcluir(item: CategoriaListaItem): void {
    this.toast.show(`Exclusão de «${item.nome}» em breve.`);
  }

  onOrdenarColuna(col: 'nome' | 'itens', ev?: Event): void {
    ev?.stopPropagation();
    if (this.ordenacaoColuna === col) {
      this.ordenacaoDir = this.ordenacaoDir === 'asc' ? 'desc' : 'asc';
    } else {
      this.ordenacaoColuna = col;
      this.ordenacaoDir = 'asc';
    }
    this.pagina = 1;
  }

  tooltipOrdenacao(col: 'nome' | 'itens'): string {
    if (this.ordenacaoColuna !== col) return 'clique para ordenar';
    return this.ordenacaoDir === 'asc' ? 'ascendente' : 'descendente';
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
    let list = this.itens.slice();
    if (q) {
      list = list.filter((i) => this.normalizar(i.nome).includes(q));
    }
    const dir = this.ordenacaoDir === 'asc' ? 1 : -1;
    list.sort((a, b) => {
      if (this.ordenacaoColuna === 'itens') {
        return (a.qtdItens - b.qtdItens) * dir;
      }
      return a.nome.localeCompare(b.nome, 'pt-BR') * dir;
    });
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

  onPorPaginaChange(): void {
    this.pagina = 1;
  }

  rotuloItens(n: number): string {
    if (n <= 0) return 'Nenhum item associado';
    if (n === 1) return 'Possui um item associado';
    return `Possui ${n} itens associados`;
  }

  estaSelecionado(id: string): boolean {
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

  @HostListener('document:keydown.escape')
  onEscape(): void {
    if (this.filtrosAbertos) this.filtrosAbertos = false;
    else if (this.buscaAberta) this.buscaAberta = false;
  }

  @HostListener('document:click', ['$event'])
  onDocumentClick(ev: MouseEvent): void {
    const t = ev.target as HTMLElement | null;
    if (this.buscaAberta && !t?.closest?.('.list-head__busca-wrap')) {
      this.buscaAberta = false;
    }
  }
}
