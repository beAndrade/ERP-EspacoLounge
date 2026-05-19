import {
  Component,
  HostListener,
  ViewEncapsulation,
  inject,
} from '@angular/core';
import { FormsModule } from '@angular/forms';
import { ClienteCadastroDrawerService } from './cliente-cadastro-drawer.service';
import { ClienteCadastroFormComponent } from './cliente-cadastro-form.component';

@Component({
  selector: 'app-cliente-cadastro-drawer-host',
  standalone: true,
  imports: [FormsModule, ClienteCadastroFormComponent],
  templateUrl: './cliente-cadastro-drawer-host.component.html',
  styleUrl: './cliente-cadastro-drawer-host.component.scss',
  encapsulation: ViewEncapsulation.None,
})
export class ClienteCadastroDrawerHostComponent {
  readonly d = inject(ClienteCadastroDrawerService);

  @HostListener('document:keydown.escape', ['$event'])
  onEscape(ev: KeyboardEvent): void {
    if (!this.d.aberto) return;
    ev.preventDefault();
    this.d.fechar();
  }

  @HostListener('document:click', ['$event'])
  onDocumentClick(ev: MouseEvent): void {
    const t = ev.target as HTMLElement | null;
    if (this.d.descontoDropdownAberto && !t?.closest?.('.cliente-discount')) {
      this.d.descontoDropdownAberto = false;
    }
  }
}
