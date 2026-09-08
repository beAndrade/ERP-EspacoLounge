/**
 * Beauty module — first vertical domain of the Nexa platform.
 *
 * Internal layout:
 * - domain/         — pure Beauty rules (no I/O)
 * - application/    — use-cases / orchestration (catalog lists)
 * - infrastructure/ — Beauty-specific adapters (empty)
 * - presentation/   — HTTP/controllers when routes move here (empty)
 * - shared/         — helpers used across Beauty layers
 */
export * from './domain';
export * from './application';
export * from './shared';
