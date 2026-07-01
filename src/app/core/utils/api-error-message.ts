import { HttpErrorResponse } from '@angular/common/http';
import type { ApiResponse } from '../models/api.models';

const API_HINT =
  ' Confirme: (1) terminal na pasta `api` com `npm start` — deve aparecer «API em http://0.0.0.0:3000»; ' +
  '(2) terminal na raiz com `npm start` (Angular em http://localhost:4200); ' +
  '(3) recarregue a página com Ctrl+Shift+R. ' +
  'Este erro é da API do ERP, não da Evolution/WhatsApp.';

function messageFromApiEnvelope(body: unknown): string | null {
  if (!body || typeof body !== 'object') return null;
  const r = body as ApiResponse<unknown>;
  if (r.ok === false && r.error?.message?.trim()) {
    return r.error.message.trim();
  }
  return null;
}

/** Resposta de validação do Elysia (HTTP 422). */
function messageFromElysiaValidation(body: unknown): string | null {
  if (!body || typeof body !== 'object') return null;
  const v = body as {
    type?: string;
    summary?: string;
    message?: string;
    errors?: { message?: string; path?: string }[];
  };
  if (v.type !== 'validation') return null;
  if (typeof v.summary === 'string' && v.summary.trim()) {
    return v.summary.trim();
  }
  const first = v.errors?.find((e) => e.message?.trim());
  if (first?.message?.trim()) {
    const path =
      typeof first.path === 'string' && first.path
        ? `${first.path}: `
        : '';
    return `${path}${first.message.trim()}`;
  }
  if (typeof v.message === 'string' && v.message.trim()) {
    return v.message.trim();
  }
  return null;
}

/** Mensagem legível para erros de HTTP / envelope da API. */
export function extractApiErrorMessage(
  err: unknown,
  fallback = 'Não foi possível concluir o pedido. Tente novamente.',
): string {
  if (err instanceof HttpErrorResponse) {
    const fromEnvelope = messageFromApiEnvelope(err.error);
    if (fromEnvelope) return fromEnvelope;

    const fromValidation = messageFromElysiaValidation(err.error);
    if (fromValidation) return fromValidation;

    if (typeof err.error === 'string' && err.error.trim()) {
      const t = err.error.trim();
      if (t.startsWith('<!')) {
        return `O servidor devolveu HTML em vez de JSON.${API_HINT}`;
      }
      return t;
    }

    if (err.status === 0) {
      return `Não foi possível ligar à API.${API_HINT}`;
    }

    /** 204 sem corpo: pedido pode ter sido gravado; reinicie a API se persistir. */
    if (err.status === 204) {
      return 'O servidor respondeu sem dados (204). Reinicie a API na pasta api e tente de novo.';
    }

    if (/failure during parsing|parse/i.test(err.message ?? '')) {
      return `${err.message}${API_HINT}`;
    }

    if (err.message?.trim()) return err.message.trim();
    return fallback;
  }

  if (err instanceof Error && err.message.trim()) {
    return err.message.trim();
  }

  return fallback;
}
