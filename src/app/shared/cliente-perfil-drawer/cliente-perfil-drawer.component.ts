import {
  Component,
  EventEmitter,
  Input,
  OnChanges,
  Output,
  SimpleChanges,
  ViewEncapsulation,
  inject,
} from '@angular/core';
import { CurrencyPipe } from '@angular/common';
import { Cliente } from '../../core/models/api.models';
import { ClienteCadastroDrawerService } from '../cliente-cadastro-drawer/cliente-cadastro-drawer.service';
import { ClienteCadastroFormComponent } from '../cliente-cadastro-drawer/cliente-cadastro-form.component';

export const CLIENTE_PERFIL_ABAS = [
  'Cadastro',
  'Painel',
  'Débitos',
  'Créditos',
  'Cashback',
  'Agendamentos',
  'Vendas',
  'Pacotes',
  'Mensagens',
  'Anotações',
  'Imagens e Arquivos',
  'Anamneses',
  'Vendas por Assinatura',
] as const;

export type ClientePerfilAba = (typeof CLIENTE_PERFIL_ABAS)[number];

@Component({
  selector: 'app-cliente-perfil-drawer',
  standalone: true,
  imports: [CurrencyPipe, ClienteCadastroFormComponent],
  templateUrl: './cliente-perfil-drawer.component.html',
  styleUrl: './cliente-perfil-drawer.component.scss',
  encapsulation: ViewEncapsulation.None,
})
export class ClientePerfilDrawerComponent implements OnChanges {
  readonly cadastro = inject(ClienteCadastroDrawerService);

  @Input() panelOpen = false;
  @Input() cliente: Cliente | null = null;
  @Input() abaAtiva: ClientePerfilAba = 'Painel';
  @Input() carregando = false;

  @Output() fechar = new EventEmitter<void>();
  @Output() abaAtivaChange = new EventEmitter<ClientePerfilAba>();
  @Output() clienteAtualizado = new EventEmitter<Cliente>();
  @Output() salvoComSucesso = new EventEmitter<void>();

  readonly abas = CLIENTE_PERFIL_ABAS;

  ngOnChanges(changes: SimpleChanges): void {
    if (changes['abaAtiva']) {
      const prev = changes['abaAtiva'].previousValue as ClientePerfilAba | undefined;
      const cur = changes['abaAtiva'].currentValue as ClientePerfilAba;
      if (prev === 'Cadastro' && cur !== 'Cadastro') {
        this.cadastro.desanexarEmbutido();
      }
      if (cur === 'Cadastro') {
        queueMicrotask(() => this.sincronizarCadastroEmbutido());
      }
    }
    if (changes['cliente'] && this.abaAtiva === 'Cadastro') {
      this.sincronizarCadastroEmbutido();
    }
  }

  tituloCabecalho(): string {
    return this.cliente?.nome?.trim() || 'Cliente';
  }

  /** Foto no cabeçalho: pré-visualização do cadastro ou foto guardada do cliente. */
  fotoUrl(): string | null {
    if (this.abaAtiva === 'Cadastro' && this.cadastro.fotoRemovidaNoFormulario) {
      return null;
    }
    if (this.abaAtiva === 'Cadastro') {
      const preview = this.cadastro.cadastroFotoUrl?.trim();
      if (preview) return preview;
    }
    const url = this.cliente?.fotoUrl?.trim();
    return url || null;
  }

  abaAtivaIndex(): number {
    const ix = this.abas.indexOf(this.abaAtiva);
    return ix >= 0 ? ix : 1;
  }

  selecionarAba(aba: ClientePerfilAba): void {
    if (this.abaAtiva === aba) return;

    if (this.abaAtiva === 'Cadastro' && aba !== 'Cadastro') {
      this.cadastro.desanexarEmbutido();
    }

    this.abaAtivaChange.emit(aba);
  }

  onVoltarDoCadastro(): void {
    if (this.cadastro.embutidoAtivo) {
      this.cadastro.desanexarEmbutido();
    }
    if (this.abaAtiva === 'Cadastro') {
      this.abaAtivaChange.emit('Painel');
    }
  }

  onFechar(): void {
    if (this.cadastro.embutidoAtivo) {
      this.cadastro.desanexarEmbutido();
    }
    this.fechar.emit();
  }

  private sincronizarCadastroEmbutido(): void {
    const id = this.cliente?.id?.trim();
    if (!id) return;

    this.cadastro.anexarEdicaoEmbutida(id, {
      nomeLista: this.cliente?.nome?.trim() ?? '',
      fotoUrlInicial: this.cliente?.fotoUrl,
      callbacks: {
        onSalvo: (c) => {
          this.clienteAtualizado.emit(c);
          this.salvoComSucesso.emit();
        },
        onClienteCarregado: (c) => this.clienteAtualizado.emit(c),
      },
    });
  }
}
