import { ApplicationRef, Injectable, inject, signal } from '@angular/core';
import { Subject } from 'rxjs';
import type { FornecedorItem } from '../../core/models/api.models';
import { SheetsApiService } from '../../core/services/sheets-api.service';
import { extractApiErrorMessage } from '../../core/utils/api-error-message';
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

export type FornecedorDrawerCallbacks = {
  onSalvo?: (item: FornecedorItem) => void;
};

/**
 * Drawer de cadastro/edição de fornecedor (CRUD real).
 */
@Injectable({ providedIn: 'root' })
export class FornecedorCadastroDrawerService {
  private readonly api = inject(SheetsApiService);
  private readonly toast = inject(AppToastService);
  private readonly appRef = inject(ApplicationRef);

  readonly salvo$ = new Subject<FornecedorItem>();
  readonly aberto = signal(false);
  readonly panelOpen = signal(false);

  modo: 'novo' | 'editar' = 'novo';
  editandoId: number | null = null;

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

  private callbacks: FornecedorDrawerCallbacks | null = null;
  private closeTimer: ReturnType<typeof setTimeout> | null = null;
  private openAnim: DrawerOpenAnimHandle | null = null;

  get titulo(): string {
    return this.modo === 'editar' ? 'Editar fornecedor' : 'Novo fornecedor';
  }

  abrirNovo(opts?: FornecedorDrawerCallbacks): void {
    if (this.closeTimer != null) {
      clearTimeout(this.closeTimer);
      this.closeTimer = null;
    }
    this.openAnim?.cancel();
    this.resetForm();
    this.modo = 'novo';
    this.editandoId = null;
    this.callbacks = opts ?? null;
    this.aberto.set(true);
    this.openAnim = runDrawerOpenAnimation({
      setPanelOpen: (open) => this.panelOpen.set(open),
      appRef: this.appRef,
      reflowSelector: '.fornecedor-cadastro-drawer.app-drawer',
      onOpened: () => this.focarNome(),
    });
  }

  abrirEditar(item: FornecedorItem, opts?: FornecedorDrawerCallbacks): void {
    if (this.closeTimer != null) {
      clearTimeout(this.closeTimer);
      this.closeTimer = null;
    }
    this.openAnim?.cancel();
    this.resetForm();
    this.modo = 'editar';
    this.editandoId = item.id;
    this.callbacks = opts ?? null;
    this.preencherForm(item);
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
      this.callbacks = null;
      this.modo = 'novo';
      this.editandoId = null;
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

    const payload = {
      nome,
      email: this.email.trim() || null,
      celular: this.celular.trim() || null,
      telefone: this.telefone.trim() || null,
      inscricaoEstadual: this.inscricaoEstadual.trim() || null,
      cnpj: this.cnpj.trim() || null,
      ativo: this.ativo,
      cep: this.cep.trim() || null,
      logradouro: this.logradouro.trim() || null,
      numero: this.numero.trim() || null,
      complemento: this.complemento.trim() || null,
      bairro: this.bairro.trim() || null,
      estado: this.estado.trim() || null,
      cidade: this.cidade.trim() || null,
    };

    const editandoId = this.editandoId;
    const modo = this.modo;

    const onOk = (id: number) => {
      this.salvando = false;
      const item: FornecedorItem = {
        id,
        ...payload,
        ativo: this.ativo,
      };
      this.toast.show(
        modo === 'editar'
          ? 'Fornecedor atualizado com sucesso!'
          : 'Fornecedor salvo com sucesso!',
      );
      const onSalvo = this.callbacks?.onSalvo;
      this.salvo$.next(item);
      this.fechar();
      onSalvo?.(item);
    };

    const onErr = (e: unknown) => {
      this.salvando = false;
      this.toast.show(
        extractApiErrorMessage(e) || 'Não foi possível salvar o fornecedor.',
      );
    };

    if (modo === 'editar' && editandoId != null) {
      this.api.atualizarFornecedor(editandoId, payload).subscribe({
        next: () => onOk(editandoId),
        error: onErr,
      });
    } else {
      this.api.criarFornecedor(payload).subscribe({
        next: (res) => onOk(res.id),
        error: onErr,
      });
    }
  }

  private preencherForm(item: FornecedorItem): void {
    this.nome = String(item.nome ?? '');
    this.email = String(item.email ?? '');
    this.celular = String(item.celular ?? '');
    this.telefone = String(item.telefone ?? '');
    this.inscricaoEstadual = String(item.inscricaoEstadual ?? '');
    this.cnpj = String(item.cnpj ?? '');
    this.ativo = item.ativo !== false;
    this.cep = String(item.cep ?? '');
    this.logradouro = String(item.logradouro ?? '');
    this.numero = String(item.numero ?? '');
    this.complemento = String(item.complemento ?? '');
    this.bairro = String(item.bairro ?? '');
    this.estado = String(item.estado ?? '');
    this.cidade = String(item.cidade ?? '');
    this.secaoEnderecoAberta = Boolean(
      this.cep ||
        this.logradouro ||
        this.numero ||
        this.complemento ||
        this.bairro ||
        this.estado ||
        this.cidade,
    );
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
