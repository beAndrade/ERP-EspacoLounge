import { Component, input, output } from '@angular/core';
import { UiTipTriggerComponent } from '../../../../shared/ui-tip-trigger/ui-tip-trigger.component';
import { OrcamentoPrintComponent } from './orcamento-print.component';
import type { OrcamentoPrintPayload } from '../../../../core/models/orcamento-print.models';

@Component({
  selector: 'app-orcamento-preview-overlay',
  standalone: true,
  imports: [OrcamentoPrintComponent, UiTipTriggerComponent],
  templateUrl: './orcamento-preview-overlay.component.html',
  styleUrl: './orcamento-preview-overlay.component.scss',
})
export class OrcamentoPreviewOverlayComponent {
  readonly dados = input.required<OrcamentoPrintPayload>();

  readonly fechar = output<void>();
  readonly imprimir = output<void>();
  readonly whatsapp = output<void>();
}
