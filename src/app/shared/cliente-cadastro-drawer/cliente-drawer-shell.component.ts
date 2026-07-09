import { Component, inject, input, output } from '@angular/core';
import { ClienteAgendamentosTabComponent } from './cliente-agendamentos-tab.component';
import { ClienteVendasTabComponent } from './cliente-vendas-tab.component';
import { ClienteAvatarComponent } from '../cliente-avatar/cliente-avatar.component';
import { ClienteCadastroFormComponent } from './cliente-cadastro-form.component';
import { ClienteCadastroDrawerService } from './cliente-cadastro-drawer.service';
import { ClienteCashbackTabComponent } from './cliente-cashback-tab.component';
import { ClienteCreditosTabComponent } from './cliente-creditos-tab.component';
import { ClienteDebitosTabComponent } from './cliente-debitos-tab.component';
import { ClientePainelTabComponent } from './cliente-painel-tab.component';

/**
 * Corpo reutilizável da ficha do cliente (nav + abas + rodapé cadastro).
 * Usado no drawer principal e no drawer empilhado por cima de comanda/agendamento.
 */
@Component({
  selector: 'app-cliente-drawer-shell',
  standalone: true,
  imports: [
    ClienteCadastroFormComponent,
    ClienteCashbackTabComponent,
    ClienteCreditosTabComponent,
    ClienteDebitosTabComponent,
    ClientePainelTabComponent,
    ClienteAgendamentosTabComponent,
    ClienteVendasTabComponent,
    ClienteAvatarComponent,
  ],
  templateUrl: './cliente-drawer-shell.component.html',
})
export class ClienteDrawerShellComponent {
  readonly d = inject(ClienteCadastroDrawerService);

  /** `true` quando este painel está empilhado sobre comanda/agendamento. */
  readonly empilhada = input(false);

  readonly fecharPainel = output<void>();
  readonly abrirAtualizarCredito = output<void>();

  onFechar(): void {
    if (this.empilhada()) {
      this.fecharPainel.emit();
      return;
    }
    this.d.fechar();
  }
}
