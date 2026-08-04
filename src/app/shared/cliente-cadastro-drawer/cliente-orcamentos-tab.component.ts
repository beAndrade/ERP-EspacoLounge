import { CurrencyPipe, registerLocaleData } from '@angular/common';
import localePt from '@angular/common/locales/pt';
import { Component, inject, LOCALE_ID, signal } from '@angular/core';
import { formataMoedaBrl } from '../../core/utils/brl-digit-input';
import { telefoneBrDigitos } from '../../core/utils/telefone-br';
import { nomeClienteParaWhatsapp } from '../../core/utils/whatsapp-variaveis';
import type { WhatsappEnviarContexto } from '../../core/models/whatsapp.model';
import { SheetsApiService } from '../../core/services/sheets-api.service';
import { AppToastService } from '../app-toast/app-toast.service';
import { ClienteDrawerPeriodoFiltroComponent } from '../cliente-drawer-periodo-filtro/cliente-drawer-periodo-filtro.component';
import { TableEmptyComponent } from '../table-empty/table-empty.component';
import { UiTipTriggerComponent } from '../ui-tip-trigger/ui-tip-trigger.component';
import { WhatsappEnviarModalComponent } from '../whatsapp/whatsapp-enviar-modal.component';
import { ClienteCadastroDrawerService } from './cliente-cadastro-drawer.service';
import type { ClienteOrcamentoHistoricoLinha } from './cliente-orcamentos.util';

registerLocaleData(localePt);

@Component({
  selector: 'app-cliente-orcamentos-tab',
  standalone: true,
  imports: [
    CurrencyPipe,
    ClienteDrawerPeriodoFiltroComponent,
    TableEmptyComponent,
    UiTipTriggerComponent,
    WhatsappEnviarModalComponent,
  ],
  providers: [{ provide: LOCALE_ID, useValue: 'pt-BR' }],
  templateUrl: './cliente-orcamentos-tab.component.html',
  styleUrl: './cliente-orcamentos-tab.component.scss',
})
export class ClienteOrcamentosTabComponent {
  readonly d = inject(ClienteCadastroDrawerService);
  private readonly api = inject(SheetsApiService);
  private readonly toast = inject(AppToastService);

  readonly whatsappModalAberto = signal(false);
  readonly whatsappContexto = signal<WhatsappEnviarContexto | null>(null);
  private whatsappLinha: ClienteOrcamentoHistoricoLinha | null = null;

  rotuloTicket(numero: number | null): string {
    if (typeof numero === 'number' && Number.isFinite(numero) && numero > 0) {
      return `#${numero}`;
    }
    return '—';
  }

  aplicarFiltroDatas(): void {
    this.d.aplicarFiltroOrcamentosHistorico();
  }

  editarOrcamento(row: ClienteOrcamentoHistoricoLinha): void {
    this.d.editarOrcamentoHistorico(row.idAtendimento, row.dataYmd);
  }

  converterOrcamento(row: ClienteOrcamentoHistoricoLinha): void {
    if (row.statusId === 'arquivado') return;
    this.d.converterOrcamentoHistorico(row.idAtendimento, row.dataYmd);
  }

  enviarWhatsapp(row: ClienteOrcamentoHistoricoLinha): void {
    const tel =
      this.d.cadastroCelular.trim() || this.d.cadastroTelefone.trim();
    if (!telefoneBrDigitos(tel)) {
      this.toast.show('Cliente sem telefone para WhatsApp.');
      return;
    }
    const nomeWa = nomeClienteParaWhatsapp(null, this.d.cadastroNome);
    const resumo = row.servico?.trim()
      ? `• ${row.servico.trim()}: ${formataMoedaBrl(row.valorTotal)}`
      : '';
    this.whatsappLinha = row;
    this.whatsappContexto.set({
      telefone: tel,
      clienteId: this.d.clienteId ?? undefined,
      clienteNome: nomeWa,
      idAtendimento: row.idAtendimento,
      templateCodigo: 'orcamento',
      variaveis: {
        cliente: nomeWa,
        numero_comanda: String(row.numeroOrcamento ?? ''),
        resumo,
        valor: formataMoedaBrl(row.valorTotal),
      },
    });
    this.whatsappModalAberto.set(true);
  }

  fecharWhatsapp(): void {
    this.whatsappModalAberto.set(false);
    this.whatsappContexto.set(null);
  }

  onWhatsappEnviado(): void {
    const row = this.whatsappLinha;
    this.fecharWhatsapp();
    this.whatsappLinha = null;
    if (!row) return;
    this.api.atualizarStatusOrcamento(row.idAtendimento, 'enviado').subscribe({
      next: () => {
        row.statusId = 'enviado';
        row.statusLabel = 'Enviado';
        this.toast.show('Orçamento marcado como enviado.');
      },
      error: (e: Error) =>
        this.toast.showWarning(e.message || 'Falha ao atualizar status.'),
    });
  }

  arquivarOrcamento(row: ClienteOrcamentoHistoricoLinha): void {
    if (row.statusId === 'arquivado') return;
    this.api
      .atualizarStatusOrcamento(row.idAtendimento, 'arquivado')
      .subscribe({
        next: () => {
          row.statusId = 'arquivado';
          row.statusLabel = 'Arquivado';
          this.toast.show('Orçamento arquivado.');
        },
        error: (e: Error) =>
          this.toast.showWarning(e.message || 'Falha ao arquivar.'),
      });
  }
}
