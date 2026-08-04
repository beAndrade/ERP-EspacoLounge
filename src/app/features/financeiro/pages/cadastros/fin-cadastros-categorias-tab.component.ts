import {
  Component,
  HostListener,
  Input,
  OnChanges,
  OnInit,
  SimpleChanges,
  inject,
  signal,
} from '@angular/core';
import { FormsModule } from '@angular/forms';
import type { FinCategoriaCadastroItem } from '../../../../core/models/api.models';
import { SheetsApiService } from '../../../../core/services/sheets-api.service';
import { AppToastService } from '../../../../shared/app-toast/app-toast.service';
import { UiTipTriggerComponent } from '../../../../shared/ui-tip-trigger/ui-tip-trigger.component';
import { TableEmptyComponent } from '../../../../shared/table-empty/table-empty.component';
import { FinCadastroDrawerComponent } from './fin-cadastro-drawer.component';
import { FlipDropdownPanelDirective } from '../../../../shared/flip-dropdown-panel/flip-dropdown-panel.directive';

const CATEGORIA_SALVA_TOAST_MSG = 'Categoria salva com sucesso!';
const CATEGORIA_EXCLUIDA_TOAST_MSG = 'Categoria excluída com sucesso!';

@Component({
  selector: 'app-fin-cadastros-categorias-tab',
  standalone: true,
  imports: [
    FlipDropdownPanelDirective,TableEmptyComponent, FormsModule, UiTipTriggerComponent, FinCadastroDrawerComponent],
  templateUrl: './fin-cadastros-categorias-tab.component.html',
  styleUrl: './fin-cadastros-categorias-tab.component.scss',
})
export class FinCadastrosCategoriasTabComponent implements OnInit, OnChanges {
  private readonly api = inject(SheetsApiService);
  private readonly toast = inject(AppToastService);

  @Input() busca = '';

  readonly carregando = signal(false);
  readonly erro = signal('');
  linhas: FinCategoriaCadastroItem[] = [];
  pagina = 1;
  itensPorPagina = 20;
  readonly opcoesItensPorPagina = [10, 20, 50];
  perPageMenuAberto = false;

  drawerAberto = false;
  drawerTitulo = 'Categoria';
  drawerNome = '';
  drawerNatureza: 'receita' | 'despesa' = 'despesa';
  drawerNaturezaBloqueada = false;
  editando: FinCategoriaCadastroItem | null = null;
  readonly drawerSalvando = signal(false);
  exclusaoModalRow: FinCategoriaCadastroItem | null = null;
  exclusaoModalSalvando = false;
  drawerAbertoShell = false;
  drawerPanelOpen = false;
  private drawerCloseTimer: ReturnType<typeof setTimeout> | null = null;

  ngOnInit(): void {
    this.carregar();
  }

  ngOnChanges(changes: SimpleChanges): void {
    if (changes['busca']) {
      this.pagina = 1;
    }
  }

  resetPagina(): void {
    this.pagina = 1;
  }

  carregar(): void {
    this.carregando.set(true);
    this.erro.set('');
    this.api.listFinCategoriasCadastro(false).subscribe({
      next: (items) => {
        this.linhas = items;
        this.carregando.set(false);
        this.pagina = 1;
      },
      error: (e: Error) => {
        this.carregando.set(false);
        this.erro.set(e.message || 'Não foi possível carregar categorias.');
      },
    });
  }

  linhasFiltradas(): FinCategoriaCadastroItem[] {
    const list = this.linhas.filter((r) => r.ativo);
    const q = this.busca.trim().toLowerCase();
    if (!q) return list;
    return list.filter((r) => r.nome.toLowerCase().includes(q));
  }

  linhasPagina(): FinCategoriaCadastroItem[] {
    const all = this.linhasFiltradas();
    const start = (this.pagina - 1) * this.itensPorPagina;
    return all.slice(start, start + this.itensPorPagina);
  }

  totalExibido(): number {
    return this.linhasFiltradas().length;
  }

  get podePaginaAnterior(): boolean {
    return this.pagina > 1;
  }

  get podePaginaSeguinte(): boolean {
    return this.pagina * this.itensPorPagina < this.totalExibido();
  }

  paginaAnterior(): void {
    if (this.podePaginaAnterior) this.pagina--;
  }

  paginaSeguinte(): void {
    if (this.podePaginaSeguinte) this.pagina++;
  }

