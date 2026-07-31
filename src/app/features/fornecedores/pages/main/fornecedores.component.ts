import {
  Component,
  HostListener,
  inject,
  OnDestroy,
  OnInit,
} from '@angular/core';
import { FormsModule } from '@angular/forms';
import { AppToastService } from '../../../../shared/app-toast/app-toast.service';
import { FornecedorCadastroDrawerService } from '../../../../shared/fornecedor-cadastro-drawer/fornecedor-cadastro-drawer.service';
import { UI_TIP_SHOW_DELAY_MS } from '../../../../shared/ui-tip-trigger/ui-tip-delay';
import { UiTipTriggerComponent } from '../../../../shared/ui-tip-trigger/ui-tip-trigger.component';
import { TableEmptyComponent } from '../../../../shared/table-empty/table-empty.component';

/** Item da lista de fornecedores (API futura). */
export interface FornecedorListaItem {
  id: number;
  nome: string;
  email?: string | null;
  telefone?: string | null;
  celular?: string | null;
  cnpj?: string | null;
}

type OrdenacaoNome = 'asc' | 'desc';

export type FornecedorColunaId = 'email' | 'telefone' | 'celular' | 'cnpj';

type FornecedorColunaOpcao = { id: FornecedorColunaId; label: string };

const FORNECEDORES_COLUNAS_STORAGE_KEY =
  'espacolounge.fornecedores.colunas-visiveis';

const FORNECEDORES_COLUNAS_IMPLEMENTADAS = new Set<FornecedorColunaId>([
  'email',
  'telefone',
  'celular',
  'cnpj',
]);

const FORNECEDORES_COLUNAS_PESOS: Record<'nome' | FornecedorColunaId, number> = {
  nome: 25,
  email: 20,
  telefone: 14,
  celular: 14,
  cnpj: 16,
};

const FORNECEDORES_COLUNAS_PADRAO: FornecedorColunaId[] = [
  'email',
  'telefone',
  'celular',
  'cnpj',
];

@Component({
  selector: 'app-fornecedores',
  standalone: true,
  imports: [
    TableEmptyComponent,
    FormsModule,
    UiTipTriggerComponent,
  ],
  templateUrl: './fornecedores.component.html',
  styleUrl: './fornecedores.component.scss',
})
export class FornecedoresComponent implements OnInit, OnDestroy {
  private readonly toast = inject(AppToastService);
  private readonly fornecedorDrawer = inject(FornecedorCadastroDrawerService);

  carregando = false;
  erro = '';
  itens: FornecedorListaItem[] = [];

  busca = '';
  buscaAberta = false;
  filtrosAbertos = false;
  pulsoToolbarBusca = false;
  pulsoToolbarFiltro = false;
  private readonly duracaoPulsoToolbarMs = 600;
  private tPulsoBusca = 0;
  private tPulsoFiltro = 0;

  filtroStatusAtivos = true;
  filtroStatusInativos = false;

  pagina = 1;
  itensPorPagina = 20;
  readonly opcoesItensPorPagina = [10, 20, 40, 50, 100];
  perPageMenuAberto = false;
  selecionados = new Set<number>();

  ordenacaoNome: OrdenacaoNome = 'asc';
  nomeSortTipVisivel = false;
  private nomeSortTipSuprimida = false;
  private nomeSortTipShowTimer: ReturnType<typeof setTimeout> | null = null;

  colunasMenuAberto = false;
  colunasMenuMontado = false;
  private colunasMenuAnimTimer: ReturnType<typeof setTimeout> | null = null;
  private readonly colunasMenuAnimMs = 200;
  readonly colunasOpcoes: FornecedorColunaOpcao[] = [
    { id: 'email', label: 'E-mail' },
    { id: 'telefone', label: 'Telefone' },
    { id: 'celular', label: 'Celular' },
    { id: 'cnpj', label: 'CNPJ' },
  ];
  colunasVisiveis = new Set<FornecedorColunaId>(FORNECEDORES_COLUNAS_PADRAO);

  ngOnInit(): void {
    this.carregarColunasSalvas();
    this.carregar();
  }

  ngOnDestroy(): void {
    this.clearNomeSortTipShowTimer();
    this.clearColunasMenuAnimTimer();
  }

