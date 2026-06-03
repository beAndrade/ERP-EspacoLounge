import {
  Component,
  Input,
  OnChanges,
  OnInit,
  SimpleChanges,
  inject,
  signal,
} from '@angular/core';
import { FormsModule } from '@angular/forms';
import type { FinFormaPagamentoCadastroItem } from '../../../../core/models/api.models';
import { SheetsApiService } from '../../../../core/services/sheets-api.service';
import { AppToastService } from '../../../../shared/app-toast/app-toast.service';
import { UiTipTriggerComponent } from '../../../../shared/ui-tip-trigger/ui-tip-trigger.component';
import { FinCadastroDrawerComponent } from './fin-cadastro-drawer.component';

const FORMA_SALVA_TOAST_MSG = 'Forma de pagamento salva com sucesso!';
const FORMA_EXCLUIDA_TOAST_MSG = 'Forma de pagamento excluída com sucesso!';

@Component({
  selector: 'app-fin-cadastros-formas-tab',
  standalone: true,
  imports: [FormsModule, UiTipTriggerComponent, FinCadastroDrawerComponent],
  templateUrl: './fin-cadastros-formas-tab.component.html',
  styleUrl: './fin-cadastros-formas-tab.component.scss',
})
export class FinCadastrosFormasTabComponent implements OnInit, OnChanges {
  private readonly api = inject(SheetsApiService);
  private readonly toast = inject(AppToastService);

  @Input() busca = '';
  @Input() filtroAtivada = true;
  @Input() filtroDesativada = false;

  readonly carregando = signal(false);
  readonly erro = signal('');
  linhas: FinFormaPagamentoCadastroItem[] = [];
  pagina = 1;
  itensPorPagina = 20;
  readonly opcoesItensPorPagina = [10, 20, 50];
  perPageMenuAberto = false;

  drawerAberto = false;
  drawerTitulo = 'Nova forma de pagamento';
  drawerNome = '';
  drawerTaxaPercentual = 0;
  drawerTaxaFixa = 0;
  drawerPrazoRecebimento = 0;
  drawerBaixaAutomatica = false;
  drawerAtivo = true;
  editando: FinFormaPagamentoCadastroItem | null = null;
  readonly drawerSalvando = signal(false);
  exclusaoModalRow: FinFormaPagamentoCadastroItem | null = null;
  exclusaoModalSalvando = false;
  drawerAbertoShell = false;
  drawerPanelOpen = false;
  private drawerCloseTimer: ReturnType<typeof setTimeout> | null = null;
  private readonly selecionados = signal<ReadonlySet<number>>(new Set());

  ngOnInit(): void {
    this.carregar();
  }

  ngOnChanges(changes: SimpleChanges): void {
    if (
      (changes['filtroAtivada'] && !changes['filtroAtivada'].firstChange) ||
      (changes['filtroDesativada'] && !changes['filtroDesativada'].firstChange)
    ) {
      this.pagina = 1;
      this.carregar();
    }
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
    this.api.listFinFormasPagamento(this.filtroDesativada).subscribe({
      next: (items) => {
        this.linhas = items;
        this.selecionados.set(new Set());
        this.carregando.set(false);
        this.pagina = 1;
      },
      error: (e: Error) => {
        this.carregando.set(false);
        this.erro.set(e.message || 'Não foi possível carregar formas de pagamento.');
      },
    });
  }

  linhasFiltradas(): FinFormaPagamentoCadastroItem[] {
    let list = this.linhas;
    if (this.filtroAtivada && !this.filtroDesativada) {
      list = list.filter((r) => r.ativo);
    } else if (!this.filtroAtivada && this.filtroDesativada) {
      list = list.filter((r) => !r.ativo);
    } else if (!this.filtroAtivada && !this.filtroDesativada) {
      list = [];
    }
    const q = this.busca.trim().toLowerCase();
    if (!q) return list;
    return list.filter((r) => r.nome.toLowerCase().includes(q));
  }

