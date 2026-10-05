// SPDX-License-Identifier: AGPL-3.0-only
import { createOutboxJobs } from './outbox.jobs.js'
import { OutboxRepository } from './outbox.repository.js'
import { OutboxService } from './outbox.service.js'

import type { OutboxHandler } from './outbox.types.js'
import type { Database } from '@/core/database/index.js'
import type { ExtensionRegistry } from '@/core/extensions/index.js'
import type { Logger } from '@/core/logger/index.js'
import type { Queues, RegisteredJob } from '@/core/queue/index.js'

export interface OutboxModuleDeps {
  db: Database
  queues: Queues
  logger: Logger
  /** The core modules' handlers (`*.purged` from chats and knowledge…). */
  handlers: readonly OutboxHandler[]
  /** The extensions' handlers (`onEvent`), read at delivery time. */
  hooks: Pick<ExtensionRegistry, 'outboxHandlers'>
}

/** Outbox events and the relay that dispatches them (no routes). */
export function createOutboxModule(deps: OutboxModuleDeps) {
  // The jobs read the service when they run; the service enqueues the jobs.
  const jobs = createOutboxJobs(() => service)
  const service = new OutboxService({
    db: deps.db,
    queues: deps.queues,
    logger: deps.logger,
    repository: new OutboxRepository(),
    handlers: () => [...deps.handlers, ...deps.hooks.outboxHandlers()],
    relayJob: () => jobs.relay,
    deliverJob: () => jobs.deliver,
  })
  return {
    service,
    jobs: [jobs.relay, jobs.deliver] satisfies RegisteredJob[],
  }
}
export type OutboxModule = ReturnType<typeof createOutboxModule>
