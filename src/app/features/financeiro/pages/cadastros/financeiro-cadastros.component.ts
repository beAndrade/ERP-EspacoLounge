import {
  Component,
  HostListener,
  ViewChild,
  signal,
} from '@angular/core';
import { FormsModule } from '@angular/forms';
import { FinCadastrosCategoriasTabComponent } from './fin-cadastros-categorias-tab.component';
import { FinCadastrosFormasTabComponent } from './fin-cadastros-formas-tab.component';

type CadastroTab = 'categorias' | 'formas';

@Component({
  selector: 'app-financeiro-cadastros',
  standalone: true,
  imports: [
    FormsModule,
    FinCadastrosCategoriasTabComponent,
    FinCadastrosFormasTabComponent,
  ],
  templateUrl: './financeiro-cadastros.component.html',
  styleUrl: './financeiro-cadastros.component.scss',
})
export class FinanceiroCadastrosComponent {
  @ViewChild(FinCadastrosCategoriasTabComponent)
  private categoriasTab?: FinCadastrosCategoriasTabComponent;

  @ViewChild(FinCadastrosFormasTabComponent)
  private formasTab?: FinCadastrosFormasTabComponent;

  readonly tabAtiva = signal<CadastroTab>('categorias');

  readonly tabs: { id: CadastroTab; label: string }[] = [
    { id: 'formas', label: 'Formas de pagamento' },
    { id: 'categorias', label: 'Categorias' },
  ];

  busca = '';
  buscaAberta = false;
  filtrosAbertos = false;
  filtroAtivada = true;
  filtroDesativada = false;

  selecionarTab(id: CadastroTab): void {
    if (id !== 'formas') {
      this.filtrosAbertos = false;
    }
    this.tabAtiva.set(id);
  }

  get filtroStatusAtivo(): boolean {
    return !this.filtroAtivada || this.filtroDesativada;
  }

  get buscaPlaceholder(): string {
    return this.buscaAberta ? 'Procure por nome...' : '';
  }

  onBuscaWrapClick(): void {
    if (!this.buscaAberta) {
      this.abrirPainelBusca();
    }
  }

  fecharPainelBusca(): void {
    this.buscaAberta = false;
  }

  private abrirPainelBusca(): void {
    this.buscaAberta = true;
    queueMicrotask(() => {
      document.getElementById('fin-cad-busca')?.focus();
    });
  }

  onBuscaSubmit(): void {
    const el = document.getElementById('fin-cad-busca');
    if (el instanceof HTMLInputElement) {
      el.blur();
    }
  }

  onBuscaEnter(ev: Event): void {
    ev.preventDefault();
    this.onBuscaSubmit();
  }

  toggleFiltros(): void {
    this.filtrosAbertos = !this.filtrosAbertos;
  }

  fecharFiltros(): void {
    this.filtrosAbertos = false;
  }

  toggleFiltroAtivada(ev: Event): void {
    const checked = (ev.target as HTMLInputElement).checked;
    if (!checked && !this.filtroDesativada) {
      (ev.target as HTMLInputElement).checked = true;
      return;
    }
    this.filtroAtivada = checked;
    this.aplicarFiltroStatus();
  }

  toggleFiltroDesativada(ev: Event): void {
    const checked = (ev.target as HTMLInputElement).checked;
    if (!checked && !this.filtroAtivada) {
      (ev.target as HTMLInputElement).checked = true;
      return;
    }
    this.filtroDesativada = checked;
    this.aplicarFiltroStatus();
  }

  private aplicarFiltroStatus(): void {
    this.formasTab?.carregar();
  }

  abrirNovo(): void {
    this.tabAtivo()?.abrirNovo();
  }

  tabAtivo():
    | FinCadastrosCategoriasTabComponent
    | FinCadastrosFormasTabComponent
    | undefined {
    return this.tabAtiva() === 'categorias'
      ? this.categoriasTab
      : this.formasTab;
  }

  labelBuscaInput(): string {
    return this.tabAtiva() === 'categorias'
      ? 'Buscar categorias'
      : 'Buscar formas de pagamento';
  }

  @HostListener('document:click', ['$event'])
  fecharPainelPorClickFora(ev: MouseEvent): void {
    const t = ev.target as HTMLElement | null;
    if (this.buscaAberta && !t?.closest?.('.list-head__busca-wrap')) {
      this.fecharPainelBusca();
    }
    if (
      this.filtrosAbertos &&
      !t?.closest?.('.fin-transacoes-filtros') &&
      !t?.closest?.('.list-head__toolbar-btn')
    ) {
      this.fecharFiltros();
    }
  }

  @HostListener('document:keydown.escape', ['$event'])
  fecharPainelPorEscape(ev: KeyboardEvent): void {
    if (this.categoriasTab?.drawerAbertoShell) {
      ev.preventDefault();
      this.categoriasTab.fecharDrawer();
      return;
    }
    if (this.formasTab?.drawerAbertoShell) {
      ev.preventDefault();
      this.formasTab.fecharDrawer();
      return;
    }
    if (this.filtrosAbertos) {
      ev.preventDefault();
      this.fecharFiltros();
      return;
    }
    if (!this.buscaAberta) return;
    ev.preventDefault();
    this.fecharPainelBusca();
  }
}
