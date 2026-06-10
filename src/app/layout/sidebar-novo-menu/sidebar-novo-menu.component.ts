import {

  Component,

  ElementRef,

  HostListener,

  Input,

  ViewChild,

  inject,

} from '@angular/core';

import { Router } from '@angular/router';

import { SessaoUsuarioService } from '../../core/services/sessao-usuario.service';

import { ClienteCadastroDrawerService } from '../../shared/cliente-cadastro-drawer/cliente-cadastro-drawer.service';

import { ProfissionalCadastroDrawerService } from '../../shared/profissional-cadastro-drawer/profissional-cadastro-drawer.service';

import { AppToastService } from '../../shared/app-toast/app-toast.service';

import { SidebarFlyoutService } from '../sidebar-flyout.service';



type ShortcutId =

  | 'agendamento'

  | 'comanda'

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

  templateUrl: './sidebar-novo-menu.component.html',

  styleUrl: './sidebar-novo-menu.component.scss',

})

export class SidebarNovoMenuComponent {

  private readonly router = inject(Router);

  private readonly sessao = inject(SessaoUsuarioService);

  private readonly clienteDrawer = inject(ClienteCadastroDrawerService);

  private readonly profDrawer = inject(ProfissionalCadastroDrawerService);

  private readonly toast = inject(AppToastService);

  private readonly flyout = inject(SidebarFlyoutService);

  private readonly hostEl = inject(ElementRef<HTMLElement>);



  @Input() collapsed = false;



  @ViewChild('novoBtn') novoBtn?: ElementRef<HTMLButtonElement>;



  menuAberto = false;

  panelTop = 0;

  panelLeft = 0;



  readonly sections: ShortcutSection[] = [

    {

      title: 'Principal',

      items: [

        { id: 'agendamento', label: 'Agendamento' },

        { id: 'comanda', label: 'Comanda' },

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

    requestAnimationFrame(() => this.atualizarPosicaoPanel());

  }



  fecharMenu(): void {

    if (!this.menuAberto) return;

    this.menuAberto = false;

    this.flyout.release(() => this.fecharMenu());

  }



  private atualizarPosicaoPanel(): void {

    const btn =

      this.novoBtn?.nativeElement ??

      this.hostEl.nativeElement.querySelector(

        '.sidebar-novo__btn',

      ) as HTMLButtonElement | null;

    if (!btn) return;

    const r = btn.getBoundingClientRect();

    this.panelTop = r.top;

    this.panelLeft = r.right + 12;

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

        void this.router.navigate(['/agenda'], {

          queryParams: { abrirNovaComanda: '1' },

        });

        break;

      case 'pacote':

        void this.router.navigate(['/pacotes']);

        break;

      case 'pacote-predef':

        void this.router.navigate(['/pacotes/predefinidos']);

        break;

      case 'cliente':

        this.clienteDrawer.abrirNovo('');

        break;

      case 'servico':

        void this.router.navigate(['/servicos']);

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

        void this.router.navigate(['/financeiro/transacoes'], {

          queryParams: { novo: 'receita' },

        });

        break;

      case 'despesa':

        void this.router.navigate(['/financeiro/transacoes'], {

          queryParams: { novo: 'despesa' },

        });

        break;

      case 'vale':

        void this.router.navigate(['/financeiro/transacoes'], {

          queryParams: { novo: 'vale' },

        });

        break;

      case 'transferencia':

        this.toast.show('Transferência — em breve.');

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


