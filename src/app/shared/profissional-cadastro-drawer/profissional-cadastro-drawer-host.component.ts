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
import { ProfissionalAvatarComponent } from '../profissional-avatar/profissional-avatar.component';
import { ProfissionalCadastroDrawerService } from './profissional-cadastro-drawer.service';
import type {
  ProfCadastroAba,
  ProfCadastroAbaOverflow,
} from './profissional-cadastro-drawer.service';
import { ProfissionalCadastroFormComponent } from './profissional-cadastro-form.component';
import { ProfissionalComissoesConfigTabComponent } from './profissional-comissoes-config-tab.component';
import { ProfissionalEnderecoTabComponent } from './profissional-endereco-tab.component';
import { ProfissionalSalariosDrawerComponent } from './profissional-salarios-drawer.component';
import { ProfissionalUsuarioTabComponent } from './profissional-usuario-tab.component';
import { ProfissionalValesDrawerComponent } from './profissional-vales-drawer.component';

@Component({
  selector: 'app-profissional-cadastro-drawer-host',
  standalone: true,
  imports: [
    ProfissionalAvatarComponent,
    ProfissionalCadastroFormComponent,
    ProfissionalEnderecoTabComponent,
    ProfissionalComissoesConfigTabComponent,
    ProfissionalUsuarioTabComponent,
    ProfissionalSalariosDrawerComponent,
    ProfissionalValesDrawerComponent,
  ],
  templateUrl: './profissional-cadastro-drawer-host.component.html',
  styleUrl: './profissional-cadastro-drawer-host.component.scss',
  encapsulation: ViewEncapsulation.None,
})
export class ProfissionalCadastroDrawerHostComponent implements OnInit, OnDestroy {
  readonly d = inject(ProfissionalCadastroDrawerService);

  profNavOverflowAberto = false;

  private readonly hostEl = inject(ElementRef<HTMLElement>).nativeElement;
  private restoreBodyPortal: (() => void) | null = null;
  private profNavSuprimirClick = false;
  private profNavPanEl: HTMLElement | null = null;
  private profNavPanPointerId = -1;
  private profNavPanStartX = 0;
  private profNavPanStartScroll = 0;
  private profNavPanAxis: 'x' | null = null;
  private profNavPanStartY = 0;
  private profNavPanMaxDx = 0;

  private static readonly PROF_NAV_PAN_LIMIAR_PX = 5;

  ngOnInit(): void {
    this.restoreBodyPortal = portalHostElementToBody(this.hostEl);
    document.addEventListener('click', this.onDocClick);
  }

  ngOnDestroy(): void {
    document.removeEventListener('click', this.onDocClick);
    this.restoreBodyPortal?.();
    this.restoreBodyPortal = null;
  }

  toggleProfNavOverflow(ev: Event): void {
    ev.stopPropagation();
    this.profNavOverflowAberto = !this.profNavOverflowAberto;
  }

  selecionarAbaNav(ev: Event, aba: ProfCadastroAba): void {
    if (this.profNavSuprimirClick) {
      this.profNavSuprimirClick = false;
      ev.preventDefault();
      return;
    }
    this.d.selecionarAba(aba);
  }

  selecionarAbaOverflow(aba: ProfCadastroAbaOverflow): void {
    if (this.d.abaOverflowDesabilitada(aba)) return;
    if (this.d.isAbaFutura(aba)) return;
    this.d.selecionarAba(aba);
    this.profNavOverflowAberto = false;
  }

  aoProfNavPanInicio(ev: PointerEvent): void {
    if (ev.button !== 0) return;
    const alvo = ev.target;
    if (!(alvo instanceof Element)) return;
    if (alvo.closest('.prof-nav-mobile__more')) return;

    const scroll = ev.currentTarget;
    if (!(scroll instanceof HTMLElement)) return;

    this.profNavPanEl = scroll;
    this.profNavPanPointerId = ev.pointerId;
    this.profNavPanStartX = ev.clientX;
    this.profNavPanStartY = ev.clientY;
    this.profNavPanStartScroll = scroll.scrollLeft;
    this.profNavPanAxis = null;
    this.profNavPanMaxDx = 0;

    scroll.addEventListener('pointermove', this.onProfNavPanDetectMove, {
      passive: true,
    });
    scroll.addEventListener('pointerup', this.onProfNavPanEnd);
    scroll.addEventListener('pointercancel', this.onProfNavPanEnd);
  }

