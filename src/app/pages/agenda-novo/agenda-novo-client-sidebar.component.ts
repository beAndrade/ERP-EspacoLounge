import { Component, DestroyRef, Input, OnInit, inject } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { FormControl } from '@angular/forms';
import { Cliente } from '../../core/models/api.models';
import { SheetsApiService } from '../../core/services/sheets-api.service';
import {
  SaasSelectComponent,
  type SaasSelectOption,
} from './saas-select.component';
import {
  Observable,
  catchError,
  defer,
  distinctUntilChanged,
  map,
  merge,
  of,
  shareReplay,
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

  private readonly api = inject(SheetsApiService);
  private readonly destroyRef = inject(DestroyRef);

  /** IDs de clientes com pelo menos um registo em Atendimentos (comanda/agendamento gravado). */
  private readonly clientesComHistorico$: Observable<ReadonlySet<string>> =
    defer(() =>
      this.api.listAgendamentos().pipe(
        catchError(() => of([])),
        map((rows) => {
          const set = new Set<string>();
          for (const r of rows) {
            const id = String(r.idCliente ?? '').trim();
            if (id) set.add(id);
          }
          return set;
        }),
      ),
    ).pipe(shareReplay({ bufferSize: 1, refCount: false }));

  mostrarBadgeClienteNovo = false;

  ngOnInit(): void {
    merge(
      of(String(this.clienteIdControl.value ?? '').trim()),
      this.clienteIdControl.valueChanges.pipe(
        map((v) => String(v ?? '').trim()),
      ),
    )
      .pipe(
        distinctUntilChanged(),
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
    return t || '—';
  }

  get temClienteSelecionado(): boolean {
    return (
      this.cliente != null &&
      String(this.clienteIdControl?.value ?? '').trim() !== ''
    );
  }
}
