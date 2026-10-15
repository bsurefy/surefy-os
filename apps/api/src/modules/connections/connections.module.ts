// SPDX-License-Identifier: AGPL-3.0-only
import { ConnectionsController } from './connections.controller.js'
import { createCleanupJob, createFlushLastUsedJob, createRefreshJob } from './connections.jobs.js'
import { ConnectionsMaintenance } from './connections.maintenance.js'
import { createConnectionExpiredHandler } from './connections.outbox.js'
import { ConnectionsRepository } from './connections.repository.js'
import { connectionsRoutes } from './connections.routes.js'
import { ConnectionSecrets } from './connections.secrets.js'
import { ConnectionsService } from './connections.service.js'
import { NO_DEPENDENTS } from './connections.types.js'
import { ConnectionHealth } from './connectionsHealth.js'
import { createOutboundHttp } from './connectionsHttp.js'
import { ConnectionsLastUsed } from './connectionsLastUsed.js'
import { createConnectionsMemberRemoval } from './connectionsMemberRemoval.js'
import { ConnectionsOauth } from './connectionsOauth.js'
import { OauthStateStore } from './connectionsOauthState.js'
import { ConnectionPresenter } from './connectionsPresenter.js'
import { ConnectionTargets } from './connectionsTargets.js'
import { ConnectionTokens } from './connectionsTokens.js'
import { ConnectionWriter } from './connectionsWriter.js'
import { createProviderAdapters } from './providers/index.js'

import type {
  ConnectionDependents,
  ConnectionsNotifier,
  ConnectionsOutbox,
  ConnectionsTeams,
  ConnectionsUserRefs,
} from './connections.types.js'
import type { OutboundHttp } from './connectionsHttp.js'
import type { OauthApp } from './providers/index.js'
import type { Cache } from '@/core/cache/index.js'
import type { Config } from '@/core/config/index.js'
import type { Crypto } from '@/core/crypto/index.js'
import type { Database } from '@/core/database/index.js'
import type { Logger } from '@/core/logger/index.js'
import type { AuditRecorder } from '@/modules/audit/index.js'

export interface ConnectionsModuleDeps {
  config: Pick<Config, 'connections' | 'web'>
  db: Database
  cache: Cache
  crypto: Crypto
  logger: Logger
  teams: ConnectionsTeams
  users: ConnectionsUserRefs
  notifications: ConnectionsNotifier
  /** The outbox service; read when an event is written, because the outbox is built after this. */
  outbox: () => ConnectionsOutbox
  audit: AuditRecorder
  /** What depends on a connection; agents, flows, knowledge and channels provide it as they land. */
  dependents?: ConnectionDependents
  /** The calls to other apps; tests pass a fake. */
  http?: OutboundHttp
}

/** Settings › Connections: the credential store, OAuth sign-in, status checks and refresh. */
export function createConnectionsModule(deps: ConnectionsModuleDeps) {
  const repository = new ConnectionsRepository()
  const secrets = new ConnectionSecrets(deps.crypto.secrets)
  const adapters = createProviderAdapters(deps.config.connections.providerOrigins)
  const http = deps.http ?? createOutboundHttp({ localHosts: deps.config.connections.localHosts })
  const dependents = deps.dependents ?? NO_DEPENDENTS
  const oauthApps: Readonly<Record<string, OauthApp | undefined>> =
    deps.config.connections.oauthApps

  const presenter = new ConnectionPresenter({ teams: deps.teams, users: deps.users, dependents })
  const targets = new ConnectionTargets({
    adapters,
    teams: deps.teams,
    localHosts: deps.config.connections.localHosts,
  })
  const outbox: ConnectionsOutbox = { write: (tx, event) => deps.outbox().write(tx, event) }
  const writer = new ConnectionWriter({
    db: deps.db,
    repository,
    secrets,
    presenter,
    audit: deps.audit,
    outbox,
  })
  const health = new ConnectionHealth({ repository, audit: deps.audit, outbox })
  const tokens = new ConnectionTokens({
    db: deps.db,
    repository,
    secrets,
    health,
    adapters,
    oauthApps,
    http,
    client: deps.cache.client,
  })
  const lastUsed = new ConnectionsLastUsed({
    client: deps.cache.client,
    db: deps.db,
    repository,
    logger: deps.logger,
  })
  const service = new ConnectionsService({
    db: deps.db,
    repository,
    secrets,
    presenter,
    targets,
    writer,
    health,
    tokens,
    lastUsed,
    dependents,
    audit: deps.audit,
    outbox,
    http,
    oauthApps,
  })
  const oauth = new ConnectionsOauth({
    db: deps.db,
    repository,
    targets,
    writer,
    states: new OauthStateStore(deps.cache.client),
    http,
    oauthApps,
    appOrigin: deps.config.web.apps.workspace,
  })
  const maintenance = new ConnectionsMaintenance({
    db: deps.db,
    repository,
    tokens,
    logger: deps.logger,
  })
  return {
    /** Other modules use connections through this: `assertUsable` at save time, `open` at run time. */
    service,
    /** The client for calls to other apps; agent tools send their requests through it too. */
    http,
    maintenance,
    lastUsed,
    jobs: [
      createRefreshJob(maintenance),
      createFlushLastUsedJob(lastUsed),
      createCleanupJob(maintenance),
    ],
    outboxHandlers: [
      createConnectionExpiredHandler({
        db: deps.db,
        repository,
        notifications: deps.notifications,
        logger: deps.logger,
      }),
    ],
    /** Removing a member disconnects their personal connections. */
    memberRemoval: createConnectionsMemberRemoval({ repository, audit: deps.audit, outbox }),
    routes: connectionsRoutes(new ConnectionsController(service, oauth)),
  }
}
export type ConnectionsModule = ReturnType<typeof createConnectionsModule>
