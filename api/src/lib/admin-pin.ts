import { fail } from './envelope';

/**
 * Valida o header `X-Admin-Pin` contra `process.env.ADMIN_PIN`.
 * Devolve resposta de erro ou `undefined` se autorizado.
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
      'UNAUTHORIZED',
      'PIN de administrador inválido ou em falta (header X-Admin-Pin).',
    );
  }
  return undefined;
}
