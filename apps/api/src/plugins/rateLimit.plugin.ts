// SPDX-License-Identifier: AGPL-3.0-only
import rateLimit from '@fastify/rate-limit'
import fp from 'fastify-plugin'

import { RATE_LIMITS } from '@/constants/rateLimits.js'

import type { CacheClient } from '@/core/cache/index.js'

export interface RateLimitPluginOptions {
  /** The Redis client that holds the counters; without one the store is in-memory (tests). */
  redis?: CacheClient
}

/**
 * The global per-IP limit, with the Redis store so every API replica shares one counter. Routes
 * override it with `config: { rateLimit }` (presets in `RATE_LIMITS`) or opt out with `false`.
 * Exceeding a limit throws a 429 that the error handler turns into `RATE_LIMITED`, after
 * `Retry-After` is set. Per-user and per-organization limits are added by the access plugin.
 */
export const rateLimitPlugin = fp<RateLimitPluginOptions>(
  async (app, options) => {
    await app.register(rateLimit, {
      global: true,
      max: RATE_LIMITS.global.max,
      timeWindow: RATE_LIMITS.global.timeWindow,
      nameSpace: 'rate-limit:',
      ...(options.redis === undefined ? {} : { redis: options.redis }),
    })
  },
  { name: 'rateLimit' },
)
