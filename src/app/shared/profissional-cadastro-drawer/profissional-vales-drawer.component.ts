import { Component, ViewEncapsulation, inject } from '@angular/core';
import { TableEmptyComponent } from '../table-empty/table-empty.component';
import { ProfissionalCadastroDrawerService } from './profissional-cadastro-drawer.service';

@Component({
  selector: 'app-profissional-vales-drawer',
  standalone: true,
  imports: [TableEmptyComponent],
  templateUrl: './profissional-vales-drawer.component.html',
  styleUrl: './profissional-vales-drawer.component.scss',
  encapsulation: ViewEncapsulation.None,
})
export class ProfissionalValesDrawerComponent {
  readonly d = inject(ProfissionalCadastroDrawerService);
}
