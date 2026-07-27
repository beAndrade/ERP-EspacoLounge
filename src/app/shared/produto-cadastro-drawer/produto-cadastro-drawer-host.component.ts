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
import { SaasSelectComponent } from '../../features/agenda/pages/novo/saas-select.component';
import {
  PRODUTO_ABAS,
  ProdutoCadastroDrawerService,
  type ProdutoCadastroAba,
} from './produto-cadastro-drawer.service';
import { CategoriaCadastroDrawerService } from '../categoria-cadastro-drawer/categoria-cadastro-drawer.service';
import { MarcaCadastroDrawerService } from '../marca-cadastro-drawer/marca-cadastro-drawer.service';

@Component({
  selector: 'app-produto-cadastro-drawer-host',
  standalone: true,
  imports: [FormsModule, SaasSelectComponent],
  templateUrl: './produto-cadastro-drawer-host.component.html',
  styleUrl: './produto-cadastro-drawer-host.component.scss',
  encapsulation: ViewEncapsulation.None,
})
export class ProdutoCadastroDrawerHostComponent implements OnInit, OnDestroy {
  readonly d = inject(ProdutoCadastroDrawerService);
  readonly abas = PRODUTO_ABAS;

  private readonly categoriaDrawer = inject(CategoriaCadastroDrawerService);
  private readonly marcaDrawer = inject(MarcaCadastroDrawerService);
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
    if (this.categoriaDrawer.aberto()) return;
    if (this.marcaDrawer.aberto()) return;
    if (ev.defaultPrevented) return;
    ev.preventDefault();
    ev.stopImmediatePropagation();
    if (this.d.salvando) return;
    this.d.fechar();
  }

  setAba(aba: ProdutoCadastroAba): void {
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

  rotuloUnidade(): string {
    if (this.d.registroSaida === 'em ml') return 'ml';
    if (this.d.registroSaida === 'em gramas') return 'g';
    return 'unidade';
  }
}
