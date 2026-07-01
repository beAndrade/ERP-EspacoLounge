import { telefoneBrDigitos } from '../../lib/telefone-br';
import type {
  ConnectionTestResult,
  SendMessageResult,
  WhatsappConfigRow,
  WhatsappConnectionStatus,
  WhatsappSendParams,
  WhatsAppProvider,
} from './whatsapp-provider.interface';

function normalizeBaseUrl(url: string | null | undefined): string {
  return String(url ?? '')
    .trim()
    .replace(/\/+$/, '');
}

function normalizeInstanceName(name: string | null | undefined): string {
  return String(name ?? '').trim();
}

function mapConnectionState(raw: unknown): WhatsappConnectionStatus {
  if (!raw || typeof raw !== 'object') return 'unknown';
  const o = raw as Record<string, unknown>;
  const state =
    o.state ??
    o.connectionStatus ??
    (o.instance as Record<string, unknown> | undefined)?.state;
  const s = String(state ?? '').toLowerCase();
  if (s === 'open' || s === 'connected') return 'open';
  if (s === 'close' || s === 'closed') return 'close';
  if (s === 'connecting') return 'connecting';
  if (s) return 'error';
  return 'unknown';
}

function extractProviderMessageId(raw: unknown): string | undefined {
  if (!raw || typeof raw !== 'object') return undefined;
  const o = raw as Record<string, unknown>;
  const key = o.key;
  if (key && typeof key === 'object') {
    const id = (key as Record<string, unknown>).id;
    if (typeof id === 'string' && id) return id;
  }
  if (typeof o.messageId === 'string') return o.messageId;
  return undefined;
}

export function telefoneParaWhatsappBr(
  telefone: string | null | undefined,
): string {
  const digitos = telefoneBrDigitos(telefone);
  if (digitos.length < 10) return '';
  if (digitos.startsWith('55') && digitos.length >= 12) return digitos;
  return `55${digitos}`;
}

export class EvolutionProvider implements WhatsAppProvider {
  readonly type = 'evolution' as const;

  async testConnection(config: WhatsappConfigRow): Promise<ConnectionTestResult> {
    const baseUrl = normalizeBaseUrl(config.apiBaseUrl);
    const instance = normalizeInstanceName(config.instanceName);
    const apiKey = String(config.apiKey ?? '').trim();

    if (!baseUrl) {
      return { ok: false, status: 'error', message: 'URL da Evolution API é obrigatória.' };
    }
    if (!apiKey) {
      return { ok: false, status: 'error', message: 'API Key é obrigatória.' };
    }
    if (!instance) {
      return { ok: false, status: 'error', message: 'Nome da instância é obrigatório.' };
    }

    try {
      const res = await fetch(
        `${baseUrl}/instance/connectionState/${encodeURIComponent(instance)}`,
        {
          method: 'GET',
          headers: { apikey: apiKey },
        },
      );
      const text = await res.text();
      let json: unknown = null;
      try {
        json = text ? JSON.parse(text) : null;
      } catch {
        json = { raw: text };
      }

      if (!res.ok) {
        const msg =
          (json as { response?: { message?: string[] } })?.response?.message?.join(
            ', ',
          ) ??
          (json as { message?: string })?.message ??
          `HTTP ${res.status}`;
        return {
          ok: false,
          status: 'error',
          message: String(msg),
          raw: json,
        };
      }

      const status = mapConnectionState(json);
      const ok = status === 'open';
      return {
        ok,
        status,
        message: ok
          ? 'Instância conectada.'
          : `Estado da conexão: ${status}.`,
        raw: json,
      };
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      return { ok: false, status: 'error', message: msg };
    }
  }

  async sendText(
    config: WhatsappConfigRow,
    params: WhatsappSendParams,
  ): Promise<SendMessageResult> {
    const baseUrl = normalizeBaseUrl(config.apiBaseUrl);
    const instance = normalizeInstanceName(config.instanceName);
    const apiKey = String(config.apiKey ?? '').trim();
    const number = telefoneParaWhatsappBr(params.to);

    if (!baseUrl || !apiKey || !instance) {
      return {
        ok: false,
        errorMessage: 'Configuração WhatsApp incompleta.',
      };
    }
    if (!number) {
      return { ok: false, errorMessage: 'Telefone inválido para envio.' };
    }
    if (!String(params.text ?? '').trim()) {
      return { ok: false, errorMessage: 'Mensagem vazia.' };
    }

    try {
      const res = await fetch(
        `${baseUrl}/message/sendText/${encodeURIComponent(instance)}`,
        {
          method: 'POST',
          headers: {
            apikey: apiKey,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            number,
            text: params.text,
          }),
        },
      );
      const text = await res.text();
      let json: unknown = null;
      try {
        json = text ? JSON.parse(text) : null;
      } catch {
        json = { raw: text };
      }

      if (!res.ok) {
        const msg =
          (json as { response?: { message?: string[] } })?.response?.message?.join(
            ', ',
          ) ??
          (json as { message?: string })?.message ??
          `HTTP ${res.status}`;
        return { ok: false, errorMessage: String(msg), raw: json };
      }

      return {
        ok: true,
        providerMessageId: extractProviderMessageId(json),
        raw: json,
      };
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      return { ok: false, errorMessage: msg };
    }
  }
}
