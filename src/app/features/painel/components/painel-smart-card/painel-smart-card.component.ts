import { Component, input } from '@angular/core';
import { RouterLink } from '@angular/router';

@Component({
  selector: 'app-painel-smart-card',
  standalone: true,
  imports: [RouterLink],
  templateUrl: './painel-smart-card.component.html',
  styleUrl: './painel-smart-card.component.scss',
})
export class PainelSmartCardComponent {
  readonly title = input.required<string>();
  readonly subtitle = input<string>('');
  /** Navegação ao clicar no card (fora do CTA). */
  readonly link = input<string | null>(null);
  readonly ctaLabel = input<string>('');
  readonly ctaLink = input<string | null>(null);
  readonly disabled = input(false);
  /** Destaque quando o brush contextual aponta um dia. */
  readonly contextoAtivo = input(false);
  readonly focoLabel = input<string>('');
}
