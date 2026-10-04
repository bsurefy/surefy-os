// SPDX-License-Identifier: AGPL-3.0-only
import { createAuth } from './core/auth/index.js'
import { createCache, type Cache } from './core/cache/index.js'
import { createDatabase, type Database } from './core/database/index.js'
import {
  createExtensionRegistry,
  loadExtensions,
  type ExtensionRegistry,
} from './core/extensions/index.js'
import { createLogger, type Logger } from './core/logger/index.js'
import { createQueues, type Queues } from './core/queue/index.js'
import { createMail, type MailProvider } from './integrations/mail/index.js'
import { createStorage, type StorageProvider } from './integrations/storage/index.js'
import {
  createAuthEmails,
  createAuthModule,
  createAuthUsers,
  createSignupPolicy,
} from './modules/auth/index.js'
import { createInstallModule, createInstallSettings } from './modules/install/index.js'
import { createMembersModule, createMemberships } from './modules/members/index.js'
import { createNotificationsModule } from './modules/notifications/index.js'
import { createOrganizationsModule } from './modules/organizations/index.js'
import { createSetupModule } from './modules/setup/index.js'
import { createTeamsModule } from './modules/teams/index.js'

import type { Config } from './core/config/index.js'
import type { TenantAccessResolver } from './plugins/access.plugin.js'
import type { PublicModules } from './types/modules.js'

/** External providers behind their interfaces. AI, ML and search join as they are built. */
export interface Integrations {
  storage: StorageProvider
  mail: MailProvider
}

export interface ContainerOverrides {
  /** Fakes for tests: no real storage, AI calls or email. */
  integrations?: Integrations
  /** Infrastructure clients for tests that run without Redis or Postgres. */
  logger?: Logger
  db?: Database
  cache?: Cache
  queues?: Queues
  /** Skips the dynamic import of the private packages (tests). */
  extensions?: readonly string[]
  /**
   * Memberships and effective access for `app.authorize()`. The members module's membership
   * resolver applies until the access module provides effective access.
   */
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
  }
  const hooks: ExtensionRegistry = createExtensionRegistry(logger) // Community defaults

  // 2. Public modules, in dependency order. Each module task appends its own line here, for
  //    example: const audit = createAuditModule({ db, hooks })
  const users = createAuthUsers({ db, storage: integrations.storage })
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
  })
  const teams = createTeamsModule({
    db,
    memberships: memberships.service,
    organizations: organizations.service,
    users,
  })
  const members = createMembersModule({
    config,
    db,
    memberships,
    organizations: organizations.service,
    teams: teams.service,
    users,
    notifications: notifications.service,
  })
  notifications.onEmailDelivery(members.invitations.onEmailDelivery)
  const install = createInstallModule({
    config,
    db,
    settings: installSettings,
    users,
    logos: organizations.service,
  })
  const modules = { notifications, organizations, teams, members, install } satisfies PublicModules

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
  const tenants = overrides.tenants ?? members.access

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
