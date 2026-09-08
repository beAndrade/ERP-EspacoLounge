/**
 * Planned Company entity shapes for Nexa multi-tenant architecture.
 * Sprint 4: types only — not persisted and not wired into runtime.
 */

/** Future logical tenant identifier (not a database column yet). */
export type CompanyId = string;

export type CompanyStatus = 'active' | 'inactive' | 'suspended';

/**
 * Planned Company record shape.
 * Not backed by a table in Sprint 4.
 */
export type Company = {
  id: CompanyId;
  name: string;
  slug?: string;
  status: CompanyStatus;
  createdAt?: string;
  updatedAt?: string;
};

/**
 * Future request-scoped company context (JWT / middleware).
 * Sprint 4: type only — no resolver implemented.
 */
export type CompanyContext = {
  companyId: CompanyId | null;
};
