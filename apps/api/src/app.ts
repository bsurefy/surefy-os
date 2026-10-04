// SPDX-License-Identifier: AGPL-3.0-only
import Fastify, { type FastifyInstance } from 'fastify'

import { healthPlugin } from './plugins/health.plugin.js'

export interface AppOptions {
  logLevel?: string
}

/** Builds the Fastify instance: plugins in their fixed order, then module routes under /api/v1. */
export async function buildApp(options: AppOptions = {}): Promise<FastifyInstance> {
  const app = Fastify({
    logger: { level: options.logLevel ?? 'info' },
    disableRequestLogging: false,
  })
  await app.register(healthPlugin)
  return app
}
