// SPDX-License-Identifier: AGPL-3.0-only
import closeWithGrace from 'close-with-grace'

import { buildApp } from './app.js'
import { createContainer } from './container.js'
import { loadConfig } from './core/config/index.js'

const config = loadConfig('api') // 1. validate env, exit on failure
const container = await createContainer(config) // 2. clients, modules, extensions, auth
await container.db.ping() // 3. fail fast if dependencies are down
await container.cache.ping()
const app = await buildApp(container) // 4. plugins, core module routes, extension routes
await app.listen({ host: config.server.host, port: config.server.port })

closeWithGrace({ delay: 10_000 }, async ({ err, signal }) => {
  if (err) app.log.error({ err }, 'fatal error, shutting down')
  else app.log.info({ signal }, 'shutting down')
  await app.close() // stop accepting requests, finish in-flight ones
  await container.close() // then close queues, cache, database
})
