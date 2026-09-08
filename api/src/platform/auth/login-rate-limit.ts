/**
 * Rate limit em memória para POST /api/auth/login.
 * Protege contra força bruta por e-mail e por IP (janela deslizante).
 */

const WINDOW_MS = 15 * 60 * 1000;
const MAX_FAILS_PER_EMAIL = 5;
const MAX_FAILS_PER_IP = 20;

type Bucket = {
  fails: number[];
};

const byEmail = new Map<string, Bucket>();
const byIp = new Map<string, Bucket>();

function prune(bucket: Bucket, now: number): void {
  bucket.fails = bucket.fails.filter((t) => now - t < WINDOW_MS);
}

function getBucket(map: Map<string, Bucket>, key: string): Bucket {
  let b = map.get(key);
  if (!b) {
    b = { fails: [] };
    map.set(key, b);
  }
  return b;
}

function countInWindow(map: Map<string, Bucket>, key: string, now: number): number {
  const b = getBucket(map, key);
  prune(b, now);
  if (b.fails.length === 0) map.delete(key);
  return b.fails.length;
}

export function normalizeLoginEmail(email: string): string {
  return email.trim().toLowerCase();
}

export function clientIpFromRequest(request: Request): string {
  const xf = request.headers.get('x-forwarded-for');
  if (xf) {
    const first = xf.split(',')[0]?.trim();
    if (first) return first;
  }
  const realIp = request.headers.get('x-real-ip')?.trim();
  if (realIp) return realIp;
  return 'unknown';
}

export type LoginRateLimitResult =
  | { limited: false }
  | { limited: true; message: string };

/**
 * Verifica se o login está bloqueado por excesso de tentativas falhas.
 */
export function checkLoginRateLimit(
  emailRaw: string,
  ip: string,
): LoginRateLimitResult {
  const now = Date.now();
  const email = normalizeLoginEmail(emailRaw);
  const emailFails = email ? countInWindow(byEmail, email, now) : 0;
  const ipFails = countInWindow(byIp, ip || 'unknown', now);

  if (emailFails >= MAX_FAILS_PER_EMAIL || ipFails >= MAX_FAILS_PER_IP) {
    return {
      limited: true,
      message:
        'Muitas tentativas. Aguarde alguns minutos e tente novamente.',
    };
  }
  return { limited: false };
}

/** Registra uma tentativa de login falha. */
export function recordLoginFailure(emailRaw: string, ip: string): void {
  const now = Date.now();
  const email = normalizeLoginEmail(emailRaw);
  if (email) {
    const b = getBucket(byEmail, email);
    prune(b, now);
    b.fails.push(now);
  }
  const ipKey = ip || 'unknown';
  const ib = getBucket(byIp, ipKey);
  prune(ib, now);
  ib.fails.push(now);
}

/** Zera o contador do e-mail após login bem-sucedido. */
export function clearLoginFailuresForEmail(emailRaw: string): void {
  const email = normalizeLoginEmail(emailRaw);
  if (email) byEmail.delete(email);
}
