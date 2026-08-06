import { fail } from '../shared/utils/envelope';
import { bearerTokenFromRequest, verifyAccessToken } from './jwt';
import type { AuthUser } from '../services/auth-domain';

const PUBLIC_PATHS: { method: string; path: string }[] = [
  { method: 'POST', path: '/api/auth/login' },
];

export function isPublicApiPath(pathname: string, method: string): boolean {
  if (pathname === '/health') return true;
  if (pathname.startsWith('/api/public/')) return true;
  for (const p of PUBLIC_PATHS) {
    if (p.path === pathname && p.method === method.toUpperCase()) return true;
  }
  return false;
}

export async function authenticateRequest(
  request: Request,
): Promise<
  | { ok: true; user: AuthUser }
  | { ok: false; response: ReturnType<typeof fail> }
> {
  const token = bearerTokenFromRequest(request);
  if (!token) {
    return {
      ok: false,
      response: fail(
        'UNAUTHORIZED',
        'Autenticação necessária. Faça login no sistema.',
      ),
    };
  }
  const verified = await verifyAccessToken(token);
  if (!verified.ok) {
    return { ok: false, response: fail('UNAUTHORIZED', verified.message) };
  }
  const p = verified.payload;
  return {
    ok: true,
    user: {
      id: p.sub,
      email: p.email,
      role: p.role,
      profissional_id: p.profissional_id,
      nome_exibicao: p.nome,
    },
  };
}
