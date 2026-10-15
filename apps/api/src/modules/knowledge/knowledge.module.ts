// SPDX-License-Identifier: AGPL-3.0-only
import { KnowledgeController } from './knowledge.controller.js'
import { KnowledgeRepository } from './knowledge.repository.js'
import { knowledgeRoutes } from './knowledge.routes.js'
import { KnowledgeService } from './knowledge.service.js'
import { KnowledgeAccessService } from './knowledgeAccess.service.js'
import { KnowledgeConnectionEvents } from './knowledgeConnectors/knowledgeConnectionEvents.js'
import { KnowledgeConnectorsController } from './knowledgeConnectors/knowledgeConnectors.controller.js'
import {
  createKnowledgeConnectors,
  type KnowledgeConnectorEndpoints,
} from './knowledgeConnectors/knowledgeConnectors.js'
import { knowledgeConnectorsRoutes } from './knowledgeConnectors/knowledgeConnectors.routes.js'
import { KnowledgeConnectorsService } from './knowledgeConnectors/knowledgeConnectors.service.js'
import { KnowledgeEmbeddingService } from './knowledgeEmbedding.service.js'
import { KnowledgeGrantsService } from './knowledgeGrants.service.js'
import { createKnowledgeJobs } from './knowledgeIngestion/knowledgeIngestion.jobs.js'
import { KnowledgeIngestionRepository } from './knowledgeIngestion/knowledgeIngestion.repository.js'
import { KnowledgeIngestionService } from './knowledgeIngestion/knowledgeIngestion.service.js'
import { KnowledgeReembedService } from './knowledgeIngestion/knowledgeReembed.service.js'
import { KnowledgeSyncService } from './knowledgeIngestion/knowledgeSync.service.js'
import { safeGet, type SafeGet } from './knowledgeIngestion/safeFetch.js'
import { createKnowledgePurgeHandlers } from './knowledgePurge.js'
import { KnowledgeChatRetrieval } from './knowledgeRetrieval/knowledgeChatRetrieval.js'
import { KnowledgeRetrievalRepository } from './knowledgeRetrieval/knowledgeRetrieval.repository.js'
import { KnowledgeRetrievalService } from './knowledgeRetrieval/knowledgeRetrieval.service.js'
import { KnowledgeSearchService } from './knowledgeRetrieval/knowledgeSearch.service.js'
import { KnowledgeSourcesController } from './knowledgeSources/knowledgeSources.controller.js'
import { KnowledgeSourcesRepository } from './knowledgeSources/knowledgeSources.repository.js'
import { knowledgeSourcesRoutes } from './knowledgeSources/knowledgeSources.routes.js'
import { KnowledgeSourcesService } from './knowledgeSources/knowledgeSources.service.js'
import { KnowledgeViews } from './knowledgeViews.js'

import type {
  KnowledgeConnections,
  KnowledgeFiles,
  KnowledgeGateway,
  KnowledgeMemberships,
  KnowledgeModels,
  KnowledgeOrganizations,
  KnowledgePeople,
  KnowledgeTeams,
  KnowledgeUsers,
} from './knowledge.types.js'
import type { Database } from '@/core/database/index.js'
import type { Logger } from '@/core/logger/index.js'
import type { Queues } from '@/core/queue/index.js'
import type { MlService } from '@/integrations/ml/index.js'
import type { AuditRecorder } from '@/modules/audit/index.js'
import type { OutboundHttp } from '@/modules/connections/index.js'
import type { NotifyInput } from '@/modules/notifications/notifications.types.js'
import type { FastifyPluginAsyncZod } from 'fastify-type-provider-zod'

export interface KnowledgeModuleDeps {
  db: Database
  logger: Logger
  queues: Queues
  ml: MlService
  files: KnowledgeFiles
  gateway: KnowledgeGateway
  models: KnowledgeModels
  teams: KnowledgeTeams
  users: KnowledgeUsers
  memberships: KnowledgeMemberships
  organizations: KnowledgeOrganizations
  notifications: { notify(ctx: { orgId: string }, input: NotifyInput): Promise<unknown> }
  audit: AuditRecorder
  /** Connector sources: the connections they sync through and the members whose rights they use. */
  connections: KnowledgeConnections
  people: KnowledgePeople
  /** The connections module's client for calls to other apps; the connector API calls use it. */
  http: OutboundHttp
  /** Other Drive and Notion API addresses (stub servers in end-to-end tests). */
  connectorEndpoints?: KnowledgeConnectorEndpoints
  /** The install's local hosts, which connector downloads from those addresses may reach. */
  localHosts?: readonly string[]
  /** Replaces the outbound HTTP client of link crawls and connector downloads (tests). */
  get?: SafeGet
}

/**
 * Knowledge: bases, access, sources and documents, the ingestion pipeline and its jobs, link
 * sync, re-embedding, and retrieval with citations for chat (`retrieval`) and Test search. The
 * ingestion service is built first with a thunk for the job definitions, which are built from it.
 */
