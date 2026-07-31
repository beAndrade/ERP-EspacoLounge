import { Component, inject, OnInit } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { Router, RouterOutlet } from '@angular/router';
import { AdminPinService } from '../../../../core/services/admin-pin.service';
import { SheetsApiService } from '../../../../core/services/sheets-api.service';
import { FinanceiroResumoUiService } from './financeiro-resumo-ui.service';

@Component({
  selector: 'app-financeiro-shell',
  standalone: true,
  imports: [FormsModule, RouterOutlet],
  templateUrl: './financeiro-shell.component.html',
  styleUrl: './financeiro-shell.component.scss',
  providers: [FinanceiroResumoUiService],
})
export class FinanceiroShellComponent implements OnInit {
  private readonly api = inject(SheetsApiService);
  readonly adminPin = inject(AdminPinService);
  readonly router = inject(Router);
  readonly resumoUi = inject(FinanceiroResumoUiService);

  /** Painel Belasis — layout próprio, sem toolbar do shell. */
  get emPainel(): boolean {
    const path = this.router.url.split('?')[0] ?? '';
    return (
      path === '/financeiro/painel' || path.endsWith('/financeiro/painel')
    );
  }

  get emTransacoes(): boolean {
    const path = this.router.url.split('?')[0] ?? '';
    return path.includes('/financeiro/transacoes');
  }

  get emComissoes(): boolean {
    const path = this.router.url.split('?')[0] ?? '';
    return path.includes('/financeiro/comissoes');
  }

  get emCadastros(): boolean {
    const path = this.router.url.split('?')[0] ?? '';
    return path.includes('/financeiro/cadastros');
  }

  /** Rotas com layout Belasis próprio (sem toolbar do shell). */
  get layoutProprio(): boolean {
    return this.emPainel || this.emTransacoes || this.emComissoes || this.emCadastros;
  }

  pinDraft = '';
  verificando = false;
  erroPin = '';

  ngOnInit(): void {
    this.pinDraft = this.adminPin.getPin();
    if (this.adminPin.unlocked()) {
      return;
    }
    if (this.adminPin.hasPin()) {
      this.verificarPinGuardado();
    }
  }

  private verificarPinGuardado(): void {
    this.verificando = true;
    this.erroPin = '';
    this.api.verificarFinanceiroPin().subscribe({
      next: () => {
        this.verificando = false;
        this.adminPin.markUnlocked();
      },
      error: (e: Error) => {
        this.verificando = false;
        this.adminPin.clear();
        this.pinDraft = '';
        this.erroPin =
          e.message || 'PIN inválido ou sessão expirada. Digite o PIN novamente.';
      },
    });
  }

  entrar(): void {
    const t = String(this.pinDraft ?? '').trim();
    if (!t) {
      this.erroPin = 'Digite o PIN.';
      return;
    }
    this.adminPin.setPin(t);
    this.verificarPinGuardado();
  }

  /** Recarrega o resumo do dia (legado — `FinanceiroCaixaDiaComponent`). */
  atualizarFinanceiro(): void {
    this.resumoUi.solicitarRecarregar();
  }
}
