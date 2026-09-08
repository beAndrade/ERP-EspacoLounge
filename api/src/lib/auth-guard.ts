/**
 * Temporary compatibility reexport (Sprint 3).
 * Implementation lives in `platform/auth/`.
 * New authentication functionality must be added there — not here.
 */
export { authenticateRequest, isPublicApiPath } from '../platform/auth/auth-guard';
