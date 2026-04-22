import { Component, inject, OnInit } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { Router, RouterLink, RouterOutlet } from '@angular/router';
import { AdminPinService } from '../../core/services/admin-pin.service';
import { SheetsApiService } from '../../core/services/sheets-api.service';
import { FinanceiroResumoUiService } from './financeiro-resumo-ui.service';

function periodoAtualYm(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
}

@Component({
  selector: 'app-financeiro-shell',
  standalone: true,
  imports: [FormsModule, RouterLink, RouterOutlet],
  templateUrl: './financeiro-shell.component.html',
  styleUrl: './financeiro-shell.component.scss',
  providers: [FinanceiroResumoUiService],
})
export class FinanceiroShellComponent implements OnInit {
  private readonly api = inject(SheetsApiService);
  readonly adminPin = inject(AdminPinService);
  readonly router = inject(Router);
  readonly resumoUi = inject(FinanceiroResumoUiService);

  /** Mostra seta “voltar” para o resumo do dia quando estamos em Folha de pagamento. */
  get emSubrotaFolha(): boolean {
    const path = this.router.url.split('?')[0] ?? '';
    return path.includes('/financeiro/comissoes');
  }

  /** Subtítulo ao lado do título: resumo do dia vs folha de comissões. */
  get toolbarSubtitulo(): string {
    return this.emSubrotaFolha ? '// Comissões' : '// Visão Geral';
  }

  pinDraft = '';
  desbloqueado = false;
  verificando = false;
  erroPin = '';

  ngOnInit(): void {
    this.pinDraft = this.adminPin.getPin();
    if (this.adminPin.hasPin()) {
      this.verificarPinGuardado();
    }
  }

  private verificarPinGuardado(): void {
    this.verificando = true;
    this.erroPin = '';
    this.api.listFolha(periodoAtualYm()).subscribe({
      next: () => {
        this.verificando = false;
        this.desbloqueado = true;
      },
      error: (e: Error) => {
        this.verificando = false;
        this.adminPin.clear();
        this.pinDraft = '';
        this.erroPin =
          e.message ||
          'PIN inválido ou sessão expirada. Introduza o PIN de administrador.';
      },
    });
  }

  entrar(): void {
    const t = String(this.pinDraft ?? '').trim();
    if (!t) {
      this.erroPin = 'Introduza o PIN.';
      return;
    }
    this.adminPin.setPin(t);
    this.verificarPinGuardado();
  }

  terminarSessaoPin(): void {
    this.adminPin.clear();
    this.pinDraft = '';
    this.desbloqueado = false;
    this.erroPin = '';
  }

  /** Recarrega o resumo do dia (consumido por `FinanceiroComponent`). */
  atualizarFinanceiro(): void {
    this.resumoUi.solicitarRecarregar();
  }
}
