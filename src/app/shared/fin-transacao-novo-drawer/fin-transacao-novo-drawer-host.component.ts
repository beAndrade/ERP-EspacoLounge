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
import { FinTransacaoNovoDrawerComponent } from '../../features/financeiro/pages/transacoes/fin-transacao-novo-drawer.component';
import { FinTransacaoNovoDrawerService } from './fin-transacao-novo-drawer.service';

@Component({
  selector: 'app-fin-transacao-novo-drawer-host',
  standalone: true,
  imports: [FinTransacaoNovoDrawerComponent],
  templateUrl: './fin-transacao-novo-drawer-host.component.html',
  styleUrl: './fin-transacao-novo-drawer-host.component.scss',
  encapsulation: ViewEncapsulation.None,
})
export class FinTransacaoNovoDrawerHostComponent implements OnInit, OnDestroy {
  readonly d = inject(FinTransacaoNovoDrawerService);

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
