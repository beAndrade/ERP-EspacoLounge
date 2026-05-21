import { Component, inject } from '@angular/core';
import { FormsModule } from '@angular/forms';
import {
  AGENDA_STATUS_META,
  corHexAgendaPorStatus,
} from '../../core/utils/agenda-status-card';
import { ClienteCadastroDrawerService } from './cliente-cadastro-drawer.service';

@Component({
  selector: 'app-cliente-agendamentos-tab',
  standalone: true,
  imports: [FormsModule],
  templateUrl: './cliente-agendamentos-tab.component.html',
  styleUrl: './cliente-agendamentos-tab.component.scss',
})
export class ClienteAgendamentosTabComponent {
  readonly d = inject(ClienteCadastroDrawerService);
  readonly statusMeta = AGENDA_STATUS_META;

  corBadge(statusId: string): string {
    return corHexAgendaPorStatus(statusId) ?? '#32C787';
  }

  aplicarFiltroDatas(): void {
    this.d.aplicarFiltroAgendamentosHistorico();
  }
}
