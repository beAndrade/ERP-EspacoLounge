import {
  Component,
  HostListener,
  inject,
  LOCALE_ID,
  OnDestroy,
  OnInit,
} from '@angular/core';
import { CurrencyPipe } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { SheetsApiService } from '../../../../core/services/sheets-api.service';
import { Cliente } from '../../../../core/models/api.models';
import { ClienteCadastroDrawerService } from '../../../../shared/cliente-cadastro-drawer/cliente-cadastro-drawer.service';
import { ClienteAvatarComponent } from '../../../../shared/cliente-avatar/cliente-avatar.component';
import {
  formatarCpfBr,
  formatarDataDdMmYyyy,
} from '../../../../core/utils/br-document-masks';
import { parseFiltroDataDdMm } from '../../../../core/utils/atendimento-display';
import { UI_TIP_SHOW_DELAY_MS } from '../../../../shared/ui-tip-trigger/ui-tip-delay';

type OrdenacaoNome = 'asc' | 'desc';

@Component({
  selector: 'app-clientes',
  standalone: true,
  imports: [
    FormsModule,
    CurrencyPipe,
    ClienteAvatarComponent,
  ],
  templateUrl: './clientes.component.html',
  styleUrl: './clientes.component.scss',
  providers: [{ provide: LOCALE_ID, useValue: 'pt-BR' }],
})
export class ClientesComponent implements OnInit, OnDestroy {
  private readonly api = inject(SheetsApiService);
  private readonly cadastroDrawer = inject(ClienteCadastroDrawerService);

  carregando = false;
  erro = '';
  itens: Cliente[] = [];

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
  filtroComCelular = false;
  filtroSemCelular = false;
  filtroComDebito = false;
  filtroSemDebito = false;
  filtroAniversarioInicio = '';
  filtroAniversarioFim = '';
  filtroAvaliacaoMin = 0;

  readonly estrelasAvaliacao = [1, 2, 3, 4, 5] as const;

  pagina = 1;
  itensPorPagina = 20;
  readonly opcoesItensPorPagina = [10, 20, 40, 50, 100];
  perPageMenuAberto = false;

  ordenacaoNome: OrdenacaoNome = 'asc';
  /** Tooltip do cabeçalho Nome (só hover; suprimida após clique até sair da célula). */
  nomeSortTipVisivel = false;
  private nomeSortTipSuprimida = false;
  private nomeSortTipShowTimer: ReturnType<typeof setTimeout> | null = null;
  selecionados = new Set<string>();
  excluindoId: string | null = null;
  excluirModalAberto = false;
  clientePendenteExclusao: Cliente | null = null;
  excluindoClienteModal = false;

  ngOnInit(): void {
    this.carregar();
  }

  ngOnDestroy(): void {
    this.clearNomeSortTipShowTimer();
  }

  carregar(): void {
    this.carregando = true;
    this.erro = '';
    this.api.listClientes().subscribe({
      next: (items) => {
        this.itens = items ?? [];
        this.carregando = false;
        this.pagina = 1;
        this.selecionados.clear();
      },
      error: (e: Error) => {
        this.erro =
          e.message ||
          'Não foi possível carregar clientes. Tente novamente.';
        this.carregando = false;
      },
    });
  }

