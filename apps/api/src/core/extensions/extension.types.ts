// SPDX-License-Identifier: AGPL-3.0-only

import type { Cache } from '@/core/cache/index.js'
import type { Config } from '@/core/config/index.js'
import type { Database } from '@/core/database/index.js'
import type { Logger } from '@/core/logger/index.js'
import type { Queues, RegisteredJob } from '@/core/queue/index.js'
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
 * Extension points with a Community default each. Module tasks add the hooks their modules read
 * at call time: `setEntitlementSource`, `setRoleResolver`, `setAccessGrantResolver`,
 * `addAccessCheck`, `addAuditSink`, `onEvent`, `addModelSource`, `addModelCallGuard`.
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
}

/** The container's registry: the hooks plus readers for what was contributed. */
export interface ExtensionRegistry extends ExtensionHooks {
  routes(): readonly FastifyPluginAsyncZod[]
  authPlugins(): readonly BetterAuthPlugin[]
  jobs(): readonly RegisteredJob[]
  settingsSchemas(): ReadonlyMap<string, z.ZodType>
  migrationsFolders(): readonly MigrationsFolder[]
}
