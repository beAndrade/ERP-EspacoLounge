import * as jose from 'jose';
import type { UsuarioRole } from '../services/auth-domain';

export type JwtPayload = {
  sub: number;
  email: string;
  role: UsuarioRole;
  profissional_id: number | null;
  nome: string;
};

const JWT_ALG = 'HS256';
const JWT_EXPIRY = '7d';

function jwtSecret(): Uint8Array {
  const raw =
    process.env.JWT_SECRET?.trim() ||
    (process.env.NODE_ENV !== 'production' ? 'dev-only-jwt-secret' : '');
  if (!raw) {
    throw new Error(
      'JWT_SECRET não está configurado. Defina a variável de ambiente no servidor.',
    );
  }
  return new TextEncoder().encode(raw);
}

export async function signAccessToken(payload: JwtPayload): Promise<string> {
  return new jose.SignJWT({
    email: payload.email,
    role: payload.role,
    profissional_id: payload.profissional_id,
    nome: payload.nome,
  })
    .setProtectedHeader({ alg: JWT_ALG })
    .setSubject(String(payload.sub))
    .setIssuedAt()
    .setExpirationTime(JWT_EXPIRY)
    .sign(jwtSecret());
}

export async function verifyAccessToken(
  token: string,
): Promise<{ ok: true; payload: JwtPayload } | { ok: false; message: string }> {
  try {
    const { payload } = await jose.jwtVerify(token, jwtSecret());
    const sub = Number(payload.sub);
    if (!Number.isFinite(sub) || sub <= 0) {
      return { ok: false, message: 'Token inválido.' };
    }
    const email = String(payload.email ?? '').trim();
    const role = String(payload.role ?? '') as UsuarioRole;
    if (role !== 'admin' && role !== 'profissional') {
      return { ok: false, message: 'Token inválido.' };
    }
    const profIdRaw = payload.profissional_id;
    const profissional_id =
      profIdRaw == null || profIdRaw === ''
        ? null
        : Number(profIdRaw);
    return {
      ok: true,
      payload: {
        sub,
        email,
        role,
        profissional_id:
          profissional_id != null && Number.isFinite(profissional_id)
            ? profissional_id
            : null,
        nome: String(payload.nome ?? '').trim() || email,
      },
    };
  } catch {
    return { ok: false, message: 'Sessão expirada ou inválida. Faça login novamente.' };
  }
}

export function bearerTokenFromRequest(request: Request): string | null {
  const h = request.headers.get('authorization')?.trim() ?? '';
  const m = /^Bearer\s+(.+)$/i.exec(h);
  return m?.[1]?.trim() || null;
}
