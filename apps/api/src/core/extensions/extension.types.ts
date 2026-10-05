// SPDX-License-Identifier: AGPL-3.0-only

import type { Cache } from '@/core/cache/index.js'
import type { Config } from '@/core/config/index.js'
import type { Database } from '@/core/database/index.js'
import type { Logger } from '@/core/logger/index.js'
import type { Queues, RegisteredJob } from '@/core/queue/index.js'
import type { AccessCheck, EntitlementSource } from '@/modules/access/entitlements.types.js'
import type { ModelCallGuard, ModelSource } from '@/modules/modelGateway/modelGateway.types.js'
import type { PublicModules } from '@/types/modules.js'
import type { BetterAuthPlugin } from 'better-auth'
import type { FastifyPluginAsyncZod } from 'fastify-type-provider-zod'
import type { z } from 'zod'

/** What a private Enterprise or Cloud package exports as `extension`. */
export interface ApiExtension {
  /** Stable identifier, for example 'surefy-ee' or 'surefy-cloud'. */
  name: string
  /** Called once per process, after public modules are created and before Better Auth and routes. */
  register(context: ExtensionContext): Promise<void> | void
}

export interface ExtensionContext {
  config: Config
  logger: Logger
  db: Database
  cache: Cache
  queues: Queues
  /** Public module services (audit, access, usage…). */
  modules: PublicModules
  /** The points an extension may contribute to. */
  hooks: ExtensionHooks
}

export interface MigrationsFolder {
  path: string
  /** `__drizzle_migrations_ee`, `__drizzle_migrations_cloud`: one table per folder, in the `drizzle` schema. */
  table: string
}

/**
 * Extension points with a Community default each; modules read the contributions at call time.
 * Module tasks add the remaining hooks: `setRoleResolver`, `setAccessGrantResolver`,
 * `addAuditSink`, `onEvent`.
 */
export interface ExtensionHooks {
  /** Routes registered under /api/v1, after the core modules' routes. */
  addRoutes(plugin: FastifyPluginAsyncZod): void
  /** Better Auth plugins (SSO, SCIM); `createAuth` runs after every extension registered. */
  addAuthPlugins(plugins: readonly BetterAuthPlugin[]): void
  /** Job processors for the worker. */
  addJobs(jobs: readonly RegisteredJob[]): void
  /** Organization or install settings sections, validated on write. */
  addSettingsSchema(key: string, schema: z.ZodType): void
  /** Extension-owned tables, applied by db:migrate after the core folder. */
  addMigrationsFolder(path: string, migrationsTable: string): void
  /** The license (`ee-api`) or the plans (`cloud-api`) replace Community's; last one wins, logged. */
  setEntitlementSource(source: EntitlementSource): void
  /** A per-request organization check after the tenant is known, e.g. an IP allow-list. */
  addAccessCheck(check: AccessCheck): void
  /** Models outside Vault for keys with its prefix, e.g. Cloud's `platform/` models. */
  addModelSource(source: ModelSource): void
  /** A check before every model call, e.g. Cloud's credit balance (402). */
  addModelCallGuard(guard: ModelCallGuard): void
}

/** The container's registry: the hooks plus readers for what was contributed. */
export interface ExtensionRegistry extends ExtensionHooks {
  routes(): readonly FastifyPluginAsyncZod[]
  authPlugins(): readonly BetterAuthPlugin[]
  jobs(): readonly RegisteredJob[]
  settingsSchemas(): ReadonlyMap<string, z.ZodType>
  migrationsFolders(): readonly MigrationsFolder[]
  /** The contributed entitlement source; undefined keeps Community's. */
  entitlementSource(): EntitlementSource | undefined
  accessChecks(): readonly AccessCheck[]
  modelSources(): readonly ModelSource[]
  modelCallGuards(): readonly ModelCallGuard[]
}