  togglePerPageMenu(ev?: Event): void {
    ev?.stopPropagation();
    this.perPageMenuAberto = !this.perPageMenuAberto;
  }

  selecionarItensPorPagina(n: number, ev?: Event): void {
    ev?.stopPropagation();
    this.itensPorPagina = n;
    this.pagina = 1;
    this.perPageMenuAberto = false;
  }

  abrirNovo(): void {
    this.editando = null;
    this.drawerTitulo = 'Categoria';
    this.drawerNome = '';
    this.drawerNatureza = 'despesa';
    this.drawerNaturezaBloqueada = false;
    this.abrirDrawerAnimado();
  }

  abrirEditar(row: FinCategoriaCadastroItem): void {
    this.editando = row;
    this.drawerTitulo = 'Categoria';
    this.drawerNome = row.nome;
    this.drawerNatureza = row.natureza;
    this.drawerNaturezaBloqueada = row.sistema;
    this.abrirDrawerAnimado();
  }

  private abrirDrawerAnimado(): void {
    if (this.drawerCloseTimer != null) {
      clearTimeout(this.drawerCloseTimer);
      this.drawerCloseTimer = null;
    }
    this.drawerAberto = true;
    this.drawerAbertoShell = true;
    this.drawerPanelOpen = false;
    queueMicrotask(() => {
      requestAnimationFrame(() => {
        requestAnimationFrame(() => {
          this.drawerPanelOpen = true;
        });
      });
    });
  }

  fecharDrawer(): void {
    if (this.drawerSalvando()) return;
    this.drawerPanelOpen = false;
    if (this.drawerCloseTimer != null) clearTimeout(this.drawerCloseTimer);
    this.drawerCloseTimer = setTimeout(() => {
      this.drawerAbertoShell = false;
      this.drawerAberto = false;
      this.editando = null;
      this.drawerCloseTimer = null;
    }, 430);
  }

  salvarDrawer(payload: {
    nome: string;
    natureza?: 'receita' | 'despesa';
  }): void {
    this.drawerSalvando.set(true);
    const onOk = (): void => {
      this.drawerSalvando.set(false);
      this.fecharDrawer();
      this.toast.show(CATEGORIA_SALVA_TOAST_MSG);
      this.carregar();
    };
    const onErr = (e: Error): void => {
      this.drawerSalvando.set(false);
      this.erro.set(e.message || 'Não foi possível salvar.');
    };
    if (this.editando) {
      this.api
        .atualizarFinCategoria(this.editando.id, payload)
        .subscribe({ next: onOk, error: onErr });
      return;
    }
    this.api
      .criarFinCategoria({
        nome: payload.nome,
        natureza: payload.natureza ?? 'despesa',
      })
      .subscribe({ next: onOk, error: onErr });
  }

  abrirModalExclusao(row: FinCategoriaCadastroItem): void {
    this.exclusaoModalRow = row;
  }

  fecharModalExclusao(): void {
    if (this.exclusaoModalSalvando) return;
    this.exclusaoModalRow = null;
  }

  confirmarModalExclusao(): void {
    const row = this.exclusaoModalRow;
    if (!row || this.exclusaoModalSalvando) return;
    this.exclusaoModalSalvando = true;
    this.erro.set('');
    this.api.excluirFinCategoria(row.id).subscribe({
      next: (res) => {
        this.exclusaoModalSalvando = false;
        this.exclusaoModalRow = null;
        this.toast.show(
          res.result === 'deactivated'
            ? 'Categoria desativada (já usada em movimentações).'
            : CATEGORIA_EXCLUIDA_TOAST_MSG,
        );
        this.carregar();
      },
      error: (e: Error) => {
        this.exclusaoModalSalvando = false;
        this.exclusaoModalRow = null;
        this.toast.show(e.message || 'Não foi possível excluir.');
      },
    });
  }

  rotuloNatureza(n: 'receita' | 'despesa'): string {
    return n === 'receita' ? 'Crédito' : 'Débito';
  }

  @HostListener('document:click', ['$event'])
  onDocumentClick(ev: MouseEvent): void {
    const t = ev.target as HTMLElement | null;
    if (this.perPageMenuAberto && !t?.closest?.('.list-footer__per-page')) {
      this.perPageMenuAberto = false;
    }
  }
}
