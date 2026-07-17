import { CurrencyPipe } from '@angular/common';
import { Component, HostListener, OnInit, inject } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { SheetsApiService } from '../../../../core/services/sheets-api.service';
import type { Servico } from '../../../../core/models/api.models';
import { valorMonetarioParaNumero } from '../../../../core/utils/atendimento-display';
import { ServicoCadastroDrawerService } from '../../../../shared/servico-cadastro-drawer/servico-cadastro-drawer.service';

@Component({
  selector: 'app-servicos',
  standalone: true,
  imports: [FormsModule, CurrencyPipe],
  templateUrl: './servicos.component.html',
  styleUrl: './servicos.component.scss',
})
export class ServicosComponent implements OnInit {
  private readonly api = inject(SheetsApiService);
  private readonly drawer = inject(ServicoCadastroDrawerService);

  carregando = false;
  erro = '';
  itens: Servico[] = [];

  busca = '';
  buscaAberta = false;
  buscaPlaceholder = 'Buscar serviços';
  pulsoToolbarBusca = false;

  filtrosAbertos = false;
  filtroTipo: '' | 'Fixo' | 'Tamanho' = '';
  filtroMostraSite: '' | 'sim' | 'nao' = '';
  filtroCategoria = '';

  pagina = 1;
  porPagina = 20;
  readonly opcoesPorPagina = [10, 20, 50];

  selecionados = new Set<string>();

  excluirModalAberto = false;
  excluindo = false;
  excluirAlvo: Servico | null = null;
  excluirErro = '';

  ngOnInit(): void {
    this.carregar();
  }

  carregar(): void {
    this.carregando = true;
    this.erro = '';
    this.api.listServicos().subscribe({
      next: (items) => {
        this.itens = items;
        this.carregando = false;
        this.pagina = 1;
        this.selecionados.clear();
      },
      error: (e: Error) => {
        this.erro =
          e.message || 'Não foi possível carregar serviços. Tente novamente.';
        this.carregando = false;
      },
    });
  }

  categoriasDisponiveis(): string[] {
    const set = new Set<string>();
    for (const s of this.itens) {
      const c = String(s['Categoria'] ?? '').trim();
      if (c) set.add(c);
    }
    return Array.from(set).sort((a, b) => a.localeCompare(b, 'pt-BR'));
  }

  filtrados(): Servico[] {
    const q = this.busca.trim().toLowerCase();
    return this.itens.filter((s) => {
      const nome = this.rotuloServico(s).toLowerCase();
      const cat = String(s['Categoria'] ?? '')
        .trim()
        .toLowerCase();
      if (q && !nome.includes(q) && !cat.includes(q)) return false;
      if (this.filtroTipo) {
        const t = String(s['Tipo'] ?? '')
          .trim()
          .toLowerCase();
        if (this.filtroTipo === 'Fixo' && t !== 'fixo') return false;
        if (this.filtroTipo === 'Tamanho' && t !== 'tamanho') return false;
      }
      if (this.filtroCategoria) {
        if (String(s['Categoria'] ?? '').trim() !== this.filtroCategoria) {
          return false;
        }
      }
      if (this.filtroMostraSite === 'sim' && s['mostra_no_site'] === false) {
        return false;
      }
      if (this.filtroMostraSite === 'nao' && s['mostra_no_site'] !== false) {
        return false;
      }
      return true;
    });
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

  onPorPaginaChange(): void {
    this.pagina = 1;
  }

  onBuscaWrapClick(): void {
    this.buscaAberta = true;
  }

  onBuscaInput(): void {
    this.pagina = 1;
  }

  @HostListener('document:click', ['$event'])
  onDocClick(ev: MouseEvent): void {
    const t = ev.target as HTMLElement | null;
    if (this.buscaAberta && !t?.closest?.('.list-head__busca-wrap')) {
      if (!this.busca.trim()) this.buscaAberta = false;
    }
  }

  abrirNovo(): void {
    this.drawer.abrirNovo({
      categorias: this.categoriasDisponiveis(),
      onSalvo: () => this.carregar(),
    });
  }

  abrirEditar(s: Servico): void {
    this.drawer.abrirEdicao(s, {
      categorias: this.categoriasDisponiveis(),
      onSalvo: () => this.carregar(),
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
    return String(s['Serviço'] ?? '').trim() || '—';
  }

  categoriaServico(s: Servico): string {
    return String(s['Categoria'] ?? '').trim() || '—';
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
    const pct = String(s['Comissão %'] ?? '').trim();
    if (pct) {
      const n = pct.replace('%', '').trim();
      return `% ${n}`;
    }
    const fixa = valorMonetarioParaNumero(s['Comissão Fixa']);
    if (fixa != null && fixa > 0) {
      return fixa.toLocaleString('pt-BR', {
        style: 'currency',
        currency: 'BRL',
      });
    }
    return '—';
  }

  duracaoExibicao(s: Servico): string {
    const m = Number(s['duracao_minutos'] ?? 30);
    if (!Number.isFinite(m) || m <= 0) return '—';
    const h = Math.floor(m / 60);
    const min = m % 60;
    return `${String(h).padStart(2, '0')}:${String(min).padStart(2, '0')}`;
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
    this.filtroTipo = '';
    this.filtroMostraSite = '';
    this.filtroCategoria = '';
    this.pagina = 1;
  }

  aplicarFiltros(): void {
    this.filtrosAbertos = false;
    this.pagina = 1;
  }
}
