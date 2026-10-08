// SPDX-License-Identifier: AGPL-3.0-only
import { ApiKeysController } from './apiKeys.controller.js'
import { createCleanupJob, createFlushLastUsedJob } from './apiKeys.jobs.js'
import { ApiKeysMaintenance } from './apiKeys.maintenance.js'
import { ApiKeysRepository } from './apiKeys.repository.js'
import { ApiKeyAuthenticator } from './apiKeys.resolver.js'
import { apiKeysRoutes } from './apiKeys.routes.js'
import { ApiKeysService } from './apiKeys.service.js'
import { ApiKeysLastUsed } from './apiKeysLastUsed.js'

import type { ApiKeysAccess, ApiKeyUserRefs } from './apiKeys.types.js'
import type { Cache } from '@/core/cache/index.js'
import type { Database } from '@/core/database/index.js'
import type { Logger } from '@/core/logger/index.js'
import type { AuditRecorder } from '@/modules/audit/index.js'

export interface ApiKeysModuleDeps {
  db: Database
  cache: Cache
  logger: Logger
  access: ApiKeysAccess
  users: ApiKeyUserRefs
  audit: AuditRecorder
  /** The host of `API_PUBLIC_URL`: the only host that accepts a key. */
  publicApiHost: string
}

export function createApiKeysModule(deps: ApiKeysModuleDeps) {
  const repository = new ApiKeysRepository()
  const service = new ApiKeysService({
    db: deps.db,
    repository,
    access: deps.access,
    users: deps.users,
    audit: deps.audit,
  })
  const lastUsed = new ApiKeysLastUsed({
    client: deps.cache.client,
    db: deps.db,
    repository,
    logger: deps.logger,
  })
  const maintenance = new ApiKeysMaintenance({ db: deps.db, repository })
  return {
    service,
    /** `Authorization: Bearer sk_…` for the session plugin. */
    authenticator: new ApiKeyAuthenticator({
      db: deps.db,
      repository,
      lastUsed,
      publicApiHost: deps.publicApiHost,
    }),
    lastUsed,
    maintenance,
    jobs: [createFlushLastUsedJob(lastUsed), createCleanupJob(maintenance)],
    routes: apiKeysRoutes(new ApiKeysController(service)),
  }
}
export type ApiKeysModule = ReturnType<typeof createApiKeysModule>
