import { CurrencyPipe } from '@angular/common';
import { Component, DestroyRef, inject, signal } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { concatMap, EMPTY, from } from 'rxjs';
import { catchError, finalize } from 'rxjs/operators';
import { SheetsApiService } from '../../core/services/sheets-api.service';
import { telefoneBrDigitos } from '../../core/utils/telefone-br';
import { nomeClienteParaWhatsapp } from '../../core/utils/whatsapp-variaveis';
import type {
  ClienteComandaAbertaLinhaUi,
  ClienteDebitoLinhaUi,
} from '../../core/utils/comanda-status.util';
import type { WhatsappEnviarContexto } from '../../core/models/whatsapp.model';
import { AppToastService } from '../app-toast/app-toast.service';
import { WhatsappEnviarModalComponent } from '../whatsapp/whatsapp-enviar-modal.component';
import { ClienteCadastroDrawerService } from './cliente-cadastro-drawer.service';
import {
  ClientePagarDebitosModalComponent,
  type ClientePagarDebitosModalSubmit,
} from './cliente-pagar-debitos-modal.component';

@Component({
  selector: 'app-cliente-debitos-tab',
  standalone: true,
  imports: [
    CurrencyPipe,
    ClientePagarDebitosModalComponent,
    WhatsappEnviarModalComponent,
  ],
  templateUrl: './cliente-debitos-tab.component.html',
  styleUrl: './cliente-debitos-tab.component.scss',
})
export class ClienteDebitosTabComponent {
  readonly d = inject(ClienteCadastroDrawerService);
  private readonly api = inject(SheetsApiService);
  private readonly toast = inject(AppToastService);
  private readonly destroyRef = inject(DestroyRef);

  private readonly debitosSelecionados = signal<ReadonlySet<string>>(new Set());
  readonly modalPagarAberto = signal(false);
  readonly modalPagarSalvando = signal(false);
  readonly whatsappModalAberto = signal(false);
  readonly whatsappContexto = signal<WhatsappEnviarContexto | null>(null);

  readonly excluirComandaModalAberto = signal(false);
  readonly excluindoComanda = signal(false);
  readonly comandaPendenteExclusao =
    signal<ClienteComandaAbertaLinhaUi | null>(null);

  constructor() {
    this.d.escapeModalExclusaoComandaDebitos = () => {
      if (!this.excluirComandaModalAberto()) return false;
      this.fecharModalExcluirComanda();
      return true;
    };
    this.destroyRef.onDestroy(() => {
      if (this.d.escapeModalExclusaoComandaDebitos) {
        this.d.escapeModalExclusaoComandaDebitos = null;
      }
    });
  }

  formatarData(data: string): string {
    const ymd = String(data ?? '').trim().slice(0, 10);
    const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(ymd);
    if (!m) return data || '';
    return `${m[3]}/${m[2]}/${m[1]}`;
  }

  rotuloComanda(numero: number | null): string {
    return numero != null && numero > 0 ? `#${numero}` : '';
  }

  verComanda(idAtendimento: string): void {
    this.d.visualizarComandaAgendamento(idAtendimento);
  }

  /** Abre o drawer «Editando itens da comanda» (slide R→L). */
  editarComanda(row: ClienteComandaAbertaLinhaUi): void {
    const idAt = String(row.idAtendimento ?? '').trim();
    const ymd = String(row.dataYmd ?? '').trim().slice(0, 10);
    if (!idAt || !/^\d{4}-\d{2}-\d{2}$/.test(ymd)) return;
    this.d.editarAgendamentoHistorico(idAt, ymd);
  }

  pedirExcluirComanda(row: ClienteComandaAbertaLinhaUi): void {
    if (this.excluindoComanda()) return;
    this.comandaPendenteExclusao.set(row);
    this.excluirComandaModalAberto.set(true);
  }

  fecharModalExcluirComanda(): void {
    if (this.excluindoComanda()) return;
    this.excluirComandaModalAberto.set(false);
    this.comandaPendenteExclusao.set(null);
  }

  confirmarExcluirComanda(): void {
    const row = this.comandaPendenteExclusao();
    const idAt = String(row?.idAtendimento ?? '').trim();
    if (!idAt || this.excluindoComanda()) {
      this.fecharModalExcluirComanda();
      return;
    }
    this.excluindoComanda.set(true);
    this.api.excluirAtendimento(idAt).subscribe({
      next: () => {
        this.excluindoComanda.set(false);
        this.excluirComandaModalAberto.set(false);
        this.comandaPendenteExclusao.set(null);
        this.d.recarregarDebitosPainel();
        this.toast.show('Comanda excluída.');
      },
      error: (e: Error) => {
        this.excluindoComanda.set(false);
        this.toast.show(
          e.message || 'Não foi possível excluir. Tente novamente.',
        );
      },
    });
  }

  debitoSelecionado(idAtendimento: string): boolean {
    return this.debitosSelecionados().has(idAtendimento);
  }

