import type { CompanyStatus } from './company.types';

/** Stable entity key for docs and future code — not a runtime tenant switch. */
export const COMPANY_ENTITY = 'company' as const;

/** Mirrors `CompanyStatus` for exhaustive checks in future code. */
export const COMPANY_STATUSES = [
  'active',
  'inactive',
  'suspended',
] as const satisfies readonly CompanyStatus[];
