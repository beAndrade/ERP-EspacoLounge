import { Component, signal } from '@angular/core';
import { WhatsappConfigTabComponent } from './whatsapp-config-tab.component';
import { WhatsappTemplatesTabComponent } from './whatsapp-templates-tab.component';
import { WhatsappLogsTabComponent } from './whatsapp-logs-tab.component';

type WhatsappTab = 'integracao' | 'templates' | 'historico';

@Component({
  selector: 'app-configuracoes-whatsapp',
  standalone: true,
  imports: [
    WhatsappConfigTabComponent,
    WhatsappTemplatesTabComponent,
    WhatsappLogsTabComponent,
  ],
  templateUrl: './configuracoes-whatsapp.component.html',
  styleUrl: './configuracoes-whatsapp.component.scss',
})
export class ConfiguracoesWhatsappComponent {
  readonly tabAtiva = signal<WhatsappTab>('integracao');

  readonly tabs: { id: WhatsappTab; label: string }[] = [
    { id: 'integracao', label: 'Integração' },
    { id: 'templates', label: 'Templates' },
    { id: 'historico', label: 'Histórico' },
  ];

  selecionarTab(id: WhatsappTab): void {
    this.tabAtiva.set(id);
  }
}
