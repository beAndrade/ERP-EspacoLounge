import { Component, DestroyRef, inject, OnInit, signal } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { FormsModule } from '@angular/forms';
import { WhatsappService } from '../../../../core/services/whatsapp/whatsapp.service';
import type { WhatsappTemplate } from '../../../../core/models/whatsapp.model';
import { WHATSAPP_PLACEHOLDERS } from '../../../../core/models/whatsapp.model';
import { AppToastService } from '../../../../shared/app-toast/app-toast.service';

@Component({
  selector: 'app-whatsapp-templates-tab',
  standalone: true,
  imports: [FormsModule],
  templateUrl: './whatsapp-templates-tab.component.html',
  styleUrl: './whatsapp-templates-tab.component.scss',
})
export class WhatsappTemplatesTabComponent implements OnInit {
  private readonly wa = inject(WhatsappService);
  private readonly toast = inject(AppToastService);
  private readonly destroyRef = inject(DestroyRef);

  readonly placeholders = WHATSAPP_PLACEHOLDERS;
  readonly carregando = signal(true);
  readonly salvandoId = signal<number | null>(null);
  readonly erro = signal<string | null>(null);
  readonly templates = signal<WhatsappTemplate[]>([]);

  ngOnInit(): void {
    this.carregar();
  }

  carregar(): void {
    this.carregando.set(true);
    this.wa
      .listTemplates()
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: (items) => {
          this.templates.set(items);
          this.carregando.set(false);
        },
        error: (e: Error) => {
          this.erro.set(WhatsappService.errorMessage(e));
          this.carregando.set(false);
        },
      });
  }

  salvar(tpl: WhatsappTemplate): void {
    this.salvandoId.set(tpl.id);
    this.wa
      .updateTemplate(tpl.id, {
        corpo: tpl.corpo,
        ativo: tpl.ativo,
        nome: tpl.nome,
      })
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: () => {
          this.salvandoId.set(null);
          this.toast.show(`Template «${tpl.nome}» atualizado.`);
        },
        error: (e: Error) => {
          this.erro.set(WhatsappService.errorMessage(e));
          this.salvandoId.set(null);
        },
      });
  }

  preview(corpo: string): string {
    return this.wa.renderTemplatePreview(
      corpo,
      this.wa.mesclarVariaveisEnvio({
        cliente: 'Maria',
        data: '30/06/2026',
        hora: '14:00',
        valor: 'R$ 150,00',
      }, { nomeEmpresa: 'Espaço Lounge', clienteNome: 'Maria' }),
    );
  }

  placeholderExemplo(ph: string): string {
    return `{{${ph}}}`;
  }
}
