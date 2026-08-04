import { CurrencyPipe } from '@angular/common';
import { Component, inject, output } from '@angular/core';
import { ClienteCadastroDrawerService } from './cliente-cadastro-drawer.service';
import { TableEmptyComponent } from '../table-empty/table-empty.component';

@Component({
  selector: 'app-cliente-creditos-tab',
  standalone: true,
  imports: [CurrencyPipe, TableEmptyComponent],
  templateUrl: './cliente-creditos-tab.component.html',
  styleUrl: './cliente-creditos-tab.component.scss',
})
export class ClienteCreditosTabComponent {
  readonly d = inject(ClienteCadastroDrawerService);
  readonly abrirAtualizarCredito = output<void>();

  formatarData(data: string): string {
    const ymd = String(data ?? '').trim().slice(0, 10);
    const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(ymd);
    if (!m) return data || '';
    return `${m[3]}/${m[2]}/${m[1]}`;
  }
}
