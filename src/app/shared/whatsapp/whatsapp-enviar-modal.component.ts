import {
  Component,
  DestroyRef,
  effect,
  inject,
  input,
  output,
  signal,
} from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { FormsModule } from '@angular/forms';
import { forkJoin } from 'rxjs';
import { WhatsappService } from '../../core/services/whatsapp/whatsapp.service';
import type {
  WhatsappEnviarContexto,
  WhatsappTemplate,
} from '../../core/models/whatsapp.model';
import { telefoneBrDigitos } from '../../core/utils/telefone-br';
import { AppToastService } from '../app-toast/app-toast.service';

@Component({
  selector: 'app-whatsapp-enviar-modal',
  standalone: true,
  imports: [FormsModule],
  templateUrl: './whatsapp-enviar-modal.component.html',
  styleUrl: './whatsapp-enviar-modal.component.scss',
})
export class WhatsappEnviarModalComponent {
  private readonly wa = inject(WhatsappService);
  private readonly toast = inject(AppToastService);
  private readonly destroyRef = inject(DestroyRef);

  readonly aberto = input(false);
  readonly contexto = input<WhatsappEnviarContexto | null>(null);
  readonly salvando = input(false);

  readonly fechar = output<void>();
  readonly enviado = output<void>();

  readonly templates = signal<WhatsappTemplate[]>([]);
  readonly carregandoTemplates = signal(false);
  readonly enviando = signal(false);
  readonly erro = signal<string | null>(null);
  private nomeEmpresa = '';

  modo: 'template' | 'manual' = 'template';
  templateCodigo = '';
  textoManual = '';

  constructor() {
    effect(() => {
      if (!this.aberto()) return;
      this.erro.set(null);
      this.modo = this.contexto()?.templateCodigo ? 'template' : 'template';
      this.templateCodigo = this.contexto()?.templateCodigo ?? 'cobranca';
      this.textoManual = '';
      this.carregarTemplates();
    });
  }

  private carregarTemplates(): void {
    this.carregandoTemplates.set(true);
    forkJoin({
      templates: this.wa.listTemplates(),
      config: this.wa.getConfig(),
    })
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: ({ templates, config }) => {
          this.nomeEmpresa = config.nome_empresa?.trim() ?? '';
          this.templates.set(templates.filter((t) => t.ativo));
          if (!this.templateCodigo && templates.length > 0) {
            this.templateCodigo = templates[0]?.codigo ?? '';
          }
          this.carregandoTemplates.set(false);
        },
        error: () => {
          this.carregandoTemplates.set(false);
        },
      });
  }

  telefoneExibicao(): string {
    const t = this.contexto()?.telefone ?? '';
    const d = telefoneBrDigitos(t);
    if (d.length < 10) return t || '—';
    if (d.length === 11) {
      return `(${d.slice(0, 2)}) ${d.slice(2, 7)}-${d.slice(7)}`;
    }
    return t;
  }

  templateSelecionado(): WhatsappTemplate | null {
    return (
      this.templates().find((t) => t.codigo === this.templateCodigo) ?? null
    );
  }

  preview(): string {
    const vars = this.variaveisMescladas();
    if (this.modo === 'manual') return this.textoManual.trim();
    const tpl = this.templateSelecionado();
    if (!tpl) return '';
    return this.wa.renderTemplatePreview(tpl.corpo, vars);
  }

  private variaveisMescladas(): Record<string, string> {
    const ctx = this.contexto();
    return this.wa.mesclarVariaveisEnvio(ctx?.variaveis, {
      nomeEmpresa: this.nomeEmpresa,
      clienteNome: ctx?.clienteNome,
    });
  }

  onOverlayClick(ev: MouseEvent): void {
    if (ev.target === ev.currentTarget) this.fechar.emit();
  }

  confirmar(): void {
    const ctx = this.contexto();
    const telefone = telefoneBrDigitos(ctx?.telefone);
    if (telefone.length < 10) {
      this.erro.set('Cliente sem telefone válido para WhatsApp.');
      return;
    }

    this.enviando.set(true);
    this.erro.set(null);

    const payload =
      this.modo === 'manual'
        ? {
            telefone,
            cliente_id: ctx?.clienteId,
            id_atendimento: ctx?.idAtendimento,
            texto: this.textoManual.trim(),
          }
        : {
            telefone,
            cliente_id: ctx?.clienteId,
            id_atendimento: ctx?.idAtendimento,
            template_codigo: this.templateCodigo,
            variaveis: this.variaveisMescladas(),
          };

    this.wa
      .sendMessage(payload)
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: () => {
          this.enviando.set(false);
          this.toast.show('Mensagem WhatsApp enviada.');
          this.enviado.emit();
          this.fechar.emit();
        },
        error: (e: Error) => {
          this.enviando.set(false);
          this.erro.set(WhatsappService.errorMessage(e));
        },
      });
  }
}
