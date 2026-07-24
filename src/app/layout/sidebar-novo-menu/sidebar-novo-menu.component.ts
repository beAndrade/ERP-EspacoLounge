import {

  Component,

  ElementRef,

  HostListener,

  Input,

  OnDestroy,

  ViewChild,

  inject,

} from '@angular/core';

import { Router } from '@angular/router';

import { SessaoUsuarioService } from '../../core/services/sessao-usuario.service';

import { ClienteCadastroDrawerService } from '../../shared/cliente-cadastro-drawer/cliente-cadastro-drawer.service';

import { ProfissionalCadastroDrawerService } from '../../shared/profissional-cadastro-drawer/profissional-cadastro-drawer.service';

import { ServicoCadastroDrawerService } from '../../shared/servico-cadastro-drawer/servico-cadastro-drawer.service';

import { AppToastService } from '../../shared/app-toast/app-toast.service';

import { FinTransacaoNovoDrawerService } from '../../shared/fin-transacao-novo-drawer/fin-transacao-novo-drawer.service';

import { SidebarFlyoutService } from '../sidebar-flyout.service';



type ShortcutId =

  | 'agendamento'

  | 'comanda'

  | 'orcamento'

  | 'pacote'

  | 'pacote-predef'

  | 'cliente'

  | 'servico'

  | 'produto'

  | 'categoria'

  | 'profissional'

  | 'fornecedor'

  | 'compra'

  | 'marca'

  | 'recebimento'

  | 'despesa'

  | 'vale'

  | 'transferencia';



interface ShortcutItem {

  id: ShortcutId;

  label: string;

  adminOnly?: boolean;

}



interface ShortcutSection {

  title: string;

  adminOnly?: boolean;

  items: ShortcutItem[];

}



@Component({

  selector: 'app-sidebar-novo-menu',

  standalone: true,

  host: {
    '[class.sidebar-novo-host--open]': 'menuAberto',
  },

  templateUrl: './sidebar-novo-menu.component.html',

  styleUrl: './sidebar-novo-menu.component.scss',

})

export class SidebarNovoMenuComponent implements OnDestroy {

  private readonly router = inject(Router);

  private readonly sessao = inject(SessaoUsuarioService);

  private readonly clienteDrawer = inject(ClienteCadastroDrawerService);

  private readonly profDrawer = inject(ProfissionalCadastroDrawerService);

  private readonly servicoDrawer = inject(ServicoCadastroDrawerService);

  private readonly toast = inject(AppToastService);

  private readonly finNovoDrawer = inject(FinTransacaoNovoDrawerService);

  private readonly flyout = inject(SidebarFlyoutService);

  private readonly hostEl = inject(ElementRef<HTMLElement>);



  @Input() collapsed = false;



  @ViewChild('novoBtn') novoBtn?: ElementRef<HTMLButtonElement>;

  @ViewChild('novoPanel') novoPanel?: ElementRef<HTMLElement>;

  private panelRestoreParent: (() => void) | null = null;

  menuAberto = false;

  panelTop = 0;

  panelLeft = 0;



  readonly sections: ShortcutSection[] = [

    {

      title: 'Principal',

      items: [

        { id: 'agendamento', label: 'Agendamento' },

        { id: 'comanda', label: 'Comanda' },

        { id: 'orcamento', label: 'Orçamento' },

        { id: 'pacote', label: 'Pacote' },

        { id: 'pacote-predef', label: 'Pacote Predefinido' },

      ],

    },

    {

      title: 'Cadastros',

      items: [

        { id: 'cliente', label: 'Cliente' },

        { id: 'servico', label: 'Serviço', adminOnly: true },

        { id: 'produto', label: 'Produto', adminOnly: true },

        { id: 'categoria', label: 'Categoria', adminOnly: true },

        { id: 'profissional', label: 'Profissional', adminOnly: true },

        { id: 'fornecedor', label: 'Fornecedor', adminOnly: true },

        { id: 'compra', label: 'Compra', adminOnly: true },

        { id: 'marca', label: 'Marca', adminOnly: true },

      ],

    },

    {

      title: 'Financeiro',

      adminOnly: true,

      items: [

        { id: 'recebimento', label: 'Recebimento', adminOnly: true },

        { id: 'despesa', label: 'Despesa', adminOnly: true },

        { id: 'vale', label: 'Vale', adminOnly: true },

        { id: 'transferencia', label: 'Transferência', adminOnly: true },

      ],

    },

  ];



