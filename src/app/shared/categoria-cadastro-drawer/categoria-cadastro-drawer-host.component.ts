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
import { CategoriaCadastroDrawerService } from './categoria-cadastro-drawer.service';

@Component({
  selector: 'app-categoria-cadastro-drawer-host',
  standalone: true,
  imports: [FormsModule],
  templateUrl: './categoria-cadastro-drawer-host.component.html',
  styleUrl: './categoria-cadastro-drawer-host.component.scss',
  encapsulation: ViewEncapsulation.None,
})
export class CategoriaCadastroDrawerHostComponent implements OnInit, OnDestroy {
  readonly d = inject(CategoriaCadastroDrawerService);

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
