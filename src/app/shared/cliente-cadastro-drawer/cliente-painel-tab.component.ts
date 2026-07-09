import { CurrencyPipe, registerLocaleData } from '@angular/common';
import localePt from '@angular/common/locales/pt';
import { Component, inject, LOCALE_ID } from '@angular/core';
import { ClienteCadastroDrawerService } from './cliente-cadastro-drawer.service';

registerLocaleData(localePt);

@Component({
  selector: 'app-cliente-painel-tab',
  standalone: true,
  imports: [CurrencyPipe],
  providers: [{ provide: LOCALE_ID, useValue: 'pt-BR' }],
  templateUrl: './cliente-painel-tab.component.html',
  styleUrl: './cliente-painel-tab.component.scss',
})
export class ClientePainelTabComponent {
  readonly d = inject(ClienteCadastroDrawerService);

  diasLabel(n: number | null): string {
    if (n == null) return '—';
    return n === 1 ? '1 dia' : `${n} dias`;
  }

  percentualLabel(n: number): string {
    const v = Number.isFinite(n) ? n : 0;
    return `${v.toFixed(1)}%`;
  }

  rotuloComanda(numero: number | null): string {
    return numero != null && numero > 0 ? `#${numero}` : '—';
  }

  verComanda(idAtendimento: string): void {
    if (!idAtendimento) return;
    this.d.visualizarComandaAgendamento(idAtendimento);
  }
}
