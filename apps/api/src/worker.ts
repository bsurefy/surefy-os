// SPDX-License-Identifier: AGPL-3.0-only
import closeWithGrace from 'close-with-grace'

import { createContainer } from './container.js'
import { loadConfig } from './core/config/index.js'
import { registerJobs, registerSchedulers, SYSTEM_SCHEDULERS } from './core/queue/index.js'
import { startWorkerHealthServer } from './plugins/health.plugin.js'

const config = loadConfig('worker')
const container = await createContainer(config) // same modules and extensions as the API
await container.db.ping()
await container.cache.ping()
const workers = registerJobs(container, [
  // Core job processors register here, one line each (ingestDocumentJob, sendEmailJob, …).
  ...container.modules.notifications.jobs,
  ...container.modules.audit.jobs,
  ...container.modules.dataControl.jobs,
  ...container.modules.vault.jobs,
  ...container.modules.usage.jobs,
  ...container.extensions.jobs,
])
await registerSchedulers(container.queues, SYSTEM_SCHEDULERS, container.logger)
const health = await startWorkerHealthServer({
  logger: container.logger,
  host: config.server.host,
  port: config.worker.healthPort,
  checks: {
    database: () => container.db.ping(),
    redis: () => container.cache.ping(),
    workers: () => {
      const stopped = workers.filter((worker) => !worker.isRunning())
      if (stopped.length > 0) {
        return Promise.reject(new Error(`${stopped.length} worker(s) not running`))
      }
      return Promise.resolve()
    },
  },
  extensions: () => container.extensions.names,
})
container.logger.info({ queues: workers.map((worker) => worker.name) }, 'worker started')

closeWithGrace({ delay: 30_000 }, async ({ err, signal }) => {
  if (err) container.logger.error({ err }, 'fatal error, shutting down')
  else container.logger.info({ signal }, 'shutting down')
  await Promise.all(workers.map((worker) => worker.close())) // waits for running jobs to finish
  await health.close()
  await container.close()
})
