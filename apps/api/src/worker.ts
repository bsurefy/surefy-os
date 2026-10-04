// SPDX-License-Identifier: AGPL-3.0-only
import closeWithGrace from 'close-with-grace'
import Fastify from 'fastify'

import { healthPlugin } from './plugins/health.plugin.js'

// The worker runs background jobs; it exposes only health endpoints, on an internal port.
const host = process.env.WORKER_HEALTH_HOST ?? '127.0.0.1'
const port = Number(process.env.WORKER_HEALTH_PORT ?? 4001)

const health = Fastify({ logger: { level: process.env.LOG_LEVEL ?? 'info' } })
await health.register(healthPlugin)
await health.listen({ host, port })
health.log.info('worker started (no job processors registered yet)')

closeWithGrace({ delay: 10_000 }, async ({ err, signal }) => {
  if (err) health.log.error({ err }, 'fatal error, shutting down')
  else health.log.info({ signal }, 'shutting down')
  await health.close()
})
