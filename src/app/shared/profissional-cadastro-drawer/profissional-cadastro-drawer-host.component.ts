import {
  Component,
  ElementRef,
  HostListener,
  OnDestroy,
  OnInit,
  ViewEncapsulation,
  inject,
} from '@angular/core';
import { portalHostElementToBody } from '../drawer-body-portal';
import { ProfissionalCadastroDrawerService } from './profissional-cadastro-drawer.service';
import { ProfissionalCadastroFormComponent } from './profissional-cadastro-form.component';
import { ProfissionalComissoesConfigTabComponent } from './profissional-comissoes-config-tab.component';
import { ProfissionalComissoesServicosTabComponent } from './profissional-comissoes-servicos-tab.component';
import { ProfissionalUsuarioTabComponent } from './profissional-usuario-tab.component';

@Component({
  selector: 'app-profissional-cadastro-drawer-host',
  standalone: true,
  imports: [
    ProfissionalCadastroFormComponent,
    ProfissionalComissoesConfigTabComponent,
    ProfissionalComissoesServicosTabComponent,
    ProfissionalUsuarioTabComponent,
  ],
  templateUrl: './profissional-cadastro-drawer-host.component.html',
  styleUrl: './profissional-cadastro-drawer-host.component.scss',
  encapsulation: ViewEncapsulation.None,
})
export class ProfissionalCadastroDrawerHostComponent implements OnInit, OnDestroy {
  readonly d = inject(ProfissionalCadastroDrawerService);

  private readonly hostEl = inject(ElementRef<HTMLElement>).nativeElement;
  private restoreBodyPortal: (() => void) | null = null;

  ngOnInit(): void {
    this.restoreBodyPortal = portalHostElementToBody(this.hostEl);
  }

  ngOnDestroy(): void {
    this.restoreBodyPortal?.();
    this.restoreBodyPortal = null;
  }

  @HostListener('document:keydown.escape', ['$event'])
  onEscape(ev: KeyboardEvent): void {
    if (!this.d.aberto || this.d.salvando) return;
    ev.preventDefault();
    this.d.fechar();
  }
}
