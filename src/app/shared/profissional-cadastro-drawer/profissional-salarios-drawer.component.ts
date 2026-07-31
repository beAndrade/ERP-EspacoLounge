import { Component, ViewEncapsulation, inject } from '@angular/core';
import { TableEmptyComponent } from '../table-empty/table-empty.component';
import { ProfissionalCadastroDrawerService } from './profissional-cadastro-drawer.service';

@Component({
  selector: 'app-profissional-salarios-drawer',
  standalone: true,
  imports: [TableEmptyComponent],
  templateUrl: './profissional-salarios-drawer.component.html',
  styleUrl: './profissional-salarios-drawer.component.scss',
  encapsulation: ViewEncapsulation.None,
})
export class ProfissionalSalariosDrawerComponent {
  readonly d = inject(ProfissionalCadastroDrawerService);
}
