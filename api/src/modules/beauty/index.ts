/**
 * Beauty module — first vertical domain of the Nexa platform.
 *
 * Internal layout:
 * - domain/         — pure Beauty rules (no I/O)
 * - application/    — use-cases / orchestration (catalog lists deferred)
 * - infrastructure/ — Beauty-specific adapters (empty in Sprint 2)
 * - presentation/   — HTTP/controllers when routes move here (empty in Sprint 2)
 * - shared/         — helpers used across Beauty layers
 */
export * from './domain';
export * from './shared';
