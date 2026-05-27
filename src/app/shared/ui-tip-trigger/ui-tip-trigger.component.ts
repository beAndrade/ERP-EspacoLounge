import { Component, input, signal } from '@angular/core';

export type UiTipAlign = 'center' | 'end' | 'start';

/** Tooltip escuro padrão do sistema (`ui-tooltip.scss`). */
@Component({
  selector: 'app-ui-tip-trigger',
  standalone: true,
  template: `
    <span
      class="ui-tip-trigger"
      [class.ui-tip-trigger--align-end]="align() === 'end'"
      [class.ui-tip-trigger--align-start]="align() === 'start'"
      [class.ui-tip-trigger--open]="tipOpen()"
      (mouseenter)="onPointerEnter()"
      (mouseleave)="onPointerLeave()"
      (focusin)="onPointerEnter()"
      (focusout)="onPointerLeave()"
      (click)="onTriggerClick($event)"
    >
      <ng-content />
      @if (tip()) {
        <span class="ui-tip" role="tooltip">{{ tip() }}</span>
      }
    </span>
  `,
  styleUrl: './ui-tip-trigger.component.scss',
})
export class UiTipTriggerComponent {
  readonly tip = input<string>('');
  /** `end` = balão alinhado à direita do ícone (útil na borda da tabela). */
  readonly align = input<UiTipAlign>('center');

  readonly tipOpen = signal(false);

  /** Após clique, não reabre até sair do trigger (hover de novo). */
  private suppressed = false;

  onPointerEnter(): void {
    if (!this.suppressed) {
      this.tipOpen.set(true);
    }
  }

  onPointerLeave(): void {
    this.tipOpen.set(false);
    this.suppressed = false;
  }

  onTriggerClick(ev: Event): void {
    this.suppressed = true;
    this.tipOpen.set(false);
    const btn = (ev.target as HTMLElement | null)?.closest('button');
    btn?.blur();
  }
}
