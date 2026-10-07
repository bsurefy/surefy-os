// SPDX-License-Identifier: AGPL-3.0-only
/** Error codes of the setup domain (UPPER_SNAKE_CASE, <DOMAIN>_<PROBLEM>; never renamed or reused). */
export const SETUP_ERROR_CODES = {
  SETUP_ALREADY_COMPLETED: 'SETUP_ALREADY_COMPLETED',
  SETUP_TOKEN_INVALID: 'SETUP_TOKEN_INVALID', // 403: SETUP_TOKEN is set and the request's token does not match
} as const
