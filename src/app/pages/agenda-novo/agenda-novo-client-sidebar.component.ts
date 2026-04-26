import { Component, Input } from '@angular/core';
import { FormControl } from '@angular/forms';
import { Cliente } from '../../core/models/api.models';
import {
  SaasSelectComponent,
  type SaasSelectOption,
} from './saas-select.component';

@Component({
  selector: 'app-agenda-novo-client-sidebar',
  standalone: true,
  imports: [SaasSelectComponent],
  templateUrl: './agenda-novo-client-sidebar.component.html',
  styleUrl: './agenda-novo-client-sidebar.component.scss',
})
export class AgendaNovoClientSidebarComponent {
  @Input({ required: true }) clienteIdControl!: FormControl;
  @Input() opcoesClientes: SaasSelectOption[] = [];
  @Input() cliente: Cliente | null = null;

  iniciaisAvatar(): string {
    const t = (this.cliente?.nome ?? '').trim();
    if (!t) return '';
    const parts = t.split(/\s+/).filter(Boolean);
    if (parts.length === 1) {
      return parts[0].slice(0, 2).toUpperCase();
    }
    const a = parts[0][0] ?? '';
    const b = parts[parts.length - 1][0] ?? '';
    return (a + b).toUpperCase() || '';
  }

  telefoneExibicao(): string {
    const t = (this.cliente?.telefone ?? '').trim();
    return t || '—';
  }

  get temClienteSelecionado(): boolean {
    return (
      this.cliente != null &&
      String(this.clienteIdControl?.value ?? '').trim() !== ''
    );
  }
}
