import { CurrencyPipe, registerLocaleData } from '@angular/common';
import localePt from '@angular/common/locales/pt';
import { Component, inject, LOCALE_ID } from '@angular/core';
import { ClienteDrawerPeriodoFiltroComponent } from '../cliente-drawer-periodo-filtro/cliente-drawer-periodo-filtro.component';
import { ClienteCadastroDrawerService } from './cliente-cadastro-drawer.service';

registerLocaleData(localePt);

@Component({
  selector: 'app-cliente-orcamentos-tab',
  standalone: true,
  imports: [CurrencyPipe, ClienteDrawerPeriodoFiltroComponent],
  providers: [{ provide: LOCALE_ID, useValue: 'pt-BR' }],
  templateUrl: './cliente-orcamentos-tab.component.html',
  styleUrl: './cliente-orcamentos-tab.component.scss',
})
export class ClienteOrcamentosTabComponent {
  readonly d = inject(ClienteCadastroDrawerService);

  rotuloTicket(numero: number | null): string {
    if (typeof numero === 'number' && Number.isFinite(numero) && numero > 0) {
      return `#${numero}`;
    }
    return '—';
  }

  aplicarFiltroDatas(): void {
    this.d.aplicarFiltroOrcamentosHistorico();
  }
}
