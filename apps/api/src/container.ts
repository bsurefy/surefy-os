// SPDX-License-Identifier: AGPL-3.0-only
import { createAuth } from './core/auth/index.js'
import { createCache, type Cache } from './core/cache/index.js'
import { createCrypto } from './core/crypto/index.js'
import { createDatabase, type Database } from './core/database/index.js'
import {
  createExtensionRegistry,
  loadExtensions,
  type ExtensionRegistry,
} from './core/extensions/index.js'
import { createLogger, type Logger } from './core/logger/index.js'
import { createQueues, type Queues } from './core/queue/index.js'
import { createAiProviders, type AiProviders } from './integrations/ai/index.js'
import { createMail, type MailProvider } from './integrations/mail/index.js'
import { createMl, type MlService } from './integrations/ml/index.js'
import { createStorage, type StorageProvider } from './integrations/storage/index.js'
import { createAccessModule, createEntitlementSource } from './modules/access/index.js'
import { createAgentPublishingModule, createChannelStore } from './modules/agentPublishing/index.js'
import {
  createAgentRunsAgents,
  createAgentRunsModule,
  createAgentRunsPeople,
  createAgentRunSummaries,
} from './modules/agentRuns/index.js'
import { createAgentsModels, createAgentsModule } from './modules/agents/index.js'
import { createAgentToolsModule } from './modules/agentTools/index.js'
import { createApiKeysModule } from './modules/apiKeys/index.js'
import {
  createApprovalsModule,
  type ApprovalSubjects,
  type ApprovalsGuard,
} from './modules/approvals/index.js'
import { createAuditModule, createInstallAudit } from './modules/audit/index.js'
import {
  createAuthEmails,
  createAuthModule,
  createAuthUsers,
  createSignupPolicy,
} from './modules/auth/index.js'
import { createChatDocumentParser, createChatsModule } from './modules/chats/index.js'
import { createConnectionsModule, type OutboundHttp } from './modules/connections/index.js'
import { createDataControlModule } from './modules/dataControl/index.js'
import { createFilesModule } from './modules/files/index.js'
import {
  createGuardApprovalsPort,
  createGuardModule,
  createGuardSubjects,
  type GuardSubjects,
} from './modules/guard/index.js'
import { createInstallModule, createInstallSettings } from './modules/install/index.js'
import {
  createKnowledgeFiles,
  createKnowledgeModels,
  createKnowledgeModule,
  type KnowledgeFiles,
  type KnowledgeModuleDeps,
} from './modules/knowledge/index.js'
import { createMembersModule, createMemberships } from './modules/members/index.js'
import { createModelGatewayModule } from './modules/modelGateway/index.js'
import { createNotificationsModule } from './modules/notifications/index.js'
import { createOrganizationsModule } from './modules/organizations/index.js'
import { createOutboxModule } from './modules/outbox/index.js'
import { createSetupModule } from './modules/setup/index.js'
import { createTeamsModule } from './modules/teams/index.js'
import { createTemplatesModule } from './modules/templates/index.js'
import { createUsageModule } from './modules/usage/index.js'
import {
  createModelGrants,
  createVaultMemberRemoval,
  createVaultModule,
  createVaultOrganizationSetup,
  VaultRepository,
} from './modules/vault/index.js'
import { publicApiHost } from './plugins/security.plugin.js'

import type { Config } from './core/config/index.js'
import type { TenantAccessResolver } from './plugins/access.plugin.js'
import type { PublicModules } from './types/modules.js'

/** External providers behind their interfaces. Search joins as it is built. */
export interface Integrations {
  storage: StorageProvider
  mail: MailProvider
  /** The Python ML service (document parsing); tests pass a fake. */
  ml: MlService
  /** AI providers by `provider_key`; tests pass `createAiProviders({ fetch })` with a fake. */
  ai: AiProviders
}

