import { CurrencyPipe } from '@angular/common';
import { Component, inject } from '@angular/core';
import { ClienteCadastroDrawerService } from './cliente-cadastro-drawer.service';

@Component({
  selector: 'app-cliente-cashback-tab',
  standalone: true,
  imports: [CurrencyPipe],
  templateUrl: './cliente-cashback-tab.component.html',
  styleUrl: './cliente-cashback-tab.component.scss',
})
export class ClienteCashbackTabComponent {
  readonly d = inject(ClienteCadastroDrawerService);

  formatarData(data: string): string {
    const ymd = String(data ?? '').trim().slice(0, 10);
    const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(ymd);
    if (!m) return data || '—';
    return `${m[3]}/${m[2]}/${m[1]}`;
  }
}
