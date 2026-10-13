// SPDX-License-Identifier: AGPL-3.0-only
/** Error codes of the usage domain (UPPER_SNAKE_CASE, <DOMAIN>_<PROBLEM>; never renamed or reused). */
export const USAGE_ERROR_CODES = {
  BUDGET_NOT_FOUND: 'BUDGET_NOT_FOUND', // 404
  BUDGET_ALREADY_EXISTS: 'BUDGET_ALREADY_EXISTS', // 409: one budget per organization, team or person
  BUDGET_TARGET_NOT_FOUND: 'BUDGET_TARGET_NOT_FOUND', // 422: the team or member doesn't exist in the organization
} as const
