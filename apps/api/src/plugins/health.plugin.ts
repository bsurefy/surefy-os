// SPDX-License-Identifier: AGPL-3.0-only
import fp from 'fastify-plugin'

/**
 * `GET /health/live`: the process is running. Readiness (`/health/ready`: database and Redis) is added
 * with the database and cache clients.
 */
export const healthPlugin = fp(
  (app) => {
    app.get('/health/live', { logLevel: 'silent', config: { rateLimit: false } }, () => ({
      data: { status: 'ok' },
    }))
  },
  { name: 'health' },
)
