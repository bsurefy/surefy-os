// SPDX-License-Identifier: AGPL-3.0-only
/**
 * Per-route rate limit presets for `config: { rateLimit }` (@fastify/rate-limit). The global
 * per-IP limit applies to every route that does not override it; health routes opt out.
 */
export const RATE_LIMITS = {
  /** Default for every route: per client IP. */
  global: { max: 300, timeWindow: '1 minute' },
  /** Sign-in, sign-up, password reset and the other Better Auth routes. */
  auth: { max: 20, timeWindow: '1 minute' },
} as const
