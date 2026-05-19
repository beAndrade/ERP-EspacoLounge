import { Component, HostListener, inject, OnInit } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { SheetsApiService } from '../../core/services/sheets-api.service';
import { ProfissionalListaItem } from '../../core/models/api.models';

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

  aba: AbaProfissionais = 'ativos';
  busca = '';
  buscaAberta = false;
  pulsoToolbarBusca = false;
  private readonly duracaoPulsoToolbarMs = 600;
  private tPulsoBusca = 0;

  carregando = false;
  erro = '';
  salvando = false;
  erroForm = '';
  itens: ProfissionalListaItem[] = [];

  mostrarFormulario = false;
  editandoId: number | null = null;
  formNome = '';
  formAtivo = true;

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
    this.editandoId = null;
    this.formNome = '';
    this.formAtivo = this.aba === 'ativos';
    this.erroForm = '';
    this.mostrarFormulario = true;
  }

  abrirEditar(p: ProfissionalListaItem): void {
    this.editandoId = p.id;
    this.formNome = p.nome.trim();
    this.formAtivo = p.ativo !== false;
    this.erroForm = '';
    this.mostrarFormulario = true;
  }

  cancelarForm(): void {
    this.mostrarFormulario = false;
    this.editandoId = null;
    this.erroForm = '';
  }

  salvar(): void {
    const nome = this.formNome.trim();
    if (!nome) {
      this.erroForm = 'Nome é obrigatório.';
      return;
    }
    this.salvando = true;
    this.erroForm = '';
    if (this.editandoId == null) {
      this.api.createProfissional({ nome, ativo: this.formAtivo }).subscribe({
        next: () => {
          this.salvando = false;
          this.mostrarFormulario = false;
          this.carregar();
        },
        error: (e: Error) => {
          this.salvando = false;
          this.erroForm =
            e.message || 'Não foi possível guardar. Tente novamente.';
        },
      });
    } else {
      this.api
        .updateProfissional({
          id: this.editandoId,
          nome,
          ativo: this.formAtivo,
        })
        .subscribe({
          next: () => {
            this.salvando = false;
            this.mostrarFormulario = false;
            this.carregar();
          },
          error: (e: Error) => {
            this.salvando = false;
            this.erroForm =
              e.message || 'Não foi possível guardar. Tente novamente.';
          },
        });
    }
  }

  exibirCelular(_p: ProfissionalListaItem): string {
    return '—';
  }

  exibirEmail(_p: ProfissionalListaItem): string {
    return '—';
  }

  @HostListener('document:keydown.escape', ['$event'])
  onEscape(ev: KeyboardEvent): void {
    if (this.mostrarFormulario) {
      ev.preventDefault();
      if (!this.salvando) this.cancelarForm();
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