  linhasPagina(): FinFormaPagamentoCadastroItem[] {
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

  abrirNovo(): void {
    this.editando = null;
    this.drawerTitulo = 'Forma de pagamento';
    this.drawerNome = '';
    this.drawerTaxaPercentual = 0;
    this.drawerTaxaFixa = 0;
    this.drawerPrazoRecebimento = 0;
    this.drawerBaixaAutomatica = false;
    this.drawerAtivo = true;
    this.abrirDrawerAnimado();
  }

  abrirEditar(row: FinFormaPagamentoCadastroItem): void {
    this.editando = row;
    this.drawerTitulo = 'Forma de pagamento';
    this.drawerNome = row.nome;
    this.drawerTaxaPercentual = row.taxa_percentual ?? 0;
    this.drawerTaxaFixa = row.taxa_fixa ?? 0;
    this.drawerPrazoRecebimento = row.prazo_recebimento ?? 0;
    this.drawerBaixaAutomatica = row.baixa_automatica === true;
    this.drawerAtivo = row.ativo !== false;
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
    taxa_percentual?: number;
    taxa_fixa?: number;
    prazo_recebimento?: number;
    baixa_automatica?: boolean;
    ativo?: boolean;
  }): void {
    this.drawerSalvando.set(true);
    const onOk = (): void => {
      this.drawerSalvando.set(false);
      this.fecharDrawer();
      this.toast.show(FORMA_SALVA_TOAST_MSG);
      this.carregar();
    };
    const onErr = (e: Error): void => {
      this.drawerSalvando.set(false);
      this.erro.set(e.message || 'Não foi possível salvar.');
    };
    if (this.editando) {
      this.api
        .atualizarFinFormaPagamento(this.editando.id, payload)
        .subscribe({ next: onOk, error: onErr });
      return;
    }
    this.api
      .criarFinFormaPagamento(payload)
      .subscribe({ next: onOk, error: onErr });
  }

  rotuloTaxa(row: FinFormaPagamentoCadastroItem): string {
    const parts: string[] = [];
    const pct = row.taxa_percentual ?? 0;
    const fixa = row.taxa_fixa ?? 0;
    if (pct > 0) {
      parts.push(
        `${pct.toLocaleString('pt-BR', {
          minimumFractionDigits: 0,
          maximumFractionDigits: 3,
        })}%`,
      );
    }
    if (fixa > 0) {
      parts.push(
        new Intl.NumberFormat('pt-BR', {
          style: 'currency',
          currency: 'BRL',
        }).format(fixa),
      );
    }
    return parts.length ? parts.join(' · ') : '—';
  }

  rotuloPrazo(row: FinFormaPagamentoCadastroItem): string {
    const dias = row.prazo_recebimento ?? 0;
    if (dias === 0) return 'Imediato';
    if (dias === 1) return '1 dia';
    return `${dias} dias`;
  }

  linhaSelecionada(id: number): boolean {
    return this.selecionados().has(id);
  }

  todosSelecionados(): boolean {
    const pag = this.linhasPagina();
    return pag.length > 0 && pag.every((r) => this.selecionados().has(r.id));
  }

  toggleLinha(id: number, ev: Event): void {
    const checked = (ev.target as HTMLInputElement).checked;
    this.selecionados.update((atual) => {
      const next = new Set(atual);
      if (checked) next.add(id);
      else next.delete(id);
      return next;
    });
  }

  toggleTodos(ev: Event): void {
    const checked = (ev.target as HTMLInputElement).checked;
    if (checked) {
      this.selecionados.update((atual) => {
        const next = new Set(atual);
        for (const r of this.linhasPagina()) next.add(r.id);
        return next;
      });
    } else {
      this.selecionados.update((atual) => {
        const next = new Set(atual);
        for (const r of this.linhasPagina()) next.delete(r.id);
        return next;
      });
    }
  }

  abrirModalExclusao(row: FinFormaPagamentoCadastroItem): void {
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
    this.api.excluirFinFormaPagamento(row.id).subscribe({
      next: () => {
        this.exclusaoModalSalvando = false;
        this.exclusaoModalRow = null;
        this.toast.show(FORMA_EXCLUIDA_TOAST_MSG);
        this.carregar();
      },
      error: (e: Error) => {
        this.exclusaoModalSalvando = false;
        this.exclusaoModalRow = null;
        this.toast.show(e.message || 'Não foi possível excluir.');
      },
    });
  }
}
