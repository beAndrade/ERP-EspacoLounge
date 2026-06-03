import { Component, ViewEncapsulation, inject } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { ProfissionalCadastroDrawerService } from './profissional-cadastro-drawer.service';

@Component({
  selector: 'app-profissional-comissoes-servicos-tab',
  standalone: true,
  imports: [FormsModule],
  templateUrl: './profissional-comissoes-servicos-tab.component.html',
  styleUrl: './profissional-comissoes-servicos-tab.component.scss',
  encapsulation: ViewEncapsulation.None,
})
export class ProfissionalComissoesServicosTabComponent {
  readonly d = inject(ProfissionalCadastroDrawerService);

  labelValor(tipo: 'percentual' | 'fixo'): string {
    return tipo === 'fixo' ? 'Valor fixo (R$)' : 'Percentual (%)';
  }
}
