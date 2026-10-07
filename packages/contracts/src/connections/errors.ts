// SPDX-License-Identifier: AGPL-3.0-only
/** Error codes of the connections domain (UPPER_SNAKE_CASE, <DOMAIN>_<PROBLEM>; never renamed or reused). */
export const CONNECTIONS_ERROR_CODES = {
  CONNECTION_TOKEN_EXPIRED: 'CONNECTION_TOKEN_EXPIRED', // status reason: the access token expired and cannot be refreshed
  CONNECTION_REFRESH_FAILED: 'CONNECTION_REFRESH_FAILED', // status reason: the provider refused the refresh token
  CONNECTION_PROVIDER_REJECTED: 'CONNECTION_PROVIDER_REJECTED', // 422: the provider rejected the credentials or the call
  CONNECTION_UNREACHABLE: 'CONNECTION_UNREACHABLE', // 422: nothing answered at the base URL
  CONNECTION_NOT_FOUND: 'CONNECTION_NOT_FOUND', // 404
  CONNECTION_REVOKED: 'CONNECTION_REVOKED', // 409: a disconnected account cannot change, reconnect or be tested
  CONNECTION_PROVIDER_UNSUPPORTED: 'CONNECTION_PROVIDER_UNSUPPORTED', // 422: the provider key is not in the registry
  CONNECTION_AUTH_TYPE_UNSUPPORTED: 'CONNECTION_AUTH_TYPE_UNSUPPORTED', // 422: the provider does not offer this way of signing in
  CONNECTION_BASE_URL_NOT_ALLOWED: 'CONNECTION_BASE_URL_NOT_ALLOWED', // 422: plain http outside the install's allow-list, or an address the provider does not take
  CONNECTION_DUPLICATE: 'CONNECTION_DUPLICATE', // 409: the same account is already connected in this scope; reconnect it instead
  CONNECTION_ACCOUNT_MISMATCH: 'CONNECTION_ACCOUNT_MISMATCH', // 422: a reconnect signed in to a different account
  CONNECTION_OAUTH_STATE_INVALID: 'CONNECTION_OAUTH_STATE_INVALID', // 422: the sign-in attempt is unknown, expired or already used
  CONNECTION_OAUTH_DENIED: 'CONNECTION_OAUTH_DENIED', // 422: the person declined, or the provider returned an error
} as const
