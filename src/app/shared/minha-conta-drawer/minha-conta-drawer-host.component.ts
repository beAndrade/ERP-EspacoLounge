import {
  Component,
  ElementRef,
  OnDestroy,
  OnInit,
  ViewEncapsulation,
  inject,
} from '@angular/core';
import { portalHostElementToBody } from '../drawer-body-portal';
import { MinhaContaDrawerService } from './minha-conta-drawer.service';
import { MinhaContaEmailTabComponent } from './minha-conta-email-tab.component';
import { MinhaContaSenhaTabComponent } from './minha-conta-senha-tab.component';

@Component({
  selector: 'app-minha-conta-drawer-host',
  standalone: true,
  imports: [MinhaContaEmailTabComponent, MinhaContaSenhaTabComponent],
  templateUrl: './minha-conta-drawer-host.component.html',
  styleUrl: './minha-conta-drawer-host.component.scss',
  encapsulation: ViewEncapsulation.None,
})
export class MinhaContaDrawerHostComponent implements OnInit, OnDestroy {
  readonly d = inject(MinhaContaDrawerService);

  private readonly hostEl = inject(ElementRef<HTMLElement>).nativeElement;
  private restoreBodyPortal: (() => void) | null = null;

  ngOnInit(): void {
    this.restoreBodyPortal = portalHostElementToBody(this.hostEl);
  }

  ngOnDestroy(): void {
    this.restoreBodyPortal?.();
    this.restoreBodyPortal = null;
  }
}
