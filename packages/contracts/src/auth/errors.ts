// SPDX-License-Identifier: AGPL-3.0-only
/** Error codes of the auth domain (UPPER_SNAKE_CASE, <DOMAIN>_<PROBLEM>; never renamed or reused). */
export const AUTH_ERROR_CODES = {
  AUTH_SESSION_NOT_FRESH: 'AUTH_SESSION_NOT_FRESH', // 403: sensitive action needs a sign-in within freshAge
  AUTH_TWO_FACTOR_REQUIRED: 'AUTH_TWO_FACTOR_REQUIRED', // 403: the organization requires 2FA; set it up first
  AUTH_EMAIL_NOT_VERIFIED: 'AUTH_EMAIL_NOT_VERIFIED', // 403: the action needs a verified email
  AUTH_SESSION_NOT_FOUND: 'AUTH_SESSION_NOT_FOUND', // 404: not one of the current user's sessions
} as const
