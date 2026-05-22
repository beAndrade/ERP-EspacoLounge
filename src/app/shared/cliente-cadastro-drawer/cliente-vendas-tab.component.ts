import { CurrencyPipe, registerLocaleData } from '@angular/common';
import localePt from '@angular/common/locales/pt';
import { Component, inject, LOCALE_ID } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { ClienteDrawerPeriodoFiltroComponent } from '../cliente-drawer-periodo-filtro/cliente-drawer-periodo-filtro.component';
import { ClienteCadastroDrawerService } from './cliente-cadastro-drawer.service';

registerLocaleData(localePt);

@Component({
  selector: 'app-cliente-vendas-tab',
  standalone: true,
  imports: [CurrencyPipe, ClienteDrawerPeriodoFiltroComponent],
  providers: [{ provide: LOCALE_ID, useValue: 'pt-BR' }],
  templateUrl: './cliente-vendas-tab.component.html',
  styleUrl: './cliente-vendas-tab.component.scss',
})
export class ClienteVendasTabComponent {
  readonly d = inject(ClienteCadastroDrawerService);

  rotuloComanda(numero: number | null): string {
    if (typeof numero === 'number' && Number.isFinite(numero) && numero > 0) {
      return `#${numero}`;
    }
    return '—';
  }

  aplicarFiltroDatas(): void {
    this.d.aplicarFiltroVendasHistorico();
  }
}
