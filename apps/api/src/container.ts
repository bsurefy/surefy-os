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
import { createMlDocuments } from './integrations/ml/index.js'
import { createStorage, type StorageProvider } from './integrations/storage/index.js'
import { createAccessModule, createEntitlementSource } from './modules/access/index.js'
import { createAuditModule, createInstallAudit } from './modules/audit/index.js'
import {
  createAuthEmails,
  createAuthModule,
  createAuthUsers,
  createSignupPolicy,
} from './modules/auth/index.js'
import { createChatDocumentParser, createChatsModule } from './modules/chats/index.js'
import { createDataControlModule } from './modules/dataControl/index.js'
import { createInstallModule, createInstallSettings } from './modules/install/index.js'
import { createMembersModule, createMemberships } from './modules/members/index.js'
import { createModelGatewayModule } from './modules/modelGateway/index.js'
import { createNotificationsModule } from './modules/notifications/index.js'
import { createOrganizationsModule } from './modules/organizations/index.js'
import { createSetupModule } from './modules/setup/index.js'
import { createTeamsModule } from './modules/teams/index.js'
import { createUsageModule } from './modules/usage/index.js'
import {
  createModelGrants,
  createVaultMemberRemoval,
  createVaultModule,
  createVaultOrganizationSetup,
  VaultRepository,
} from './modules/vault/index.js'

import type { Config } from './core/config/index.js'
import type { TenantAccessResolver } from './plugins/access.plugin.js'
import type { PublicModules } from './types/modules.js'

/** External providers behind their interfaces. ML and search join as they are built. */
export interface Integrations {
  storage: StorageProvider
  mail: MailProvider
  /** AI providers by `provider_key`; tests pass `createAiProviders({ fetch })` with a fake. */
  ai: AiProviders
}

export interface ContainerOverrides {
  /** Fakes for tests: no real storage, AI calls or email. */
  integrations?: Integrations
  /** Only the AI providers, when the other integrations stay real (tests). */
  ai?: AiProviders
  /** Infrastructure clients for tests that run without Redis or Postgres. */
  logger?: Logger
  db?: Database
  cache?: Cache
  queues?: Queues
  /** Skips the dynamic import of the private packages (tests). */
  extensions?: readonly string[]
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
    removalSteps: [createVaultMemberRemoval({ repository: vaultRepository, audit: audit.service })],
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
  const chats = createChatsModule({
    db,
    queues,
    logger,
    storage: integrations.storage,
    encryptionKey: config.crypto.encryptionKey,
    gateway: modelGateway.service,
    models: modelGrants.modelsRepository,
    parser: createChatDocumentParser({
      ml: createMlDocuments({ url: config.ml.url, token: config.ml.token }),
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
  const modules = {
    audit,
    notifications,
    organizations,
    teams,
    members,
    install,
    access,
    vault,
    modelGateway,
    chats,
    usage,
    dataControl,
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
