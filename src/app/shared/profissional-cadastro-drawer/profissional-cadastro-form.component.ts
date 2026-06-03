import { Component, ViewEncapsulation, inject } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { ProfissionalCadastroDrawerService } from './profissional-cadastro-drawer.service';

@Component({
  selector: 'app-profissional-cadastro-form',
  standalone: true,
  imports: [FormsModule],
  templateUrl: './profissional-cadastro-form.component.html',
  styleUrl: './profissional-cadastro-form.component.scss',
  encapsulation: ViewEncapsulation.None,
})
export class ProfissionalCadastroFormComponent {
  readonly d = inject(ProfissionalCadastroDrawerService);
}
