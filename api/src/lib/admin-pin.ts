import { fail } from './envelope';
import {
  authenticateRequest,
} from './auth-guard';
import type { AuthUser } from '../services/auth-domain';

function requireAdminRole(
  user: AuthUser,
): ReturnType<typeof fail> | null {
  if (user.role !== 'admin') {
    return fail('FORBIDDEN', 'Acesso restrito a administradores.');
  }
  return null;
}

/**
 * Valida o header `X-Admin-Pin` contra `process.env.ADMIN_PIN`.
 * Devolve resposta de erro ou `undefined` se autorizado.
 * PIN inválido usa FORBIDDEN (403) — não confundir com JWT expirado (401).
 */
export function requireAdminPin(request: Request) {
  const expected = process.env.ADMIN_PIN?.trim();
  if (!expected) {
    return fail(
      'SERVER',
      'ADMIN_PIN não está configurado no servidor. Defina a variável de ambiente.',
    );
  }
  const got = request.headers.get('x-admin-pin')?.trim();
  if (got !== expected) {
    return fail(
      'FORBIDDEN',
      'PIN de administrador inválido ou em falta.',
    );
  }
  return undefined;
}

/**
 * JWT admin + PIN. Usado nas rotas financeiras sensíveis.
 */
export async function requireAdminWithPin(request: Request): Promise<
  | { ok: true; user: AuthUser }
  | { ok: false; response: ReturnType<typeof fail>; status: number }
> {
  const auth = await authenticateRequest(request);
  if (!auth.ok) {
    return { ok: false, response: auth.response, status: 401 };
  }
  const roleDenied = requireAdminRole(auth.user);
  if (roleDenied) {
    return { ok: false, response: roleDenied, status: 403 };
  }
  const pinDenied = requireAdminPin(request);
  if (pinDenied) {
    const code = pinDenied.error?.code;
    return {
      ok: false,
      response: pinDenied,
      status: code === 'SERVER' ? 500 : 403,
    };
  }
  return { ok: true, user: auth.user };
}

/** Rotas que exigem admin + PIN (cadeado do Financeiro). */
export function pathRequiresFinanceiroPin(pathname: string): boolean {
  if (pathname === '/api/financeiro/formas-pagamento/opcoes') {
    // Usado em faturar/comandas/débitos — fora do cadeado.
    return false;
  }
  if (pathname.startsWith('/api/financeiro/')) return true;
  if (pathname.startsWith('/api/folha')) return true;
  if (pathname === '/api/caixa/dia' || pathname.startsWith('/api/caixa/')) {
    return true;
  }
  if (pathname.startsWith('/api/movimentacoes')) return true;
  if (pathname.startsWith('/api/despesas')) return true;
  return false;
}
