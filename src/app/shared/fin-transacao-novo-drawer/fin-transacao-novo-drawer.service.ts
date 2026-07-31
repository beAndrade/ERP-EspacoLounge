import { ApplicationRef, Injectable, inject } from '@angular/core';
import { Subject } from 'rxjs';
import { SheetsApiService } from '../../core/services/sheets-api.service';
import { AppToastService } from '../app-toast/app-toast.service';
import {
  DRAWER_ANIM_MS,
  beginDrawerCloseAnimation,
  runDrawerOpenAnimation,
  type DrawerOpenAnimHandle,
} from '../drawer-panel-anim';
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
  private readonly appRef = inject(ApplicationRef);

  /** Emitido após lançamento guardado com sucesso (para refrescar listas). */
  readonly salvo$ = new Subject<void>();

  aberto = false;
  panelOpen = false;
  tipo: FinNovoAtalhoTipo = 'receita';
  salvando = false;

  private closeTimer: ReturnType<typeof setTimeout> | null = null;
  private openAnim: DrawerOpenAnimHandle | null = null;
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
    this.openAnim?.cancel();
    this.tipo = tipo;
    this.salvando = false;
    this.aberto = true;
    this.bloquearScrollPagina();
    this.openAnim = runDrawerOpenAnimation({
      setPanelOpen: (open) => {
        this.panelOpen = open;
      },
      appRef: this.appRef,
      reflowSelector: '.fin-novo-global-drawer.app-drawer',
    });
  }

  fechar(): void {
    if (!this.aberto || this.salvando) return;
    this.openAnim?.cancel();
    this.openAnim = null;
    beginDrawerCloseAnimation({
      setPanelOpen: (open) => {
        this.panelOpen = open;
      },
      appRef: this.appRef,
    });
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

  private obterLarguraScrollbar(): number {
    return Math.max(0, window.innerWidth - document.documentElement.clientWidth);
  }

  private bloquearScrollPagina(): void {
    if (this.pageScrollLockAtivo) return;
    this.bodyScrollPreDrawer = window.scrollY || 0;
    const gutter = this.obterLarguraScrollbar();
    const body = document.body;
    body.style.position = 'fixed';
    body.style.top = `-${this.bodyScrollPreDrawer}px`;
    body.style.left = '0';
    body.style.right = '0';
    body.style.width = '100%';
    if (gutter > 0) {
      body.style.paddingRight = `${gutter}px`;
    }
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
    body.style.paddingRight = '';
    this.pageScrollLockAtivo = false;
    window.scrollTo(0, this.bodyScrollPreDrawer);
  }
}
