/**
 * Temporary compatibility reexport (Sprint 3).
 * Implementation lives in `platform/auth/`.
 * New authentication functionality must be added there — not here.
 */
export {
  checkLoginRateLimit,
  clearLoginFailuresForEmail,
  clientIpFromRequest,
  normalizeLoginEmail,
  recordLoginFailure,
  type LoginRateLimitResult,
} from '../platform/auth/login-rate-limit';