export interface ContainerOverrides {
  /** Fakes for tests: no real storage, AI calls or email. */
  integrations?: Integrations
  /** Only the AI providers, when the other integrations stay real (tests). */
  ai?: AiProviders
  /** Only the ML service, when the other integrations stay real (tests). */
  ml?: MlService
  /** Knowledge's storage and web access, replaced by fakes in tests. */
  knowledge?: { files?: KnowledgeFiles; get?: NonNullable<KnowledgeModuleDeps['get']> }
  /** Infrastructure clients for tests that run without Redis or Postgres. */
  logger?: Logger
  db?: Database
  cache?: Cache
  queues?: Queues
  /** Skips the dynamic import of the private packages (tests). */
  extensions?: readonly string[]
  /** What the guard, agents and flows modules provide to approvals, replaced by fakes in tests. */
  approvals?: { guard?: ApprovalsGuard; subjects?: ApprovalSubjects }
  /** What the agents, flows and run modules tell Guard, replaced by fakes in tests. */
  guard?: { subjects?: GuardSubjects }
  /** The calls the connections module makes to other apps, replaced by a fake in tests. */
  connections?: { http?: OutboundHttp }
  /** Replaces the access module's effective access in `app.authorize()` (tests). */
  tenants?: TenantAccessResolver
}

/**
 * The composition root (architecture.md, §3). Nothing connects on import: clients open their
 * connections lazily, and the server and the worker both build the same graph, so a business
 * rule behaves the same in a request and in a job.
 */
