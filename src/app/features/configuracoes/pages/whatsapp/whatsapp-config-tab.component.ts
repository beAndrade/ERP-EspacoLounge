import { DatePipe } from '@angular/common';
import { Component, DestroyRef, inject, OnInit, signal } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { FormsModule } from '@angular/forms';
import { WhatsappService } from '../../../../core/services/whatsapp/whatsapp.service';
import type { WhatsappConfig, WhatsappConnectionStatus } from '../../../../core/models/whatsapp.model';
import { AppToastService } from '../../../../shared/app-toast/app-toast.service';

@Component({
  selector: 'app-whatsapp-config-tab',
  standalone: true,
  imports: [FormsModule, DatePipe],
  templateUrl: './whatsapp-config-tab.component.html',
  styleUrl: './whatsapp-config-tab.component.scss',
})
export class WhatsappConfigTabComponent implements OnInit {
  private readonly wa = inject(WhatsappService);
  private readonly toast = inject(AppToastService);
  private readonly destroyRef = inject(DestroyRef);

  readonly carregando = signal(true);
  readonly salvando = signal(false);
  readonly testando = signal(false);
  readonly erro = signal<string | null>(null);

  config: WhatsappConfig | null = null;
  apiBaseUrl = '';
  apiKey = '';
  instanceName = '';
  numeroSalao = '';
  nomeEmpresa = '';
  ativo = false;

  ngOnInit(): void {
    this.carregar();
  }

  carregar(): void {
    this.carregando.set(true);
    this.erro.set(null);
    this.wa
      .getConfig()
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: (cfg) => {
          this.config = cfg;
          this.apiBaseUrl = cfg.api_base_url ?? '';
          this.apiKey = '';
          this.instanceName = cfg.instance_name ?? '';
          this.numeroSalao = cfg.numero_salao ?? '';
          this.nomeEmpresa = cfg.nome_empresa ?? '';
          this.ativo = cfg.ativo;
          this.carregando.set(false);
        },
        error: (e: Error) => {
          this.erro.set(WhatsappService.errorMessage(e));
          this.carregando.set(false);
        },
      });
  }

  salvar(): void {
    this.salvando.set(true);
    this.erro.set(null);
    const payload: Record<string, unknown> = {
      provider: 'evolution',
      api_base_url: this.apiBaseUrl.trim() || null,
      instance_name: this.instanceName.trim() || null,
      numero_salao: this.numeroSalao.trim() || null,
      nome_empresa: this.nomeEmpresa.trim() || null,
      ativo: this.ativo,
    };
    if (this.apiKey.trim()) payload['api_key'] = this.apiKey.trim();

    this.wa
      .saveConfig(payload)
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: (cfg) => {
          this.config = cfg;
          this.apiKey = '';
          this.salvando.set(false);
          this.toast.show('Configuração WhatsApp salva.');
        },
        error: (e: Error) => {
          this.erro.set(WhatsappService.errorMessage(e));
          this.salvando.set(false);
        },
      });
  }

  testarConexao(): void {
    this.testando.set(true);
    this.erro.set(null);
    const payload: Record<string, string | null> = {
      api_base_url: this.apiBaseUrl.trim() || null,
      instance_name: this.instanceName.trim() || null,
    };
    if (this.apiKey.trim()) payload['api_key'] = this.apiKey.trim();

    this.wa
      .testConnection(payload)
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: (r) => {
          if (this.config) {
            this.config = {
              ...this.config,
              connection_status: r.connection_status,
              connection_checked_at: new Date().toISOString(),
            };
          }
          this.testando.set(false);
          if (r.ok) {
            this.erro.set(null);
            this.toast.show(r.message);
          } else {
            this.erro.set(r.message);
            this.toast.show(r.message);
          }
        },
        error: (e: Error) => {
          this.erro.set(WhatsappService.errorMessage(e));
          this.testando.set(false);
        },
      });
  }

  rotuloStatus(status: WhatsappConnectionStatus | undefined): string {
    switch (status) {
      case 'open':
        return 'Conectado';
      case 'close':
        return 'Desconectado';
      case 'connecting':
        return 'A conectar…';
      case 'error':
        return 'Erro';
      default:
        return 'Desconhecido';
    }
  }

  classeStatus(status: WhatsappConnectionStatus | undefined): string {
    return `wa-status wa-status--${status ?? 'unknown'}`;
  }
}