  sectionsVisiveis(): ShortcutSection[] {

    const admin = this.sessao.isAdmin();

    return this.sections

      .filter((s) => !s.adminOnly || admin)

      .map((s) => ({

        ...s,

        items: s.items.filter((i) => !i.adminOnly || admin),

      }))

      .filter((s) => s.items.length > 0);

  }



  toggleMenu(ev: Event): void {

    ev.preventDefault();

    ev.stopPropagation();

    if (this.menuAberto) {

      this.fecharMenu();

      return;

    }

    this.flyout.open(() => this.fecharMenu());

    this.menuAberto = true;

    requestAnimationFrame(() => {
      requestAnimationFrame(() => {
        this.portalizarPanel();
        this.atualizarPosicaoPanel();
      });
    });

  }



  fecharMenu(): void {

    if (!this.menuAberto) return;

    this.menuAberto = false;

    this.restaurarPanelPortal();

    this.flyout.release(() => this.fecharMenu());

  }



  ngOnDestroy(): void {

    this.restaurarPanelPortal();

  }



  /** Painel em `body` para não ficar atrás da sidebar / conteúdo principal. */
  private portalizarPanel(): void {

    const el = this.novoPanel?.nativeElement;

    if (!el || this.panelRestoreParent) return;

    const parent = el.parentElement;

    const next = el.nextSibling;

    document.body.appendChild(el);

    this.panelRestoreParent = () => {

      if (!parent) return;

      if (next && next.parentNode === parent) {

        parent.insertBefore(el, next);

      } else {

        parent.appendChild(el);

      }

    };

  }



  private restaurarPanelPortal(): void {

    this.panelRestoreParent?.();

    this.panelRestoreParent = null;

  }



  private atualizarPosicaoPanel(): void {

    const btn =

      this.novoBtn?.nativeElement ??

      this.hostEl.nativeElement.querySelector(

        '.sidebar-novo__btn',

      ) as HTMLButtonElement | null;

    if (!btn) return;

    const r = btn.getBoundingClientRect();

    const panel = this.novoPanel?.nativeElement;

    const panelW = panel?.offsetWidth ?? 420;

    const gap = 8;

    let left = r.left;

    const top = r.bottom + gap;

    const margin = 8;

    left = Math.max(

      margin,

      Math.min(left, window.innerWidth - panelW - margin),

    );

    this.panelTop = top;

    this.panelLeft = left;

  }



  executar(id: ShortcutId): void {

    this.fecharMenu();

    switch (id) {

      case 'agendamento':

        void this.router.navigate(['/agenda'], {

          queryParams: { abrirNovoAgendamento: '1' },

        });

        break;

      case 'comanda':
        void this.router.navigate(['/comandas'], {
          queryParams: { abrirNovaComanda: '1' },
        });
        break;

      case 'orcamento':
        void this.router.navigate(['/orcamentos'], {
          queryParams: { abrirNovoOrcamento: '1' },
        });
        break;

      case 'pacote':
        void this.router.navigate(['/pacotes']);
        break;

      case 'pacote-predef':
        this.toast.show('Pacote Predefinido — em breve.');
        break;

      case 'cliente':

        this.clienteDrawer.abrirNovo('');

        break;

      case 'servico':

        this.servicoDrawer.abrirNovo();

        break;

      case 'produto':

        void this.router.navigate(['/estoque']);

        break;

      case 'categoria':

        void this.router.navigate(['/categorias']);

        break;

      case 'profissional':

        this.profDrawer.abrirNovo();

        break;

      case 'fornecedor':

        void this.router.navigate(['/fornecedores']);

        break;

      case 'compra':

        void this.router.navigate(['/compras']);

        break;

      case 'marca':

        void this.router.navigate(['/marcas']);

        break;

      case 'recebimento':

        this.finNovoDrawer.abrir('receita');

        break;

      case 'despesa':

        this.finNovoDrawer.abrir('despesa');

        break;

      case 'vale':

        this.finNovoDrawer.abrir('vale');

        break;

      case 'transferencia':

        this.finNovoDrawer.abrir('transferencia');

        break;

    }

  }



  @HostListener('document:click', ['$event'])

  onDocumentClick(ev: MouseEvent): void {

    if (!this.menuAberto) return;

    const t = ev.target as Node | null;

    if (t && this.hostEl.nativeElement.contains(t)) return;

    const panel = document.querySelector('.sidebar-novo__panel--fixed');

    if (t && panel?.contains(t)) return;

    this.fecharMenu();

  }



  @HostListener('window:resize')

  @HostListener('window:scroll')

  onViewportChange(): void {

    if (this.menuAberto) this.atualizarPosicaoPanel();

  }

}


