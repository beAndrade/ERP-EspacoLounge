import {
  Component,
  ElementRef,
  HostListener,
  OnDestroy,
  OnInit,
  ViewChild,
  ViewEncapsulation,
  inject,
} from '@angular/core';
import { portalHostElementToBody } from '../drawer-body-portal';
import { AgendaNovoComponent } from '../../features/agenda/pages/novo/agenda-novo.component';
import {
  AbrirCadastroClientePayload,
  ClienteCadastroDrawerService,
} from '../cliente-cadastro-drawer/cliente-cadastro-drawer.service';
import { AgendaNovoGlobalService } from './agenda-novo-global.service';

@Component({
  selector: 'app-agenda-novo-global-host',
  standalone: true,
  imports: [AgendaNovoComponent],
  templateUrl: './agenda-novo-global-host.component.html',
  styleUrl: './agenda-novo-global-host.component.scss',
  encapsulation: ViewEncapsulation.None,
})
export class AgendaNovoGlobalHostComponent implements OnInit, OnDestroy {
  readonly d = inject(AgendaNovoGlobalService);
  private readonly clienteDrawer = inject(ClienteCadastroDrawerService);

  @ViewChild(AgendaNovoComponent) private agendaRef?: AgendaNovoComponent;

  private readonly hostEl = inject(ElementRef<HTMLElement>).nativeElement;
  private restoreBodyPortal: (() => void) | null = null;

  ngOnInit(): void {
    this.restoreBodyPortal = portalHostElementToBody(this.hostEl);
  }

  ngOnDestroy(): void {
    this.restoreBodyPortal?.();
    this.restoreBodyPortal = null;
  }

  abrirClienteNovo(): void {
    this.clienteDrawer.abrirNovo('', {
      onSalvo: (salvo) => {
        this.agendaRef?.aplicarClienteAposCriacao(salvo);
      },
    });
  }

  onAbrirCadastroCliente(payload: AbrirCadastroClientePayload = {}): void {
    const c = this.agendaRef?.clienteSelecionado();
    const cid = c?.id?.trim();
    if (!cid) return;
    this.clienteDrawer.abrirEdicaoPorLinkSidebar(cid, payload, {
      nomeLista: String(c?.nome ?? '').trim(),
      callbacks: {
        onSalvo: (salvo) => {
          this.agendaRef?.aplicarClienteAposCriacao(salvo);
        },
      },
    });
  }

  @HostListener('document:keydown.escape', ['$event'])
  onEscape(ev: KeyboardEvent): void {
    if (!this.d.aberto) return;
    if (this.clienteDrawer.isAberto) return;
    if (ev.defaultPrevented) return;
    ev.preventDefault();
    ev.stopImmediatePropagation();
    this.d.fechar();
  }
}