  get buscaPlaceholder(): string {
    return this.buscaAberta
      ? 'Buscar por nome, celular, e-mail, cpf...'
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
        document.getElementById('clientes-busca-input')?.focus();
      });
    }
  }

  onBuscaInput(): void {
    this.pagina = 1;
  }

  onBuscaEnter(ev: Event): void {
    ev.preventDefault();
    this.onBuscar();
  }

  onBuscar(): void {
    this.pagina = 1;
  }

  toggleFiltros(ev?: Event): void {
    ev?.stopPropagation();
    this.dispararPulsoToolbar('filtro');
    this.filtrosAbertos = !this.filtrosAbertos;
  }

  onLimparFiltros(): void {
    this.filtroStatusAtivos = true;
    this.filtroStatusInativos = false;
    this.filtroComCelular = false;
    this.filtroSemCelular = false;
    this.filtroComDebito = false;
    this.filtroSemDebito = false;
    this.filtroAniversarioInicio = '';
    this.filtroAniversarioFim = '';
    this.filtroAvaliacaoMin = 0;
    this.pagina = 1;
  }

  onAplicarFiltros(): void {
    this.pagina = 1;
  }

  toggleFiltroStatus(which: 'ativos' | 'inativos', ev: Event): void {
    const checked = (ev.target as HTMLInputElement).checked;
    if (which === 'ativos') this.filtroStatusAtivos = checked;
    else this.filtroStatusInativos = checked;
    this.pagina = 1;
  }

  toggleFiltroCelular(which: 'com' | 'sem', ev: Event): void {
    const checked = (ev.target as HTMLInputElement).checked;
    if (which === 'com') this.filtroComCelular = checked;
    else this.filtroSemCelular = checked;
    this.pagina = 1;
  }

  toggleFiltroDebito(which: 'com' | 'sem', ev: Event): void {
    const checked = (ev.target as HTMLInputElement).checked;
    if (which === 'com') this.filtroComDebito = checked;
    else this.filtroSemDebito = checked;
    this.pagina = 1;
  }

  onFiltroAniversarioInput(which: 'inicio' | 'fim', ev: Event): void {
    const v = formatarDataDdMmYyyy((ev.target as HTMLInputElement).value);
    if (which === 'inicio') this.filtroAniversarioInicio = v;
    else this.filtroAniversarioFim = v;
    this.pagina = 1;
  }

  definirFiltroAvaliacao(n: number): void {
    this.filtroAvaliacaoMin = this.filtroAvaliacaoMin === n ? 0 : n;
    this.pagina = 1;
  }

  onNovoCliente(): void {
    this.cadastroDrawer.abrirNovo('', {
      onSalvo: () => this.carregar(),
    });
  }

  onEditarCliente(c: Cliente): void {
    this.abrirPerfilCliente(c);
  }

  onExcluirCliente(c: Cliente): void {
    const id = c.id?.trim();
    if (!id || this.excluindoClienteModal) return;
    this.clientePendenteExclusao = c;
    this.excluirModalAberto = true;
  }

  fecharModalExcluirCliente(): void {
    if (this.excluindoClienteModal) return;
    this.excluirModalAberto = false;
    this.clientePendenteExclusao = null;
  }

  confirmarExcluirCliente(): void {
    const c = this.clientePendenteExclusao;
    const id = c?.id?.trim();
    if (!id || this.excluindoClienteModal) {
      this.fecharModalExcluirCliente();
      return;
    }
    this.excluindoId = id;
    this.excluindoClienteModal = true;
    this.erro = '';
    this.api.deleteCliente(id).subscribe({
      next: () => {
        this.excluindoId = null;
        this.excluindoClienteModal = false;
        this.excluirModalAberto = false;
        this.clientePendenteExclusao = null;
        this.selecionados.delete(id);
        if (this.cadastroDrawer.clienteId === id) {
          this.cadastroDrawer.fechar();
        }
        this.carregar();
      },
      error: (e: Error) => {
        this.excluindoId = null;
        this.excluindoClienteModal = false;
        this.erro =
          e.message || 'Não foi possível excluir o cliente. Tente novamente.';
      },
    });
  }

  abrirPerfilCliente(cliente: Cliente, ev?: Event): void {
    ev?.preventDefault();
    ev?.stopPropagation();
    const id = cliente.id?.trim();
    if (!id) return;

    this.cadastroDrawer.abrirEdicao(id, {
      nomeLista: cliente.nome?.trim() ?? '',
      fotoUrlInicial: cliente.fotoUrl,
      callbacks: {
        onSalvo: (c) => this.atualizarClienteNaLista(c),
        onClienteCarregado: (c) => this.atualizarClienteNaLista(c),
      },
    });
  }

  private atualizarClienteNaLista(c: Cliente): void {
    const id = c.id?.trim();
    if (!id) return;
    const ix = this.itens.findIndex((item) => item.id === id);
    if (ix >= 0) {
      const next = [...this.itens];
      next[ix] = c;
      this.itens = next;
    }
  }

  onSortNomeMouseEnter(): void {
    if (this.nomeSortTipSuprimida) return;
    this.clearNomeSortTipShowTimer();
    this.nomeSortTipShowTimer = setTimeout(() => {
      this.nomeSortTipShowTimer = null;
      if (!this.nomeSortTipSuprimida) {
        this.nomeSortTipVisivel = true;
      }
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

  /** Tooltip do cabeçalho Nome (próximo clique alterna a direção). */
  tooltipOrdenacaoNome(): string {
    return this.ordenacaoNome === 'asc'
      ? 'Clique organiza por descendente'
      : 'Clique organiza por ascendente';
  }

  comDadosValidos(): Cliente[] {
    return this.itens.filter((c) => Boolean(c.id?.trim() && c.nome?.trim()));
  }

  filtrados(): Cliente[] {
    let list = this.comDadosValidos();
    const q = this.busca.trim();
    if (q) {
      list = list.filter((c) => this.clienteMatchesBusca(c, q));
    }
    list = list.filter((c) => this.clienteMatchesFiltrosPainel(c));
    const dir = this.ordenacaoNome === 'asc' ? 1 : -1;
    return list.slice().sort((a, b) => {
      const cmp = (a.nome ?? '').localeCompare(b.nome ?? '', 'pt-BR', {
        sensitivity: 'base',
      });
      return cmp * dir;
    });
  }

  private clienteMatchesBusca(c: Cliente, qRaw: string): boolean {
    const q = this.normalizarTextoBusca(qRaw);
    if (!q) return true;

    const qDig = this.apenasDigitos(qRaw);
    const textos = [
      c.nome,
      c.apelido,
      c.email,
      c.cpf,
      c.cnpj,
      c.rg,
    ].map((x) => this.normalizarTextoBusca(String(x ?? '')));

    if (textos.some((t) => t.includes(q))) return true;

    if (qDig.length > 0) {
      const docs = [c.cpf, c.cnpj, c.rg].map((x) =>
        this.apenasDigitos(String(x ?? '')),
      );
      if (docs.some((d) => d.includes(qDig))) return true;

      const fones = [c.celular, c.telefone, c.telefoneFixo].map((x) =>
        this.apenasDigitos(String(x ?? '')),
      );
      if (fones.some((f) => f.length > 0 && f.includes(qDig))) return true;
    }

    return false;
  }

  private clienteMatchesFiltrosPainel(c: Cliente): boolean {
    if (!this.filtroStatusAtivos && !this.filtroStatusInativos) return false;
    if (this.filtroStatusInativos && !this.filtroStatusAtivos) {
      if (c.notificacoesAtivo !== false) return false;
    }

    const temCelular = this.clienteTemCelular(c);
    if (this.filtroComCelular && !temCelular) return false;
    if (this.filtroSemCelular && temCelular) return false;

    const temDebito = (c.creditoSaldo ?? 0) < -0.005;
    if (this.filtroComDebito && !temDebito) return false;
    if (this.filtroSemDebito && temDebito) return false;

    const ymd = this.aniversarioParaYmd(c.aniversario);
    const ini = parseFiltroDataDdMm(this.filtroAniversarioInicio);
    const fim = parseFiltroDataDdMm(this.filtroAniversarioFim);
    if (ini || fim) {
      if (!ymd) return false;
      if (ini && ymd < ini) return false;
      if (fim && ymd > fim) return false;
    }

    if (this.filtroAvaliacaoMin > 0) {
      return false;
    }

    return true;
  }

  private clienteTemCelular(c: Cliente): boolean {
    return [c.celular, c.telefone, c.telefoneFixo].some(
      (x) => this.apenasDigitos(String(x ?? '')).length >= 8,
    );
  }

  private aniversarioParaYmd(raw: string | null | undefined): string | null {
    const s = String(raw ?? '').trim();
    if (!s) return null;
    const ymd = parseFiltroDataDdMm(s);
    if (ymd) return ymd;
    const m = /^(\d{1,2})\/(\d{1,2})(?:\/(\d{2,4}))?$/.exec(s);
    if (!m) return null;
    const dd = m[1].padStart(2, '0');
    const mm = m[2].padStart(2, '0');
    return `2000-${mm}-${dd}`;
  }

  private normalizarTextoBusca(s: string): string {
    return s
      .trim()
      .toLowerCase()
      .normalize('NFD')
      .replace(/\p{M}/gu, '');
  }

  private apenasDigitos(s: string): string {
    return String(s ?? '').replace(/\D/g, '');
  }

  totalFiltrado(): number {
    return this.filtrados().length;
  }

  itensPagina(): Cliente[] {
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

  estaSelecionado(id: string): boolean {
    return this.selecionados.has(id);
  }

  toggleSelecionado(c: Cliente, ev: Event): void {
    const checked = (ev.target as HTMLInputElement).checked;
    if (checked) this.selecionados.add(c.id);
    else this.selecionados.delete(c.id);
  }

  todosDaPaginaSelecionados(): boolean {
    const page = this.itensPagina();
    return page.length > 0 && page.every((c) => this.selecionados.has(c.id));
  }

  toggleSelecionarTodos(ev: Event): void {
    const checked = (ev.target as HTMLInputElement).checked;
    for (const c of this.itensPagina()) {
      if (checked) this.selecionados.add(c.id);
      else this.selecionados.delete(c.id);
    }
  }

  exibirCelular(c: Cliente): string {
    const cel = String(c.celular ?? '').trim();
    const tel = String(c.telefoneFixo ?? c.telefone ?? '').trim();
    return cel || tel || '—';
  }

  exibirNascimento(c: Cliente): string {
    const a = String(c.aniversario ?? '').trim();
    return a || '—';
  }

  exibirCpf(c: Cliente): string {
    const raw = String(c.cpf ?? '').trim();
    if (!raw) return '—';
    const fmt = formatarCpfBr(raw);
    return fmt || raw;
  }

  creditoPositivo(c: Cliente): boolean {
    return (c.creditoSaldo ?? 0) > 0;
  }

  @HostListener('document:keydown.escape', ['$event'])
  onEscape(ev: KeyboardEvent): void {
    if (this.excluirModalAberto) {
      ev.preventDefault();
      if (!this.excluindoClienteModal) {
        this.fecharModalExcluirCliente();
      }
      return;
    }
    if (this.cadastroDrawer.isAberto) {
      // ESC da ficha/pilha: app-cliente-cadastro-drawer-host (um nível por vez).
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
