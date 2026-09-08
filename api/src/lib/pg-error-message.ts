/**
 * Temporary compatibility reexport (Sprint 5).
 * Implementation lives in `infrastructure/database/`.
 * New database infrastructure helpers must be added there — not here.
 */
export { mapPostgresUniqueViolationToPtBr } from '../infrastructure/database/pg-error-message';
