import {
  Component,
  DestroyRef,
  Input,
  OnInit,
  inject,
  output,
} from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { FormControl } from '@angular/forms';
import { AtendimentoListaItem, Cliente } from '../../core/models/api.models';
import { SheetsApiService } from '../../core/services/sheets-api.service';
import { contagensSidebarParaCliente } from '../../core/utils/comanda-status.util';
import {
  SaasSelectComponent,
  type SaasSelectOption,
} from './saas-select.component';
import {
  Observable,
  Subject,
  catchError,
  distinctUntilChanged,
  map,
  merge,
  of,
  shareReplay,
  startWith,
  switchMap,
  tap,
} from 'rxjs';

@Component({
  selector: 'app-agenda-novo-client-sidebar',
  standalone: true,
  imports: [SaasSelectComponent],
  templateUrl: './agenda-novo-client-sidebar.component.html',
  styleUrl: './agenda-novo-client-sidebar.component.scss',
})
export class AgendaNovoClientSidebarComponent implements OnInit {
  @Input({ required: true }) clienteIdControl!: FormControl;
  @Input() opcoesClientes: SaasSelectOption[] = [];
  @Input() cliente: Cliente | null = null;

  /**
   * Ex.: campo «Aniversário» na secção Informações — abrir cadastro do cliente (drawer / lista).
   */
  readonly abrirCadastroCliente = output<void>();

  private readonly api = inject(SheetsApiService);
  private readonly destroyRef = inject(DestroyRef);

  /** Força novo GET `/api/atendimentos` para contagens e badge «cliente novo». */
  private readonly contagensRefresh$ = new Subject<void>();

  private readonly listaAgendamentosAtual$: Observable<AtendimentoListaItem[]> =
    this.contagensRefresh$.pipe(
      startWith(undefined),
      switchMap(() =>
        this.api.listAgendamentos().pipe(catchError(() => of([]))),
      ),
      shareReplay({ bufferSize: 1, refCount: false }),
    );

  private readonly clientesComHistorico$: Observable<ReadonlySet<string>> =
    this.listaAgendamentosAtual$.pipe(
      map((rows) => {
        const set = new Set<string>();
        for (const r of rows) {
          const id = String(r.idCliente ?? '').trim();
          if (id) set.add(id);
        }
        return set;
      }),
    );

  mostrarBadgeClienteNovo = false;
  comandasPendenteCount = 0;
  pagamentosAtrasadosCount = 0;

  /**
   * Chamar após gravar/faturar comanda para actualizar «comandas / pagamentos em aberto».
   */
  refreshContagens(): void {
    this.contagensRefresh$.next();
  }

  ngOnInit(): void {
    const clienteId$ = merge(
      of(String(this.clienteIdControl.value ?? '').trim()),
      this.clienteIdControl.valueChanges.pipe(
        map((v) => String(v ?? '').trim()),
      ),
    ).pipe(distinctUntilChanged());

    clienteId$
      .pipe(
        tap((cid) => {
          if (!cid) this.mostrarBadgeClienteNovo = false;
        }),
        switchMap((cid) => {
          if (!cid) return of(false);
          return this.clienteTemHistoricoAtendimentos$(cid).pipe(
            map((tem) => !tem),
          );
        }),
        takeUntilDestroyed(this.destroyRef),
      )
      .subscribe((mostrar) => {
        this.mostrarBadgeClienteNovo = mostrar;
      });

    clienteId$
      .pipe(
        switchMap((cid) =>
          this.listaAgendamentosAtual$.pipe(
            map((items) => contagensSidebarParaCliente(cid, items)),
          ),
        ),
        takeUntilDestroyed(this.destroyRef),
      )
      .subscribe(({ comandasPendente, pagamentosAtrasados }) => {
        this.comandasPendenteCount = comandasPendente;
        this.pagamentosAtrasadosCount = pagamentosAtrasados;
      });
  }

  textoComandasEmAberto(): string {
    const n = this.comandasPendenteCount;
    return n === 1
      ? '1 comanda em aberto'
      : `${n} comandas em aberto`;
  }

  textoPagamentosEmAberto(): string {
    const n = this.pagamentosAtrasadosCount;
    return n === 1
      ? '1 pagamento em aberto'
      : `${n} pagamentos em aberto`;
  }

  destacarComandasEmAberto(): boolean {
    return this.comandasPendenteCount > 0;
  }

  destacarPagamentosEmAberto(): boolean {
    return this.pagamentosAtrasadosCount > 0;
  }

  private clienteTemHistoricoAtendimentos$(clienteId: string): Observable<boolean> {
    const cid = String(clienteId ?? '').trim();
    if (!cid) return of(false);
    return this.clientesComHistorico$.pipe(map((set) => set.has(cid)));
  }

  iniciaisAvatar(): string {
    const t = (this.cliente?.nome ?? '').trim();
    if (!t) return '';
    const parts = t.split(/\s+/).filter(Boolean);
    if (parts.length === 1) {
      return parts[0].slice(0, 2).toUpperCase();
    }
    const a = parts[0][0] ?? '';
    const b = parts[parts.length - 1][0] ?? '';
    return (a + b).toUpperCase() || '';
  }

  telefoneExibicao(): string {
    const t = (this.cliente?.telefone ?? '').trim();
    return t || 'Sem telefone';
  }

  get temClienteSelecionado(): boolean {
    return (
      this.cliente != null &&
      String(this.clienteIdControl?.value ?? '').trim() !== ''
    );
  }

  clicouAbrirCadastroAniversario(): void {
    if (!this.temClienteSelecionado) return;
    this.abrirCadastroCliente.emit();
  }

  linhaCreditoClienteExibicao(): string {
    const n = Number(this.cliente?.creditoSaldo ?? 0);
    const x = Number.isFinite(n) ? Math.round(n * 100) / 100 : 0;
    const brl = new Intl.NumberFormat('pt-BR', {
      style: 'currency',
      currency: 'BRL',
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    }).format(x);
    return `${brl} em crédito`;
  }
}
