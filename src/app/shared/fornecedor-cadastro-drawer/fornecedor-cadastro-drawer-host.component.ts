import {
  Component,
  ElementRef,
  HostListener,
  OnDestroy,
  OnInit,
  ViewEncapsulation,
  inject,
} from '@angular/core';
import { FormsModule } from '@angular/forms';
import { portalHostElementToBody } from '../drawer-body-portal';
import { FornecedorCadastroDrawerService } from './fornecedor-cadastro-drawer.service';

@Component({
  selector: 'app-fornecedor-cadastro-drawer-host',
  standalone: true,
  imports: [FormsModule],
  templateUrl: './fornecedor-cadastro-drawer-host.component.html',
  styleUrl: './fornecedor-cadastro-drawer-host.component.scss',
  encapsulation: ViewEncapsulation.None,
})
export class FornecedorCadastroDrawerHostComponent implements OnInit, OnDestroy {
  readonly d = inject(FornecedorCadastroDrawerService);

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
    if (!this.d.aberto()) return;
    if (ev.defaultPrevented) return;
    ev.preventDefault();
    ev.stopImmediatePropagation();
    if (this.d.salvando) return;
    this.d.fechar();
  }
}
