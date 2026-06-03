import { Component, ViewEncapsulation, inject } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { ProfissionalCadastroDrawerService } from './profissional-cadastro-drawer.service';

@Component({
  selector: 'app-profissional-comissoes-config-tab',
  standalone: true,
  imports: [FormsModule],
  templateUrl: './profissional-comissoes-config-tab.component.html',
  styleUrl: './profissional-comissoes-config-tab.component.scss',
  encapsulation: ViewEncapsulation.None,
})
export class ProfissionalComissoesConfigTabComponent {
  readonly d = inject(ProfissionalCadastroDrawerService);
}
