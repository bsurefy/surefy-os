// SPDX-License-Identifier: AGPL-3.0-only
/** Error codes of the organizations domain (UPPER_SNAKE_CASE, <DOMAIN>_<PROBLEM>; never renamed or reused). */
export const ORGANIZATIONS_ERROR_CODES = {
  ORGANIZATION_NOT_FOUND: 'ORGANIZATION_NOT_FOUND',
  ORGANIZATION_SLUG_TAKEN: 'ORGANIZATION_SLUG_TAKEN', // 409: another organization uses or redirects from it
  ORGANIZATION_SLUG_RESERVED: 'ORGANIZATION_SLUG_RESERVED', // 409: in RESERVED_ORGANIZATION_SLUGS
  ORGANIZATION_SUSPENDED: 'ORGANIZATION_SUSPENDED', // 403: member request into a suspended organization
  ORGANIZATION_CREATION_NOT_ALLOWED: 'ORGANIZATION_CREATION_NOT_ALLOWED', // 403: install creation policy
} as const
