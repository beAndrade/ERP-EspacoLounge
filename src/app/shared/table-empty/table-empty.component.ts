import { ChangeDetectionStrategy, Component, input } from '@angular/core';

/** Empty state de tabela (padrão Belasis / Ant Design Simple). */
@Component({
  selector: 'app-table-empty',
  standalone: true,
  templateUrl: './table-empty.component.html',
  styleUrl: './table-empty.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class TableEmptyComponent {
  /** Texto abaixo do ícone. */
  readonly label = input.required<string>();

  /** `drawer` usa as classes do empty em tabelas de drawer. */
  readonly variant = input<'table' | 'drawer'>('table');
}