export async function createContainer(config: Config, overrides: ContainerOverrides = {}) {
  // 1. Infrastructure clients (connections are opened lazily)
  const logger = overrides.logger ?? createLogger(config)
  const db = overrides.db ?? createDatabase(config, logger)
  const cache = overrides.cache ?? createCache(config, logger)
  const queues = overrides.queues ?? createQueues(config, logger)
  const integrations = overrides.integrations ?? {
    storage: createStorage(config, logger),
    mail: createMail(config, logger),
    ml: overrides.ml ?? createMl(config),
    ai: overrides.ai ?? createAiProviders(),
  }
  const crypto = createCrypto(config) // envelope encryption; keys are read per call, never cached in Redis
  const hooks: ExtensionRegistry = createExtensionRegistry(logger) // Community defaults

  // 2. Public modules, in dependency order. Each module task appends its own line here, for
  //    example: const audit = createAuditModule({ db, hooks })
  const users = createAuthUsers({ db, storage: integrations.storage })
  const audit = createAuditModule({ db, cache, queues, users })
  const entitlements = createEntitlementSource(hooks) // Community until an extension sets one
  const notifications = createNotificationsModule({
    config,
    db,
    queues,
    mail: integrations.mail,
    users,
  })
  const memberships = createMemberships()
  const installSettings = createInstallSettings({ db })
  const organizations = createOrganizationsModule({
    db,
    storage: integrations.storage,
    owners: memberships.service,
    creationRule: installSettings.service,
    installLimits: entitlements,
    audit: audit.service,
    initializers: [createVaultOrganizationSetup({ keyring: crypto.keyring })],
  })
  const teams = createTeamsModule({
    db,
    memberships: memberships.service,
    organizations: organizations.service,
    users,
    audit: audit.service,
    connections: () => connections.service,
    deletionSteps: () => [approvals.teamDeletion],
  })
  // the outbox is built after the modules that handle its events; connections writes through it
  const connections = createConnectionsModule({
    config,
    db,
    cache,
    crypto,
    logger,
    teams: teams.service,
    users,
    notifications: notifications.service,
    outbox: () => outbox.service,
    audit: audit.service,
    ...(overrides.connections?.http === undefined ? {} : { http: overrides.connections.http }),
  })
  // tools for agent runs: the executor (agentRuns) is their only caller
  const agentTools = createAgentToolsModule({
    connections: connections.service,
    http: connections.http,
  })
  // Guard creates approvals, so it is built after them; the settings it provides to them first
  const guardPort = createGuardApprovalsPort(overrides.guard?.subjects ?? createGuardSubjects())
  // fresh-session checks come from the access module, which is built after the modules below
  const approvals = createApprovalsModule({
    db,
    logger,
    access: {
      assertFreshSession: (ctx) => {
        access.service.assertFreshSession(ctx)
      },
    },
    teams: teams.service,
    users,
    notifications: notifications.service,
    outbox: () => outbox.service,
    audit: audit.service,
    guard: overrides.approvals?.guard ?? guardPort.approvalsGuard,
    ...(overrides.approvals?.subjects === undefined
      ? {}
      : { subjects: overrides.approvals.subjects }),
  })
  // the vault's repository is shared: member removal revokes personal keys through it
  const vaultRepository = new VaultRepository()
  const members = createMembersModule({
    config,
    db,
    memberships,
    organizations: organizations.service,
    teams: teams.service,
    users,
    notifications: notifications.service,
    audit: audit.service,
    removalSteps: [
      createVaultMemberRemoval({ repository: vaultRepository, audit: audit.service }),
      connections.memberRemoval,
      approvals.memberRemoval,
    ],
  })
  notifications.onEmailDelivery(members.invitations.onEmailDelivery)
  const install = createInstallModule({
    config,
    db,
    settings: installSettings,
    users,
    logos: organizations.service,
    installLimits: entitlements,
    audit: createInstallAudit(audit.service, logger),
  })
  const modelGrants = createModelGrants({
    db,
    organizations: organizations.service,
    teams: teams.service,
    users,
    audit: audit.service,
  })
  const usage = createUsageModule({
    db,
    cache,
    logger,
    teams: teams.service,
    users,
    models: modelGrants.modelsRepository,
  })
  const access = createAccessModule({
    db,
    cache,
    entitlements,
    hooks,
    organizations: organizations.service,
    teams: teams.service,
    users,
    audit: audit.service,
    models: modelGrants.service,
  })
  const apiKeys = createApiKeysModule({
    db,
    cache,
    logger,
    access: access.service,
    users,
    audit: audit.service,
    publicApiHost: publicApiHost(config),
  })
  const vault = createVaultModule({
    db,
    crypto,
    ai: integrations.ai,
    models: modelGrants,
    access: access.service,
    organizations: organizations.service,
    teams: teams.service,
    users,
    audit: audit.service,
    repository: vaultRepository,
    usage: usage.vaultUsage,
    notifications: notifications.service,
    logger,
  })
  const modelGateway = createModelGatewayModule({
    db,
    logger,
    crypto,
    ai: integrations.ai,
    vault,
    models: modelGrants,
    access: access.service,
    hooks,
    usage: usage.meter,
  })
  const guard = createGuardModule({
    db,
    cache,
    logger,
    port: guardPort,
    teams: teams.service,
    users,
    audit: audit.service,
    approvals: approvals.service,
    decider: modelGateway.service,
    ml: integrations.ml,
    outbox: () => outbox.service,
  })
  // agents and their templates; channels, dependency edges and runs join as their modules land
  const agentModels = createAgentsModels({ grants: modelGrants, access: access.service })
  const templates = createTemplatesModule({ db, models: agentModels })
  const channelStore = createChannelStore(users)
  const agents = createAgentsModule({
    db,
    teams: teams.service,
    users,
    organizations: organizations.service,
    models: agentModels,
    connections: connections.service,
    guard: guard.settings,
    toolProbe: agentTools.probe,
    templates: templates.service,
    audit: audit.service,
    outbox: () => outbox.service,
    approvals: {
      waitingCounts: (tx, orgId, agentIds) =>
        approvals.service.waitingCountsByAgent(tx, orgId, agentIds),
    },
    channels: channelStore.channels,
    runs: createAgentRunSummaries(),
  })
  const knowledge = createKnowledgeModule({
    db,
    logger,
    queues,
    ml: integrations.ml,
    files: overrides.knowledge?.files ?? createKnowledgeFiles(integrations.storage),
    ...(overrides.knowledge?.get === undefined ? {} : { get: overrides.knowledge.get }),
    gateway: modelGateway.service,
    models: createKnowledgeModels(modelGrants),
    teams: teams.service,
    users,
    memberships: memberships.service,
    organizations: organizations.service,
    notifications: notifications.service,
    audit: audit.service,
  })
  // the executor of agent runs: the worker runs its jobs, the starters call its service
  const agentRuns = createAgentRunsModule({
    db,
    cache,
    queues,
    logger,
    agents: createAgentRunsAgents(agents.repository),
    people: createAgentRunsPeople(access.service),
    users,
    models: agentModels,
    guard: guard.engine,
    gateway: modelGateway.service,
    tools: agentTools.service,
    knowledge: knowledge.retrieval,
    approvals: approvals.service,
    audit: audit.service,
    outbox: () => outbox.service,
  })
  const agentPublishing = createAgentPublishingModule({
    db,
    cache,
    store: channelStore,
    agents: createAgentRunsAgents(agents.repository),
    runs: agentRuns,
  })
  const chats = createChatsModule({
    db,
    queues,
    logger,
    storage: integrations.storage,
    encryptionKey: config.crypto.encryptionKey,
    gateway: modelGateway.service,
    models: modelGrants.modelsRepository,
    retrieval: knowledge.chatRetrieval,
    parser: createChatDocumentParser({
      ml: integrations.ml,
      storage: integrations.storage,
    }),
  })
  const dataControl = createDataControlModule({
    db,
    queues,
    storage: integrations.storage,
    logger,
    organizations: organizations.service,
    users,
    notifications: notifications.service,
    access: access.service,
    audit: audit.service,
    producers: usage.exportProducers,
  })
  const files = createFilesModule({ storage: integrations.storage })
  const outbox = createOutboxModule({
    db,
    queues,
    logger,
    handlers: [
      ...chats.outboxHandlers,
      ...knowledge.outboxHandlers,
      ...connections.outboxHandlers,
      ...approvals.outboxHandlers,
      ...guard.outboxHandlers,
      ...agentRuns.outboxHandlers,
    ],
    hooks,
  })
  const modules = {
    audit,
    notifications,
    organizations,
    teams,
    members,
    install,
    access,
    apiKeys,
    vault,
    connections,
    agentTools,
    agents,
    agentRuns,
    agentPublishing,
    templates,
    approvals,
    guard,
    modelGateway,
    chats,
    usage,
    dataControl,
    files,
    knowledge,
    outbox,
  } satisfies PublicModules

  // 3. Optional private extensions (Enterprise / Cloud) contribute through the hooks
  const names =
    overrides.extensions === undefined
      ? await loadExtensions({ config, logger, db, cache, queues, modules, hooks })
      : [...overrides.extensions]
  const extensions = {
    names,
    routes: hooks.routes(),
    jobs: hooks.jobs(),
    migrationsFolders: hooks.migrationsFolders(),
    settingsSchemas: hooks.settingsSchemas(),
    authPlugins: hooks.authPlugins(),
  }

  // 4. Better Auth last: its plugin list must include extension plugins (for example SSO)
  const signup = createSignupPolicy(installSettings.service, members.invitations)
  const auth = createAuth({
    config,
    db,
    redis: cache.client,
    logger,
    emails: createAuthEmails({ db, notifications: notifications.service }),
    signup,
    users,
    plugins: extensions.authPlugins,
  })
  const authModule = createAuthModule({
    config,
    db,
    auth,
    users,
    memberships: members.service,
    installAdmins: installSettings.service,
    organizationCreation: organizations.service,
    signup,
    installCapabilities: entitlements,
  })
  const setup = createSetupModule({
    config,
    db,
    logger,
    auth,
    storage: integrations.storage,
    install: installSettings.service,
    organizations: organizations.service,
    profiles: authModule.service,
    memberPreferences: members.preferences,
    members: members.service,
    invitations: members.invitations,
  })
  const tenants = overrides.tenants ?? access.service

  return {
    config,
    logger,
    db,
    cache,
    queues,
    integrations,
    hooks,
    extensions,
    auth,
    tenants,
    modules: { ...modules, auth: authModule, setup },
    async close() {
      await integrations.mail.close()
      await queues.close()
      await cache.quit()
      await db.close()
    },
  }
}
export type Container = Awaited<ReturnType<typeof createContainer>>
