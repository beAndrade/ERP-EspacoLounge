import { Component, HostListener, ViewEncapsulation, inject } from '@angular/core';
import { ProfissionalCadastroDrawerService } from './profissional-cadastro-drawer.service';
import { ProfissionalCadastroFormComponent } from './profissional-cadastro-form.component';
import { ProfissionalComissoesConfigTabComponent } from './profissional-comissoes-config-tab.component';
import { ProfissionalComissoesServicosTabComponent } from './profissional-comissoes-servicos-tab.component';

@Component({
  selector: 'app-profissional-cadastro-drawer-host',
  standalone: true,
  imports: [
    ProfissionalCadastroFormComponent,
    ProfissionalComissoesConfigTabComponent,
    ProfissionalComissoesServicosTabComponent,
  ],
  templateUrl: './profissional-cadastro-drawer-host.component.html',
  styleUrl: './profissional-cadastro-drawer-host.component.scss',
  encapsulation: ViewEncapsulation.None,
})
export class ProfissionalCadastroDrawerHostComponent {
  readonly d = inject(ProfissionalCadastroDrawerService);

  @HostListener('document:keydown.escape', ['$event'])
  onEscape(ev: KeyboardEvent): void {
    if (!this.d.aberto || this.d.salvando) return;
    ev.preventDefault();
    this.d.fechar();
  }
}