  carregar(): void {
    this.carregando = true;
    this.erro = '';
    this.itens = [];
    this.carregando = false;
    this.pagina = 1;
    this.selecionados.clear();
  }

  get buscaPlaceholder(): string {
    return this.buscaAberta
      ? 'Buscar por nome, e-mail, telefone, CNPJ...'
      : '';
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
        document.getElementById('fornecedores-busca-input')?.focus();
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

  toggleFiltroStatus(which: 'ativos' | 'inativos', ev: Event): void {
    const checked = (ev.target as HTMLInputElement).checked;
    if (which === 'ativos') this.filtroStatusAtivos = checked;
    else this.filtroStatusInativos = checked;
    this.pagina = 1;
  }

  onNovo(): void {
    this.fornecedorDrawer.abrirNovo();
  }

  onAbrirFornecedor(f: FornecedorListaItem, ev?: Event): void {
    ev?.stopPropagation();
    this.toast.show(`Ficha de «${f.nome}» em breve.`);
  }

  onEditarFornecedor(f: FornecedorListaItem): void {
    this.toast.show(`Editar «${f.nome}» em breve.`);
  }

  onExcluirFornecedor(f: FornecedorListaItem): void {
    this.toast.show(`Excluir «${f.nome}» em breve.`);
  }

  onSortNomeMouseEnter(): void {
    if (this.nomeSortTipSuprimida) return;
    this.clearNomeSortTipShowTimer();
    this.nomeSortTipShowTimer = setTimeout(() => {
      this.nomeSortTipShowTimer = null;
      if (!this.nomeSortTipSuprimida) this.nomeSortTipVisivel = true;
    }, UI_TIP_SHOW_DELAY_MS);
  }

  onSortNomeMouseLeave(): void {
    this.clearNomeSortTipShowTimer();
    this.nomeSortTipVisivel = false;
    this.nomeSortTipSuprimida = false;
  }

  private clearNomeSortTipShowTimer(): void {
    if (this.nomeSortTipShowTimer != null) {
      clearTimeout(this.nomeSortTipShowTimer);
      this.nomeSortTipShowTimer = null;
    }
  }

  onOrdenarNomeClick(event: MouseEvent): void {
    this.clearNomeSortTipShowTimer();
    this.ordenacaoNome = this.ordenacaoNome === 'asc' ? 'desc' : 'asc';
    this.pagina = 1;
    this.nomeSortTipVisivel = false;
    this.nomeSortTipSuprimida = true;
    (event.currentTarget as HTMLButtonElement | null)?.blur();
  }

  tooltipOrdenacaoNome(): string {
    return this.ordenacaoNome === 'asc'
      ? 'Clique organiza por descendente'
      : 'Clique organiza por ascendente';
  }

  filtrados(): FornecedorListaItem[] {
    const q = this.busca.trim().toLowerCase();
    let list = this.itens.slice();
    if (q) {
      list = list.filter((f) => {
        const campos = [f.nome, f.email, f.telefone, f.celular, f.cnpj].map(
          (x) =>
            String(x ?? '')
              .trim()
              .toLowerCase(),
        );
        return campos.some((c) => c.includes(q));
      });
    }
    const dir = this.ordenacaoNome === 'asc' ? 1 : -1;
    return list.slice().sort((a, b) => {
      const cmp = (a.nome ?? '').localeCompare(b.nome ?? '', 'pt-BR', {
        sensitivity: 'base',
      });
      return cmp * dir;
    });
  }

  totalFiltrado(): number {
    return this.filtrados().length;
  }

  itensPagina(): FornecedorListaItem[] {
    const all = this.filtrados();
    const start = (this.pagina - 1) * this.itensPorPagina;
    return all.slice(start, start + this.itensPorPagina);
  }

  totalPaginas(): number {
    const n = this.totalFiltrado();
    return Math.max(1, Math.ceil(n / this.itensPorPagina));
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

  toggleSelecionado(f: FornecedorListaItem, ev: Event): void {
    const checked = (ev.target as HTMLInputElement).checked;
    if (checked) this.selecionados.add(f.id);
    else this.selecionados.delete(f.id);
  }

  todosDaPaginaSelecionados(): boolean {
    const page = this.itensPagina();
    return page.length > 0 && page.every((f) => this.selecionados.has(f.id));
  }

  toggleSelecionarTodos(ev: Event): void {
    const checked = (ev.target as HTMLInputElement).checked;
    for (const f of this.itensPagina()) {
      if (checked) this.selecionados.add(f.id);
      else this.selecionados.delete(f.id);
    }
  }

  exibirTexto(v: string | null | undefined): string {
    return String(v ?? '').trim();
  }

  colunaVisivel(id: FornecedorColunaId): boolean {
    return this.colunasVisiveis.has(id);
  }

  larguraColunaFlex(id: 'nome' | FornecedorColunaId): string {
    let total = FORNECEDORES_COLUNAS_PESOS.nome;
    for (const colId of FORNECEDORES_COLUNAS_IMPLEMENTADAS) {
      if (this.colunasVisiveis.has(colId)) {
        total += FORNECEDORES_COLUNAS_PESOS[colId];
      }
    }
    if (total <= 0) return '0%';
    const pct = (FORNECEDORES_COLUNAS_PESOS[id] / total) * 100;
    return `${pct.toFixed(4)}%`;
  }

  totalColunasTabela(): number {
    let visiveisImplementadas = 0;
    for (const id of this.colunasVisiveis) {
      if (FORNECEDORES_COLUNAS_IMPLEMENTADAS.has(id)) visiveisImplementadas += 1;
    }
    return 2 + visiveisImplementadas + 1;
  }

  toggleColunasMenu(ev: Event): void {
    ev.stopPropagation();
    if (this.colunasMenuAberto) this.fecharColunasMenu();
    else this.abrirColunasMenu();
  }

  abrirColunasMenu(): void {
    this.clearColunasMenuAnimTimer();
    this.colunasMenuMontado = true;
    requestAnimationFrame(() => {
      requestAnimationFrame(() => {
        this.colunasMenuAberto = true;
      });
    });
  }

  fecharColunasMenu(): void {
    if (!this.colunasMenuMontado) return;
    this.colunasMenuAberto = false;
    this.clearColunasMenuAnimTimer();
    this.colunasMenuAnimTimer = setTimeout(() => {
      this.colunasMenuMontado = false;
      this.colunasMenuAnimTimer = null;
    }, this.colunasMenuAnimMs);
  }

  private clearColunasMenuAnimTimer(): void {
    if (this.colunasMenuAnimTimer != null) {
      clearTimeout(this.colunasMenuAnimTimer);
      this.colunasMenuAnimTimer = null;
    }
  }

  toggleColuna(id: FornecedorColunaId, ev: Event): void {
    const checked = (ev.target as HTMLInputElement).checked;
    if (checked) this.colunasVisiveis.add(id);
    else this.colunasVisiveis.delete(id);
    this.colunasVisiveis = new Set(this.colunasVisiveis);
    this.salvarColunas();
    this.fecharColunasMenu();
  }

  restaurarColunasPadrao(): void {
    this.colunasVisiveis = new Set(FORNECEDORES_COLUNAS_PADRAO);
    this.salvarColunas();
  }

  private carregarColunasSalvas(): void {
    try {
      const raw = localStorage.getItem(FORNECEDORES_COLUNAS_STORAGE_KEY);
      if (!raw) return;
      const parsed = JSON.parse(raw) as unknown;
      if (!Array.isArray(parsed)) return;
      const valid = new Set(this.colunasOpcoes.map((c) => c.id));
      const next = parsed.filter(
        (x): x is FornecedorColunaId =>
          typeof x === 'string' && valid.has(x as FornecedorColunaId),
      );
      if (next.length > 0) this.colunasVisiveis = new Set(next);
    } catch {
      /* ignore */
    }
  }

  private salvarColunas(): void {
    try {
      localStorage.setItem(
        FORNECEDORES_COLUNAS_STORAGE_KEY,
        JSON.stringify([...this.colunasVisiveis]),
      );
    } catch {
      /* ignore */
    }
  }

  @HostListener('document:keydown.escape', ['$event'])
  onEscape(ev: KeyboardEvent): void {
    if (this.colunasMenuAberto || this.colunasMenuMontado) {
      ev.preventDefault();
      this.fecharColunasMenu();
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
    if (
      (this.colunasMenuAberto || this.colunasMenuMontado) &&
      t &&
      !t.closest('.fornecedores-th-acoes-wrap')
    ) {
      this.fecharColunasMenu();
    }
  }
}
