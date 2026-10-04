// SPDX-License-Identifier: AGPL-3.0-only
import type { ExtensionRegistry, MigrationsFolder } from './extension.types.js'
import type { Logger } from '@/core/logger/index.js'
import type { RegisteredJob } from '@/core/queue/index.js'
import type { BetterAuthPlugin } from 'better-auth'
import type { FastifyPluginAsyncZod } from 'fastify-type-provider-zod'
import type { z } from 'zod'

/** The Community defaults: nothing contributed. Extensions add to it in `register`. */
export function createExtensionRegistry(logger: Logger): ExtensionRegistry {
  const routes: FastifyPluginAsyncZod[] = []
  const authPlugins: BetterAuthPlugin[] = []
  const jobs: RegisteredJob[] = []
  const settingsSchemas = new Map<string, z.ZodType>()
  const migrationsFolders: MigrationsFolder[] = []

  return {
    addRoutes(plugin) {
      routes.push(plugin)
    },
    addAuthPlugins(plugins) {
      authPlugins.push(...plugins)
    },
    addJobs(definitions) {
      jobs.push(...definitions)
    },
    addSettingsSchema(key, schema) {
      if (settingsSchemas.has(key)) {
        // Last one wins, like the entitlement source, but it is worth a line in the log.
        logger.warn({ key }, 'settings schema replaced by an extension')
      }
      settingsSchemas.set(key, schema)
    },
    addMigrationsFolder(path, table) {
      migrationsFolders.push({ path, table })
    },
    routes: () => routes,
    authPlugins: () => authPlugins,
    jobs: () => jobs,
    settingsSchemas: () => settingsSchemas,
    migrationsFolders: () => migrationsFolders,
  }
}
