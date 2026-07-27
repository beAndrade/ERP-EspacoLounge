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
import { MarcaCadastroDrawerService } from './marca-cadastro-drawer.service';

@Component({
  selector: 'app-marca-cadastro-drawer-host',
  standalone: true,
  imports: [FormsModule],
  templateUrl: './marca-cadastro-drawer-host.component.html',
  styleUrl: './marca-cadastro-drawer-host.component.scss',
  encapsulation: ViewEncapsulation.None,
})
export class MarcaCadastroDrawerHostComponent implements OnInit, OnDestroy {
  readonly d = inject(MarcaCadastroDrawerService);

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
