import { Component, effect, inject, OnInit } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { Router, RouterOutlet } from '@angular/router';
import { AdminPinService } from '../../../../core/services/admin-pin.service';
import { SheetsApiService } from '../../../../core/services/sheets-api.service';
import { FinanceiroResumoUiService } from './financeiro-resumo-ui.service';

const PIN_LEN = 4;

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

  constructor() {
    effect(() => {
      if (!this.adminPin.unlocked()) {
        this.resetPinForm();
      }
    });
  }

  ngOnInit(): void {
    if (this.adminPin.unlocked()) {
      return;
    }
    if (this.adminPin.hasPin()) {
      this.verificarPinGuardado();
      return;
    }
    this.resetPinForm();
  }

  private resetPinForm(): void {
    this.pinDraft = '';
    this.erroPin = '';
    this.verificando = false;
  }

  /** Mantém o cursor sempre no fim — evita editar no meio dos dígitos. */
  forcarCaretFim(ev: Event): void {
    const el = ev.target as HTMLInputElement | null;
    if (!el || typeof el.setSelectionRange !== 'function') return;
    const len = el.value.length;
    requestAnimationFrame(() => {
      try {
        el.setSelectionRange(len, len);
      } catch {
        /* ignore (type=password em alguns browsers) */
      }
    });
  }

  onPinKeydown(ev: KeyboardEvent): void {
    if (
      ['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown', 'Home', 'End'].includes(
        ev.key,
      )
    ) {
      ev.preventDefault();
      this.forcarCaretFim(ev);
      return;
    }
    if (ev.key === 'Enter') {
      return;
    }
    if (ev.ctrlKey || ev.metaKey || ev.altKey) {
      return;
    }
    if (ev.key.length === 1 && !/^\d$/.test(ev.key)) {
      ev.preventDefault();
    }
  }

  onPinPaste(ev: ClipboardEvent): void {
    ev.preventDefault();
    const raw = ev.clipboardData?.getData('text') ?? '';
    const digits = raw.replace(/\D/g, '').slice(0, PIN_LEN);
    this.aplicarDigitos(digits, ev.target as HTMLInputElement | null);
  }

  onPinInput(ev: Event): void {
    const el = ev.target as HTMLInputElement;
    const digits = String(el.value ?? '')
      .replace(/\D/g, '')
      .slice(0, PIN_LEN);
    this.aplicarDigitos(digits, el);
  }

  private aplicarDigitos(digits: string, el: HTMLInputElement | null): void {
    this.pinDraft = digits;
    if (el && el.value !== digits) {
      el.value = digits;
    }
    if (el) {
      this.forcarCaretFim({ target: el } as unknown as Event);
    }
    this.erroPin = '';
    if (digits.length === PIN_LEN && !this.verificando) {
      this.entrar();
    }
  }

  private verificarPinGuardado(): void {
    this.verificando = true;
    this.erroPin = '';
    this.api.verificarFinanceiroPin().subscribe({
      next: () => {
        this.verificando = false;
        this.pinDraft = '';
        this.adminPin.markUnlocked();
      },
      error: (e: Error) => {
        this.verificando = false;
        this.adminPin.clear();
        this.resetPinForm();
        this.erroPin =
          e.message?.includes('inválido') || e.message?.includes('em falta')
            ? 'PIN de administrador inválido.'
            : e.message || 'PIN inválido. Digite o PIN novamente.';
      },
    });
  }

  entrar(): void {
    const t = String(this.pinDraft ?? '')
      .replace(/\D/g, '')
      .slice(0, PIN_LEN);
    if (t.length < PIN_LEN) {
      this.erroPin = `Digite os ${PIN_LEN} dígitos do PIN.`;
      return;
    }
    if (this.verificando) return;
    this.pinDraft = t;
    this.adminPin.setPin(t);
    this.verificarPinGuardado();
  }

  /** Recarrega o resumo do dia (legado — `FinanceiroCaixaDiaComponent`). */
  atualizarFinanceiro(): void {
    this.resumoUi.solicitarRecarregar();
  }
}
