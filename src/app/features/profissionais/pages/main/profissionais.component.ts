import { Component, HostListener, inject, OnInit } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { SheetsApiService } from '../../../../core/services/sheets-api.service';
import { ProfissionalListaItem } from '../../../../core/models/api.models';
import { formatarCelularBr } from '../../../../core/utils/telefone-br';
import { ProfissionalCadastroDrawerService } from '../../../../shared/profissional-cadastro-drawer/profissional-cadastro-drawer.service';

type AbaProfissionais = 'ativos' | 'inativos';

@Component({
  selector: 'app-profissionais',
  standalone: true,
  imports: [FormsModule],
  templateUrl: './profissionais.component.html',
  styleUrl: './profissionais.component.scss',
})
export class ProfissionaisComponent implements OnInit {
  private readonly api = inject(SheetsApiService);
  private readonly profissionalDrawer = inject(ProfissionalCadastroDrawerService);

  aba: AbaProfissionais = 'ativos';
  busca = '';
  buscaAberta = false;
  pulsoToolbarBusca = false;
  private readonly duracaoPulsoToolbarMs = 600;
  private tPulsoBusca = 0;

  carregando = false;
  erro = '';
  itens: ProfissionalListaItem[] = [];

  pagina = 1;
  itensPorPagina = 20;
  readonly opcoesItensPorPagina = [10, 20, 40, 50, 100];
  perPageMenuAberto = false;

  ngOnInit(): void {
    this.carregar();
  }

  carregar(): void {
    this.carregando = true;
    this.erro = '';
    this.api.listProfissionais(true).subscribe({
      next: (items) => {
        this.itens = items ?? [];
        this.carregando = false;
        this.pagina = 1;
      },
      error: (e: Error) => {
        this.erro =
          e.message ||
          'Não foi possível carregar profissionais. Tente novamente.';
        this.carregando = false;
      },
    });
  }

  definirAba(aba: AbaProfissionais): void {
    if (this.aba === aba) return;
    this.aba = aba;
    this.pagina = 1;
  }

  get buscaPlaceholder(): string {
    return this.buscaAberta ? 'Buscar por nome…' : '';
  }

  private dispararPulsoBusca(): void {
    window.clearTimeout(this.tPulsoBusca);
    this.pulsoToolbarBusca = false;
    queueMicrotask(() => {
      this.pulsoToolbarBusca = true;
      this.tPulsoBusca = window.setTimeout(() => {
        this.pulsoToolbarBusca = false;
      }, this.duracaoPulsoToolbarMs);
    });
  }

  fecharPainelBusca(): void {
    this.buscaAberta = false;
  }

  onBuscaWrapClick(): void {
    if (!this.buscaAberta) {
      this.dispararPulsoBusca();
      this.buscaAberta = true;
      queueMicrotask(() => {
        document.getElementById('profissionais-busca-input')?.focus();
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

  filtrados(): ProfissionalListaItem[] {
    const ativo = this.aba === 'ativos';
    let list = this.itens.filter(
      (p) =>
        Boolean(p.nome?.trim()) && (p.ativo !== false) === ativo,
    );
    const q = this.busca.trim().toLowerCase();
    if (q) {
      list = list.filter((p) => p.nome.toLowerCase().includes(q));
    }
    return list.slice().sort((a, b) =>
      a.nome.localeCompare(b.nome, 'pt-BR', { sensitivity: 'base' }),
    );
  }

  totalFiltrado(): number {
    return this.filtrados().length;
  }

  itensPagina(): ProfissionalListaItem[] {
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

  abrirNovo(): void {
    this.profissionalDrawer.abrirNovo({
      onSalvo: () => this.carregar(),
    });
  }

  abrirEditar(p: ProfissionalListaItem): void {
    this.profissionalDrawer.abrirEdicao(p.id, {
      onSalvo: () => this.carregar(),
    });
  }

  exibirCelular(p: ProfissionalListaItem): string {
    const f = formatarCelularBr(p.celular);
    return f || '—';
  }

  exibirEmail(_p: ProfissionalListaItem): string {
    return '—';
  }

  @HostListener('document:keydown.escape', ['$event'])
  onEscape(ev: KeyboardEvent): void {
    if (this.profissionalDrawer.aberto) {
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
