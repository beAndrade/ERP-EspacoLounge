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
import {
  SERVICO_ABAS,
  ServicoCadastroDrawerService,
  type ServicoCadastroAba,
} from './servico-cadastro-drawer.service';

@Component({
  selector: 'app-servico-cadastro-drawer-host',
  standalone: true,
  imports: [FormsModule],
  templateUrl: './servico-cadastro-drawer-host.component.html',
  styleUrl: './servico-cadastro-drawer-host.component.scss',
  encapsulation: ViewEncapsulation.None,
})
export class ServicoCadastroDrawerHostComponent implements OnInit, OnDestroy {
  readonly d = inject(ServicoCadastroDrawerService);
  readonly abas = SERVICO_ABAS;

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
    if (!this.d.aberto) return;
    if (ev.defaultPrevented) return;
    ev.preventDefault();
    ev.stopImmediatePropagation();
    if (this.d.salvando) return;
    this.d.fechar();
  }

  setAba(aba: ServicoCadastroAba): void {
    this.d.setAba(aba);
  }

  onFotoChange(ev: Event): void {
    const input = ev.target as HTMLInputElement;
    const file = input.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => {
      const url = String(reader.result ?? '');
      if (url.startsWith('data:image')) {
        this.d.fotoUrl = url;
      }
    };
    reader.readAsDataURL(file);
    input.value = '';
  }
}
