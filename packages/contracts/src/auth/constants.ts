// SPDX-License-Identifier: AGPL-3.0-only
/**
 * Prefix of the session cookies the API sets (`surefy.session_token`, `__Secure-` in production).
 * The API configures its auth with it and each app's session proxy looks for it, so the two never
 * disagree.
 */
export const SESSION_COOKIE_PREFIX = 'surefy'
