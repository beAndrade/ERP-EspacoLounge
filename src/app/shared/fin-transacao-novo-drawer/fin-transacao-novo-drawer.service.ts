import { Injectable, inject } from '@angular/core';
import { Subject } from 'rxjs';
import { SheetsApiService } from '../../core/services/sheets-api.service';
import { AppToastService } from '../app-toast/app-toast.service';
import { DRAWER_ANIM_MS } from '../cliente-cadastro-drawer/cliente-cadastro-drawer.service';
import type {
  FinTransacaoNovoSubmit,
  FinTransacaoNovoTipo,
} from '../../features/financeiro/pages/transacoes/fin-transacao-novo-drawer.component';

export type FinNovoAtalhoTipo = FinTransacaoNovoTipo | 'transferencia';

/**
 * Drawer global «Novo recebimento / despesa / vale / transferência»
 * (atalhos do menu Novo da sidebar — sem mudar de rota).
 */
@Injectable({ providedIn: 'root' })
export class FinTransacaoNovoDrawerService {
  private readonly api = inject(SheetsApiService);
  private readonly toast = inject(AppToastService);

  /** Emitido após lançamento guardado com sucesso (para refrescar listas). */
  readonly salvo$ = new Subject<void>();

  aberto = false;
  panelOpen = false;
  tipo: FinNovoAtalhoTipo = 'receita';
  salvando = false;

  private closeTimer: ReturnType<typeof setTimeout> | null = null;
  private bodyScrollPreDrawer = 0;
  private pageScrollLockAtivo = false;

  get isTransferencia(): boolean {
    return this.tipo === 'transferencia';
  }

  get tipoFormulario(): FinTransacaoNovoTipo {
    return this.tipo === 'transferencia' ? 'despesa' : this.tipo;
  }

  get ariaLabel(): string {
    if (this.tipo === 'receita') return 'Novo recebimento';
    if (this.tipo === 'vale') return 'Novo vale';
    if (this.tipo === 'transferencia') return 'Nova transferência';
    return 'Nova despesa';
  }

  abrir(tipo: FinNovoAtalhoTipo): void {
    if (this.closeTimer != null) {
      clearTimeout(this.closeTimer);
      this.closeTimer = null;
    }
    this.tipo = tipo;
    this.salvando = false;
    this.aberto = true;
    this.bloquearScrollPagina();
    requestAnimationFrame(() => {
      requestAnimationFrame(() => {
        this.panelOpen = true;
      });
    });
  }

  fechar(): void {
    if (!this.aberto || this.salvando) return;
    this.panelOpen = false;
    if (this.closeTimer != null) clearTimeout(this.closeTimer);
    this.closeTimer = setTimeout(() => {
      this.closeTimer = null;
      this.aberto = false;
      this.desbloquearScrollPagina();
    }, DRAWER_ANIM_MS);
  }

  confirmar(ev: FinTransacaoNovoSubmit): void {
    if (this.tipo === 'transferencia') return;
    this.salvando = true;
    const done = (): void => {
      this.salvando = false;
      this.toast.show('Lançamento registado.');
      this.salvo$.next();
      this.fechar();
    };
    const fail = (e: Error): void => {
      this.salvando = false;
      this.toast.show(
        e.message || 'Não foi possível guardar o lançamento.',
      );
    };

    if (ev.tipo === 'receita') {
      this.api
        .createMovimentacao({
          data_mov: ev.data_mov,
          natureza: 'receita',
          valor: ev.valor,
          categoria_id: ev.categoria_id,
          descricao: ev.descricao,
          metodo_pagamento: ev.metodo_pagamento,
        })
        .subscribe({ next: () => done(), error: fail });
    } else {
      this.api
        .createDespesa({
          data_mov: ev.data_mov,
          valor: ev.valor,
          categoria_id: ev.categoria_id,
          descricao: ev.descricao,
          metodo_pagamento: ev.metodo_pagamento,
        })
        .subscribe({ next: () => done(), error: fail });
    }
  }

  private bloquearScrollPagina(): void {
    if (this.pageScrollLockAtivo) return;
    this.bodyScrollPreDrawer = window.scrollY || 0;
    const body = document.body;
    body.style.position = 'fixed';
    body.style.top = `-${this.bodyScrollPreDrawer}px`;
    body.style.left = '0';
    body.style.right = '0';
    body.style.width = '100%';
    this.pageScrollLockAtivo = true;
  }

  private desbloquearScrollPagina(): void {
    if (!this.pageScrollLockAtivo) return;
    const body = document.body;
    body.style.position = '';
    body.style.top = '';
    body.style.left = '';
    body.style.right = '';
    body.style.width = '';
    this.pageScrollLockAtivo = false;
    window.scrollTo(0, this.bodyScrollPreDrawer);
  }
}
