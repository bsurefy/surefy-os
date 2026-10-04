// SPDX-License-Identifier: AGPL-3.0-only
/** Error codes of the audit domain (UPPER_SNAKE_CASE, <DOMAIN>_<PROBLEM>; never renamed or reused). */
export const AUDIT_ERROR_CODES = {
  AUDIT_ENTRY_NOT_FOUND: 'AUDIT_ENTRY_NOT_FOUND',
  AUDIT_VERIFICATION_RUNNING: 'AUDIT_VERIFICATION_RUNNING', // 409: an on-demand verification is already in progress
} as const
