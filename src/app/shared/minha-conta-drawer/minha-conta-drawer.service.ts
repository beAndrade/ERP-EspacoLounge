import { ApplicationRef, Injectable, inject } from '@angular/core';
import { finalize } from 'rxjs';
import { AuthService } from '../../core/services/auth.service';
import { extractApiErrorMessage } from '../../core/utils/api-error-message';
import { AppToastService } from '../app-toast/app-toast.service';
import {
  DRAWER_ANIM_MS,
  beginDrawerCloseAnimation,
  runDrawerOpenAnimation,
  type DrawerOpenAnimHandle,
} from '../drawer-panel-anim';

export type MinhaContaAba = 'Alterar e-mail' | 'Alterar senha';

@Injectable({ providedIn: 'root' })
export class MinhaContaDrawerService {
  private readonly auth = inject(AuthService);
  private readonly toast = inject(AppToastService);
  private readonly appRef = inject(ApplicationRef);

  aberto = false;
  panelOpen = false;
  abaAtiva: MinhaContaAba = 'Alterar e-mail';
  readonly abas: readonly MinhaContaAba[] = [
    'Alterar e-mail',
    'Alterar senha',
  ];

  email = '';
  emailSenhaAtual = '';
  senhaAtual = '';
  senhaNova = '';
  senhaNovaConfirmacao = '';

  mostrarEmailSenha = false;
  mostrarSenhaAtual = false;
  mostrarSenhaNova = false;
  mostrarSenhaConfirmacao = false;

  salvando = false;
  saveErro = '';

  private closeTimer: ReturnType<typeof setTimeout> | null = null;
  private openAnim: DrawerOpenAnimHandle | null = null;
  private bodyScrollPreDrawer = 0;
  private pageScrollLockAtivo = false;

  abrir(): void {
    const u = this.auth.user();
    this.email = u?.email ?? '';
    this.emailSenhaAtual = '';
    this.senhaAtual = '';
    this.senhaNova = '';
    this.senhaNovaConfirmacao = '';
    this.abaAtiva = 'Alterar e-mail';
    this.saveErro = '';
    this.salvando = false;
    this.openAnim?.cancel();
    this.aberto = true;
    this.bloquearScrollPagina();
    this.openAnim = runDrawerOpenAnimation({
      setPanelOpen: (open) => {
        this.panelOpen = open;
      },
      appRef: this.appRef,
      reflowSelector:
        'app-minha-conta-drawer-host .app-drawer, .minha-conta-drawer',
    });
  }

  fechar(): void {
    if (!this.aberto) return;
    this.openAnim?.cancel();
    this.openAnim = null;
    beginDrawerCloseAnimation({
      setPanelOpen: (open) => {
        this.panelOpen = open;
      },
      appRef: this.appRef,
    });
    if (this.closeTimer != null) clearTimeout(this.closeTimer);
    this.closeTimer = setTimeout(() => {
      this.closeTimer = null;
      this.aberto = false;
      this.desbloquearScrollPagina();
    }, DRAWER_ANIM_MS);
  }

  selecionarAba(aba: MinhaContaAba): void {
    this.abaAtiva = aba;
    this.saveErro = '';
  }

  abaAtivaIndex(): number {
    return this.abas.indexOf(this.abaAtiva);
  }

  salvar(): void {
    this.saveErro = '';
    if (this.abaAtiva === 'Alterar e-mail') {
      this.salvarEmail();
    } else {
      this.salvarSenha();
    }
  }

  private salvarEmail(): void {
    const email = this.email.trim();
    const senha = this.emailSenhaAtual;
    if (!email || !senha) {
      this.saveErro = 'E-mail e senha atual são obrigatórios.';
      return;
    }
    this.salvando = true;
    this.auth
      .alterarEmail(email, senha)
      .pipe(finalize(() => (this.salvando = false)))
      .subscribe({
        next: () => {
          this.emailSenhaAtual = '';
          this.toast.show('E-mail atualizado com sucesso.');
          this.fechar();
        },
        error: (e: unknown) => {
          this.saveErro =
            extractApiErrorMessage(e) ??
            'Não foi possível alterar o e-mail.';
        },
      });
  }

  private salvarSenha(): void {
    if (!this.senhaAtual || !this.senhaNova || !this.senhaNovaConfirmacao) {
      this.saveErro = 'Preencha todos os campos de senha.';
      return;
    }
    if (this.senhaNova !== this.senhaNovaConfirmacao) {
      this.saveErro = 'A confirmação da nova senha não coincide.';
      return;
    }
    this.salvando = true;
    this.auth
      .alterarSenha(
        this.senhaAtual,
        this.senhaNova,
        this.senhaNovaConfirmacao,
      )
      .pipe(finalize(() => (this.salvando = false)))
      .subscribe({
        next: () => {
          this.toast.show('Senha alterada. Faça login novamente.');
        },
        error: (e: unknown) => {
          this.salvando = false;
          this.saveErro =
            extractApiErrorMessage(e) ??
            'Não foi possível alterar a senha.';
        },
      });
  }

  private bloquearScrollPagina(): void {
    if (this.pageScrollLockAtivo) return;
    this.bodyScrollPreDrawer = window.scrollY || 0;
    const body = document.body;
    body.style.position = 'fixed';
    body.style.top = `-${this.bodyScrollPreDrawer}px`;
    body.style.left = '0';
    body.style.right = '0';
    body.style.width = '100%';
    this.pageScrollLockAtivo = true;
  }

  private desbloquearScrollPagina(): void {
    if (!this.pageScrollLockAtivo) return;
    const body = document.body;
    body.style.position = '';
    body.style.top = '';
    body.style.left = '';
    body.style.right = '';
    body.style.width = '';
    this.pageScrollLockAtivo = false;
    window.scrollTo(0, this.bodyScrollPreDrawer);
  }
}