export function createKnowledgeModule(deps: KnowledgeModuleDeps) {
  const repository = new KnowledgeRepository()
  const sourcesRepository = new KnowledgeSourcesRepository()
  const ingestionRepository = new KnowledgeIngestionRepository()
  const access = new KnowledgeAccessService({ db: deps.db, repository })
  const views = new KnowledgeViews({
    db: deps.db,
    repository,
    models: deps.models,
    users: deps.users,
  })

  const ingestion: KnowledgeIngestionService = new KnowledgeIngestionService({
    db: deps.db,
    repository,
    ingestion: ingestionRepository,
    ml: deps.ml,
    files: deps.files,
    gateway: deps.gateway,
    memberships: deps.memberships,
    notifications: deps.notifications,
    queues: deps.queues,
    jobs: () => jobs,
    logger: deps.logger,
  })
  const get = deps.get ?? safeGet
  const clients = createKnowledgeConnectors({
    http: deps.http,
    get,
    ...(deps.connectorEndpoints === undefined ? {} : { endpoints: deps.connectorEndpoints }),
    ...(deps.localHosts === undefined ? {} : { localHosts: deps.localHosts }),
  })
  const sync = new KnowledgeSyncService({
    db: deps.db,
    repository,
    sources: sourcesRepository,
    ingestion: ingestionRepository,
    service: ingestion,
    files: deps.files,
    get,
    connections: deps.connections,
    people: deps.people,
    clients,
    logger: deps.logger,
  })
  const reembed = new KnowledgeReembedService({
    db: deps.db,
    repository,
    ingestion: ingestionRepository,
    service: ingestion,
    files: deps.files,
    gateway: deps.gateway,
    logger: deps.logger,
  })
  const jobs = createKnowledgeJobs(() => ({ ingestion, sync, reembed }))

  const service = new KnowledgeService({
    db: deps.db,
    repository,
    access,
    views,
    teams: deps.teams,
    users: deps.users,
    organizations: deps.organizations,
    models: deps.models,
    ingestion,
    audit: deps.audit,
  })
  const embedding = new KnowledgeEmbeddingService({
    db: deps.db,
    repository,
    access,
    views,
    models: deps.models,
    ingestion,
    audit: deps.audit,
  })
  const grants = new KnowledgeGrantsService({
    db: deps.db,
    repository,
    access,
    teams: deps.teams,
    users: deps.users,
    memberships: deps.memberships,
    organizations: deps.organizations,
    audit: deps.audit,
  })
  const retrievalRepository = new KnowledgeRetrievalRepository()
  const retrieval = new KnowledgeRetrievalService({
    db: deps.db,
    repository,
    retrieval: retrievalRepository,
    access,
    models: deps.models,
    gateway: deps.gateway,
  })
  const chatRetrieval = new KnowledgeChatRetrieval({
    db: deps.db,
    repository,
    retrieval,
    passages: retrievalRepository,
    access,
  })
  const search = new KnowledgeSearchService({
    db: deps.db,
    access,
    retrieval,
    models: deps.models,
    teams: deps.teams,
    gateway: deps.gateway,
  })
  const sources = new KnowledgeSourcesService({
    db: deps.db,
    repository,
    sources: sourcesRepository,
    access,
    files: deps.files,
    ingestion,
    users: deps.users,
    audit: deps.audit,
    connectionStatus: async (tx, orgId, connectionId) =>
      (await deps.connections.statuses(tx, orgId, [connectionId])).get(connectionId)?.status ??
      null,
  })
  const connectors = new KnowledgeConnectorsService({
    db: deps.db,
    repository,
    sources: sourcesRepository,
    access,
    connections: deps.connections,
    clients,
    ingestion,
    audit: deps.audit,
    present: (orgId, row) => sources.dto(orgId, row),
  })
  const connectionEvents = new KnowledgeConnectionEvents({
    db: deps.db,
    repository,
    sources: sourcesRepository,
    ingestion,
    audit: deps.audit,
    logger: deps.logger,
  })

  const basesRoutes = knowledgeRoutes(new KnowledgeController(service, embedding, grants, search))
  const sourceRoutes = knowledgeSourcesRoutes(new KnowledgeSourcesController(sources))
  const connectorRoutes = knowledgeConnectorsRoutes(new KnowledgeConnectorsController(connectors))
  const routes: FastifyPluginAsyncZod = (app) => {
    app.register(basesRoutes)
    app.register(sourceRoutes)
    app.register(connectorRoutes)
    return Promise.resolve()
  }

  return {
    service,
    sources,
    grants,
    embedding,
    /** Retrieval for chat and agents: access-filtered hybrid search with passages to cite. */
    retrieval,
    /** What chats search with: pass it to `createChatsModule` as `retrieval`. */
    chatRetrieval,
    access,
    ingestion,
    sync,
    reembed,
    connectors,
    /** Connector sources as dependents of their connection: pass to `createConnectionsModule`. */
    connectionDependents: connectionEvents.dependents(),
    /**
     * `knowledge_base.purged` and `knowledge_source.purged` remove the documents' stored objects;
     * the `connection.*` events pause, resume or remove connector sources.
     */
    outboxHandlers: [...createKnowledgePurgeHandlers(deps.files), ...connectionEvents.handlers()],
    jobs: jobs.all,
    routes,
  }
}
export type KnowledgeModule = ReturnType<typeof createKnowledgeModule>
