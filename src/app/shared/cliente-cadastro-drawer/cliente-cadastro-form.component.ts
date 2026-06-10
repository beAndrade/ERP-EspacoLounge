import {
  Component,
  EventEmitter,
  HostListener,
  Input,
  Output,
  ViewEncapsulation,
  inject,
} from '@angular/core';
import { FormsModule } from '@angular/forms';
import { CelularBrMaskDirective } from '../../core/directives/celular-br-mask.directive';
import { ClienteCadastroDrawerService } from './cliente-cadastro-drawer.service';

@Component({
  selector: 'app-cliente-cadastro-form',
  standalone: true,
  imports: [FormsModule, CelularBrMaskDirective],
  templateUrl: './cliente-cadastro-form.component.html',
  styleUrl: './cliente-cadastro-form.component.scss',
  encapsulation: ViewEncapsulation.None,
})
export class ClienteCadastroFormComponent {
  readonly d = inject(ClienteCadastroDrawerService);

  /** Rodapé Salvar/Cancelar (no drawer global fica no host). */
  @Input() mostrarRodape = true;

  /** Voltar ao Painel quando embutido no drawer de perfil. */
  @Output() voltar = new EventEmitter<void>();

  @HostListener('document:click', ['$event'])
  onDocumentClick(ev: MouseEvent): void {
    const t = ev.target as HTMLElement | null;
    if (this.d.descontoDropdownAberto && !t?.closest?.('.cliente-discount')) {
      this.d.descontoDropdownAberto = false;
    }
  }

  onCancelar(): void {
    if (this.d.exibicao === 'embutido') {
      this.d.desanexarEmbutido();
      this.voltar.emit();
      return;
    }
    this.d.fechar();
  }
}
