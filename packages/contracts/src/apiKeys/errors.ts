// SPDX-License-Identifier: AGPL-3.0-only
/** Error codes of the apiKeys domain (UPPER_SNAKE_CASE, <DOMAIN>_<PROBLEM>; never renamed or reused). */
export const API_KEYS_ERROR_CODES = {
  API_KEY_NOT_FOUND: 'API_KEY_NOT_FOUND', // 404
  API_KEY_REVOKED: 'API_KEY_REVOKED', // 409: a revoked key cannot change
  API_KEY_SCOPE_NOT_ALLOWED: 'API_KEY_SCOPE_NOT_ALLOWED', // 422: the scope is unknown or cannot be given to a key
  API_KEY_EXPIRY_INVALID: 'API_KEY_EXPIRY_INVALID', // 422: the expiry is not in the future
} as const
