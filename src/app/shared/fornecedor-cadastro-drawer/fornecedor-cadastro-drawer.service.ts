import { ApplicationRef, Injectable, inject, signal } from '@angular/core';
import {
  formatarCepBr,
  formatarCnpjBr,
} from '../../core/utils/br-document-masks';
import {
  formatarCelularBr,
  formatarTelefoneFixoBr,
} from '../../core/utils/telefone-br';
import { AppToastService } from '../app-toast/app-toast.service';
import {
  DRAWER_ANIM_MS,
  beginDrawerCloseAnimation,
  runDrawerOpenAnimation,
  type DrawerOpenAnimHandle,
} from '../drawer-panel-anim';

/**
 * Drawer «Novo fornecedor» (UI stub — sem API ainda).
 */
@Injectable({ providedIn: 'root' })
export class FornecedorCadastroDrawerService {
  private readonly toast = inject(AppToastService);
  private readonly appRef = inject(ApplicationRef);

  readonly aberto = signal(false);
  readonly panelOpen = signal(false);

  nome = '';
  email = '';
  celular = '';
  telefone = '';
  inscricaoEstadual = '';
  cnpj = '';
  ativo = true;

  cep = '';
  logradouro = '';
  numero = '';
  complemento = '';
  bairro = '';
  estado = '';
  cidade = '';
  secaoEnderecoAberta = false;

  salvando = false;
  nomeErro = false;

  private closeTimer: ReturnType<typeof setTimeout> | null = null;
  private openAnim: DrawerOpenAnimHandle | null = null;

  abrirNovo(): void {
    if (this.closeTimer != null) {
      clearTimeout(this.closeTimer);
      this.closeTimer = null;
    }
    this.openAnim?.cancel();
    this.resetForm();
    this.aberto.set(true);
    this.openAnim = runDrawerOpenAnimation({
      setPanelOpen: (open) => this.panelOpen.set(open),
      appRef: this.appRef,
      reflowSelector: '.fornecedor-cadastro-drawer.app-drawer',
      onOpened: () => this.focarNome(),
    });
  }

  fechar(): void {
    if (!this.aberto() || this.salvando) return;
    this.openAnim?.cancel();
    this.openAnim = null;
    beginDrawerCloseAnimation({
      setPanelOpen: (open) => this.panelOpen.set(open),
      appRef: this.appRef,
    });
    if (this.closeTimer != null) clearTimeout(this.closeTimer);
    this.closeTimer = setTimeout(() => {
      this.closeTimer = null;
      this.aberto.set(false);
      this.resetForm();
    }, DRAWER_ANIM_MS);
  }

  onNomeInput(): void {
    if (this.nomeErro && this.nome.trim()) this.nomeErro = false;
  }

  onCelularChange(v: string): void {
    this.celular = formatarCelularBr(v);
  }

  onTelefoneChange(v: string): void {
    this.telefone = formatarTelefoneFixoBr(v);
  }

  onCnpjChange(v: string): void {
    this.cnpj = formatarCnpjBr(v);
  }

  onCepChange(v: string): void {
    this.cep = formatarCepBr(v);
  }

  toggleAtivo(ev: Event): void {
    if (this.salvando) return;
    this.ativo = !this.ativo;
    const el = ev.currentTarget as HTMLElement | null;
    if (!el) return;
    el.classList.remove('drawer-switch--pulse');
    void el.offsetWidth;
    el.classList.add('drawer-switch--pulse');
    window.setTimeout(() => el.classList.remove('drawer-switch--pulse'), 1500);
  }

  salvar(): void {
    const nome = this.nome.trim();
    if (this.salvando) return;
    if (!nome) {
      this.nomeErro = true;
      this.focarNome();
      return;
    }
    this.nomeErro = false;
    this.salvando = true;
    // Stub: sem API de fornecedor ainda.
    window.setTimeout(() => {
      this.salvando = false;
      this.toast.show('Cadastro de fornecedores em breve.');
      this.fechar();
    }, 280);
  }

  private resetForm(): void {
    this.nome = '';
    this.email = '';
    this.celular = '';
    this.telefone = '';
    this.inscricaoEstadual = '';
    this.cnpj = '';
    this.ativo = true;
    this.cep = '';
    this.logradouro = '';
    this.numero = '';
    this.complemento = '';
    this.bairro = '';
    this.estado = '';
    this.cidade = '';
    this.secaoEnderecoAberta = false;
    this.salvando = false;
    this.nomeErro = false;
  }

  private focarNome(): void {
    queueMicrotask(() => {
      document.getElementById('fornecedor-cadastro-drawer-nome')?.focus();
    });
  }
}