  private readonly onProfNavPanDetectMove = (ev: PointerEvent): void => {
    if (
      ev.pointerId !== this.profNavPanPointerId ||
      !this.profNavPanEl ||
      this.profNavPanAxis != null
    ) {
      return;
    }

    const dx = ev.clientX - this.profNavPanStartX;
    const dy = ev.clientY - this.profNavPanStartY;
    const absDx = Math.abs(dx);

    if (
      absDx < ProfissionalCadastroDrawerHostComponent.PROF_NAV_PAN_LIMIAR_PX &&
      Math.abs(dy) < ProfissionalCadastroDrawerHostComponent.PROF_NAV_PAN_LIMIAR_PX
    ) {
      return;
    }

    if (Math.abs(dy) > absDx) {
      this.cancelarProfNavPan();
      return;
    }

    this.profNavPanAxis = 'x';
    this.profNavPanEl.removeEventListener(
      'pointermove',
      this.onProfNavPanDetectMove,
    );
    try {
      this.profNavPanEl.setPointerCapture(ev.pointerId);
    } catch {
      /* ignorar */
    }
    this.profNavPanEl.addEventListener('pointermove', this.onProfNavPanMove, {
      passive: false,
    });
    this.onProfNavPanMove(ev);
  };

  private readonly onProfNavPanMove = (ev: PointerEvent): void => {
    if (
      ev.pointerId !== this.profNavPanPointerId ||
      !this.profNavPanEl ||
      this.profNavPanAxis !== 'x'
    ) {
      return;
    }

    const dx = ev.clientX - this.profNavPanStartX;
    this.profNavPanMaxDx = Math.max(this.profNavPanMaxDx, Math.abs(dx));
    ev.preventDefault();
    this.profNavPanEl.scrollLeft = this.profNavPanStartScroll - dx;
  };

  private readonly onProfNavPanEnd = (ev: PointerEvent): void => {
    if (ev.pointerId !== this.profNavPanPointerId) return;
    if (
      this.profNavPanAxis === 'x' &&
      this.profNavPanMaxDx >=
        ProfissionalCadastroDrawerHostComponent.PROF_NAV_PAN_LIMIAR_PX
    ) {
      this.profNavSuprimirClick = true;
    }
    this.cancelarProfNavPan();
  };

  private cancelarProfNavPan(): void {
    this.profNavPanEl?.removeEventListener(
      'pointermove',
      this.onProfNavPanDetectMove,
    );
    this.profNavPanEl?.removeEventListener('pointermove', this.onProfNavPanMove);
    this.profNavPanEl?.removeEventListener('pointerup', this.onProfNavPanEnd);
    this.profNavPanEl?.removeEventListener(
      'pointercancel',
      this.onProfNavPanEnd,
    );
    try {
      if (this.profNavPanPointerId >= 0) {
        this.profNavPanEl?.releasePointerCapture?.(this.profNavPanPointerId);
      }
    } catch {
      /* ignorar */
    }
    this.profNavPanEl = null;
    this.profNavPanPointerId = -1;
    this.profNavPanAxis = null;
    this.profNavPanMaxDx = 0;
  }

  private readonly onDocClick = (): void => {
    this.profNavOverflowAberto = false;
  };

  @HostListener('document:keydown.escape', ['$event'])
  onEscape(ev: KeyboardEvent): void {
    if (!this.d.aberto) return;
    if (this.profNavOverflowAberto) {
      ev.preventDefault();
      this.profNavOverflowAberto = false;
      return;
    }
    if (this.d.fecharDrawerSecundarioAtivo()) {
      ev.preventDefault();
      return;
    }
    if (this.d.salvando || this.d.usuarioSalvando) return;
    ev.preventDefault();
    this.d.fechar();
  }
}
