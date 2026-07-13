import { Injectable, inject } from '@angular/core';
import { HttpClient, HttpParams } from '@angular/common/http';
import { Observable, forkJoin, map, of } from 'rxjs';
import { catchError } from 'rxjs/operators';
import { environment } from '../../../../environments/environment';
import type { ApiResponse } from '../../models/api.models';
import type {
  WhatsappConfig,
  WhatsappConfigPayload,
  WhatsappConnectionTestResult,
  WhatsappLogsPage,
  WhatsappSendPayload,
  WhatsappSendResult,
  WhatsappTemplate,
  WhatsappTemplateUpdatePayload,
} from '../../models/whatsapp.model';
import { extractApiErrorMessage } from '../../utils/api-error-message';
import {
  abrirWhatsappSendUrlAposPreparar,
  buildWhatsappSendUrl,
} from '../../utils/whatsapp-deep-link';
import { telefoneBrDigitos } from '../../utils/telefone-br';
import { mesclarVariaveisWhatsapp } from '../../utils/whatsapp-variaveis';
import { SessaoUsuarioService } from '../sessao-usuario.service';

@Injectable({ providedIn: 'root' })
export class WhatsappService {
  private readonly http = inject(HttpClient);
  private readonly sessao = inject(SessaoUsuarioService);
  private readonly baseUrl = environment.apiBaseUrl.replace(/\/$/, '');

  private unwrap<T>(r: ApiResponse<T>): T {
    if (!r.ok || r.data == null) {
      throw new Error(r.error?.message ?? 'Erro na API WhatsApp.');
    }
    return r.data;
  }

  getConfig(): Observable<WhatsappConfig> {
    return this.http
      .get<ApiResponse<{ config: WhatsappConfig }>>(
        `${this.baseUrl}/api/whatsapp/config`,
      )
      .pipe(map((r) => this.unwrap<{ config: WhatsappConfig }>(r).config));
  }

  saveConfig(payload: WhatsappConfigPayload): Observable<WhatsappConfig> {
    return this.http
      .put<ApiResponse<{ config: WhatsappConfig }>>(
        `${this.baseUrl}/api/whatsapp/config`,
        payload,
      )
      .pipe(map((r) => this.unwrap<{ config: WhatsappConfig }>(r).config));
  }

  testConnection(
    payload?: Pick<
      WhatsappConfigPayload,
      'api_base_url' | 'api_key' | 'instance_name'
    >,
  ): Observable<WhatsappConnectionTestResult> {
    return this.http
      .post<ApiResponse<WhatsappConnectionTestResult>>(
        `${this.baseUrl}/api/whatsapp/config/test-connection`,
        payload ?? {},
      )
      .pipe(map((r) => this.unwrap(r)));
  }

  listTemplates(): Observable<WhatsappTemplate[]> {
    return this.http
      .get<ApiResponse<{ items: WhatsappTemplate[] }>>(
        `${this.baseUrl}/api/whatsapp/templates`,
      )
      .pipe(map((r) => this.unwrap<{ items: WhatsappTemplate[] }>(r).items));
  }

  updateTemplate(
    id: number,
    payload: WhatsappTemplateUpdatePayload,
  ): Observable<void> {
    return this.http
      .patch<ApiResponse<{ ok: boolean }>>(
        `${this.baseUrl}/api/whatsapp/templates/${id}`,
        payload,
      )
      .pipe(map((r) => {
        this.unwrap(r);
      }));
  }

  sendMessage(payload: WhatsappSendPayload): Observable<WhatsappSendResult> {
    return this.http
      .post<ApiResponse<WhatsappSendResult>>(
        `${this.baseUrl}/api/whatsapp/messages/send`,
        payload,
      )
      .pipe(map((r) => this.unwrap(r)));
  }

  listLogs(opts?: {
    page?: number;
    pageSize?: number;
    clienteId?: string;
    tipo?: string;
  }): Observable<WhatsappLogsPage> {
    let params = new HttpParams();
    if (opts?.page != null) params = params.set('page', String(opts.page));
    if (opts?.pageSize != null) {
      params = params.set('page_size', String(opts.pageSize));
    }
    if (opts?.clienteId?.trim()) {
      params = params.set('cliente_id', opts.clienteId.trim());
    }
    if (opts?.tipo?.trim()) params = params.set('tipo', opts.tipo.trim());

    return this.http
      .get<ApiResponse<WhatsappLogsPage>>(
        `${this.baseUrl}/api/whatsapp/logs`,
        { params },
      )
      .pipe(map((r) => this.unwrap(r)));
  }

  renderTemplatePreview(
    corpo: string,
    variaveis: Record<string, string>,
  ): string {
    return corpo.replace(/\{\{([a-zA-Z0-9_]+)\}\}/g, (_m, key: string) => {
      return variaveis[key] ?? '';
    });
  }

  /** Variáveis para envio/preview: profissional = utilizador logado. */
  mesclarVariaveisEnvio(
    base: Record<string, string | null | undefined> = {},
    opts?: { nomeEmpresa?: string; clienteNome?: string },
  ): Record<string, string> {
    return mesclarVariaveisWhatsapp(base, {
      nomeProfissional: this.sessao.nomeExibicao(),
      nomeEmpresa: opts?.nomeEmpresa,
      clienteNome: opts?.clienteNome,
    });
  }

  /**
   * Monta URL wa.me com template configurado (ex.: cobrança).
   */
  resolverUrlChatComTemplate(
    telefone: string,
    templateCodigo: string,
    variaveis: Record<string, string> = {},
  ): Observable<string> {
    const digitos = telefoneBrDigitos(telefone);
    if (digitos.length < 10) {
      throw new Error('Cliente sem telefone válido para WhatsApp.');
    }

    return forkJoin({
      templates: this.listTemplates(),
      config: this.getConfig().pipe(catchError(() => of(null as WhatsappConfig | null))),
    }).pipe(
      map(({ templates, config }) => {
        const tpl = templates.find(
          (t) => t.codigo === templateCodigo && t.ativo,
        );
        const vars = this.mesclarVariaveisEnvio(variaveis, {
          nomeEmpresa: config?.nome_empresa?.trim() ?? '',
        });
        const texto = tpl
          ? this.renderTemplatePreview(tpl.corpo, vars)
          : (variaveis['fallback'] ?? '').trim();
        if (!texto) {
          throw new Error('Não foi possível montar a mensagem de WhatsApp.');
        }
        return buildWhatsappSendUrl(digitos, texto);
      }),
    );
  }

  /**
   * Abre WhatsApp no browser/app com mensagem do template (link wa.me).
   */
  abrirChatComTemplate(
    telefone: string,
    templateCodigo: string,
    variaveis: Record<string, string> = {},
    onError?: (err: unknown) => void,
  ): void {
    abrirWhatsappSendUrlAposPreparar(
      () =>
        new Promise<string>((resolve, reject) => {
          this.resolverUrlChatComTemplate(telefone, templateCodigo, variaveis).subscribe({
            next: (url) => resolve(url),
            error: (err) => reject(err),
          });
        }),
      onError,
    );
  }

  static errorMessage(err: unknown): string {
    return extractApiErrorMessage(err);
  }
}