  todosDebitosSelecionados(): boolean {
    const linhas = this.d.debitosLinhas;
    return (
      linhas.length > 0 &&
      linhas.every((r) => this.debitosSelecionados().has(r.idAtendimento))
    );
  }

  toggleDebito(idAtendimento: string, ev: Event): void {
    const checked = (ev.target as HTMLInputElement).checked;
    this.debitosSelecionados.update((atual) => {
      const next = new Set(atual);
      if (checked) next.add(idAtendimento);
      else next.delete(idAtendimento);
      return next;
    });
  }

  toggleSelecionarTodosDebitos(ev: Event): void {
    const checked = (ev.target as HTMLInputElement).checked;
    if (checked) {
      this.debitosSelecionados.set(
        new Set(this.d.debitosLinhas.map((r) => r.idAtendimento)),
      );
    } else {
      this.debitosSelecionados.set(new Set());
    }
  }

  temDebitosSelecionados(): boolean {
    return this.debitosSelecionados().size > 0;
  }

  totalDebitosSelecionados(): number {
    const sel = this.debitosSelecionados();
    let sum = 0;
    for (const row of this.d.debitosLinhas) {
      if (!sel.has(row.idAtendimento)) continue;
      const v = row.valorReais;
      if (Number.isFinite(v) && v > 0) sum += v;
    }
    return Math.round(sum * 100) / 100;
  }

  limparSelecaoDebitos(): void {
    this.debitosSelecionados.set(new Set());
  }

  pagarDebitosSelecionados(): void {
    if (!this.temDebitosSelecionados()) return;
    this.modalPagarAberto.set(true);
  }

  fecharModalPagar(): void {
    if (this.modalPagarSalvando()) return;
    this.modalPagarAberto.set(false);
  }

  confirmarModalPagar(payload: ClientePagarDebitosModalSubmit): void {
    if (this.modalPagarSalvando()) return;
    const sel = this.debitosSelecionados();
    const linhas = this.d.debitosLinhas.filter((r) => sel.has(r.idAtendimento));
    if (linhas.length === 0) {
      this.fecharModalPagar();
      return;
    }

    this.modalPagarSalvando.set(true);

    from(linhas)
      .pipe(
        concatMap((row) => {
          const valor = row.valorReais;
          if (!Number.isFinite(valor) || valor <= 0) return EMPTY;
          return this.api.faturarComanda(row.idAtendimento, {
            pagamentos: [
              {
                valor,
                metodo: payload.metodo,
                data_pagamento: payload.dataYmd,
              },
            ],
          });
        }),
        catchError(() => EMPTY),
        finalize(() => {
          this.modalPagarSalvando.set(false);
          this.modalPagarAberto.set(false);
          this.limparSelecaoDebitos();
          this.d.recarregarDebitosPainel();
        }),
        takeUntilDestroyed(this.destroyRef),
      )
      .subscribe();
  }

  abrirCalendarioPagar(ev: Event, input: HTMLInputElement): void {
    ev.preventDefault();
    ev.stopPropagation();
    const btn = ev.currentTarget;
    if (btn instanceof HTMLElement) {
      this.pulsarSwitch(btn);
    }
    const el = input as HTMLInputElement & { showPicker?: () => Promise<void> };
    if (typeof el.showPicker === 'function') {
      void Promise.resolve(el.showPicker()).catch(() => {
        input.focus();
        input.click();
      });
    } else {
      input.focus();
      input.click();
    }
  }

  private pulsarSwitch(el: HTMLElement): void {
    el.classList.remove('drawer-switch--pulse');
    void el.offsetWidth;
    el.classList.add('drawer-switch--pulse');
    window.setTimeout(() => el.classList.remove('drawer-switch--pulse'), 1500);
  }

  imprimirDebitos(): void {
    window.print();
  }

  enviarWhatsappDebito(row: ClienteDebitoLinhaUi): void {
    const cel = telefoneBrDigitos(this.d.cadastroCelular);
    const fixo = telefoneBrDigitos(this.d.cadastroTelefone);
    const digitos = cel.length >= 10 ? cel : fixo;
    if (digitos.length < 10) {
      this.toast.show('Cliente sem telefone válido para WhatsApp.');
      return;
    }
    const valor = new Intl.NumberFormat('pt-BR', {
      style: 'currency',
      currency: 'BRL',
    }).format(row.valorReais);

    this.whatsappContexto.set({
      telefone: digitos,
      clienteId: this.d.clienteId ?? undefined,
      clienteNome:
        nomeClienteParaWhatsapp({
          nome: this.d.cadastroNome,
          apelido: this.d.cadastroApelido,
        }) || undefined,
      idAtendimento: row.idAtendimento,
      templateCodigo: 'cobranca',
      variaveis: {
        cliente: nomeClienteParaWhatsapp({
          nome: this.d.cadastroNome,
          apelido: this.d.cadastroApelido,
        }),
        valor,
      },
    });
    this.whatsappModalAberto.set(true);
  }

  fecharWhatsappModal(): void {
    this.whatsappModalAberto.set(false);
  }
}
