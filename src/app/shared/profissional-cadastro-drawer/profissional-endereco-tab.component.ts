import { Component, ViewEncapsulation, inject } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { ProfissionalCadastroDrawerService } from './profissional-cadastro-drawer.service';

@Component({
  selector: 'app-profissional-endereco-tab',
  standalone: true,
  imports: [FormsModule],
  templateUrl: './profissional-endereco-tab.component.html',
  styleUrl: './profissional-endereco-tab.component.scss',
  encapsulation: ViewEncapsulation.None,
})
export class ProfissionalEnderecoTabComponent {
  readonly d = inject(ProfissionalCadastroDrawerService);
}
