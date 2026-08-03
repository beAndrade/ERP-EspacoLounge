import { Component, input, output } from '@angular/core';
import {
  OrcamentoPrintComponent,
  type OrcamentoPrintPayload,
} from './orcamento-print.component';

@Component({
  selector: 'app-orcamento-preview-overlay',
  standalone: true,
  imports: [OrcamentoPrintComponent],
  templateUrl: './orcamento-preview-overlay.component.html',
  styleUrl: './orcamento-preview-overlay.component.scss',
})
export class OrcamentoPreviewOverlayComponent {
  readonly dados = input.required<OrcamentoPrintPayload>();

  readonly fechar = output<void>();
  readonly imprimir = output<void>();
  readonly whatsapp = output<void>();
}
