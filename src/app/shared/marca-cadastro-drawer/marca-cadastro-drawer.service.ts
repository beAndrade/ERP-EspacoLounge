import { ApplicationRef, Injectable, inject, signal } from '@angular/core';
import { SheetsApiService } from '../../core/services/sheets-api.service';
import { AppToastService } from '../app-toast/app-toast.service';
import { extractApiErrorMessage } from '../../core/utils/api-error-message';
import {
  DRAWER_ANIM_MS,
  beginDrawerCloseAnimation,
  runDrawerOpenAnimation,
  type DrawerOpenAnimHandle,
} from '../drawer-panel-anim';

export type MarcaDrawerCallbacks = {
  onSalvo?: (nome: string) => void;
};

@Injectable({ providedIn: 'root' })
export class MarcaCadastroDrawerService {
  private readonly api = inject(SheetsApiService);
  private readonly toast = inject(AppToastService);
  private readonly appRef = inject(ApplicationRef);

  readonly aberto = signal(false);
  readonly panelOpen = signal(false);

  nome = '';
  ativo = true;
  salvando = false;
  nomeErro = false;

  private callbacks: MarcaDrawerCallbacks | null = null;
  private closeTimer: ReturnType<typeof setTimeout> | null = null;
  private openAnim: DrawerOpenAnimHandle | null = null;

  abrirNovo(opts?: MarcaDrawerCallbacks): void {
    if (this.closeTimer != null) {
      clearTimeout(this.closeTimer);
      this.closeTimer = null;
    }
    this.openAnim?.cancel();
    this.callbacks = opts ?? null;
    this.nome = '';
    this.ativo = true;
    this.salvando = false;
    this.nomeErro = false;
    this.aberto.set(true);
    this.openAnim = runDrawerOpenAnimation({
      setPanelOpen: (open) => this.panelOpen.set(open),
      appRef: this.appRef,
      reflowSelector: '.marca-cadastro-drawer.app-drawer',
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
      this.nome = '';
      this.ativo = true;
      this.nomeErro = false;
      this.salvando = false;
    }, DRAWER_ANIM_MS);
  }

  onNomeInput(): void {
    if (this.nomeErro && this.nome.trim()) {
      this.nomeErro = false;
    }
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
    this.api.criarMarcaCatalogo({ nome, ativo: this.ativo }).subscribe({
      next: () => {
        this.salvando = false;
        const onSalvo = this.callbacks?.onSalvo;
        this.toast.show('Marca salva com sucesso!');
        this.fechar();
        onSalvo?.(nome);
      },
      error: (e: unknown) => {
        this.salvando = false;
        this.toast.show(
          extractApiErrorMessage(e) || 'Não foi possível salvar a marca.',
        );
      },
    });
  }

  private focarNome(): void {
    queueMicrotask(() => {
      document.getElementById('marca-cadastro-drawer-nome')?.focus();
    });
  }
}
