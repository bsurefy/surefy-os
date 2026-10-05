// SPDX-License-Identifier: AGPL-3.0-only
import { outboxHandler, type OutboxHandler } from '@/modules/outbox/index.js'

import type { ExtensionRegistry, MigrationsFolder } from './extension.types.js'
import type { Logger } from '@/core/logger/index.js'
import type { RegisteredJob } from '@/core/queue/index.js'
import type { AccessCheck, EntitlementSource } from '@/modules/access/entitlements.types.js'
import type { ModelCallGuard, ModelSource } from '@/modules/modelGateway/modelGateway.types.js'
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
  const accessChecks: AccessCheck[] = []
  const modelSources: ModelSource[] = []
  const modelCallGuards: ModelCallGuard[] = []
  const outboxHandlers: OutboxHandler[] = []
  let entitlementSource: EntitlementSource | undefined

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
    setEntitlementSource(source) {
      if (entitlementSource !== undefined) {
        logger.warn(
          { previous: entitlementSource.name, next: source.name },
          'entitlement source replaced by an extension',
        )
      }
      entitlementSource = source
    },
    addAccessCheck(check) {
      accessChecks.push(check)
    },
    addModelSource(source) {
      modelSources.push(source)
    },
    addModelCallGuard(guard) {
      modelCallGuards.push(guard)
    },
    onEvent(topic, handle) {
      outboxHandlers.push(outboxHandler(topic, `extension:${topic}`, handle))
    },
    routes: () => routes,
    authPlugins: () => authPlugins,
    jobs: () => jobs,
    settingsSchemas: () => settingsSchemas,
    migrationsFolders: () => migrationsFolders,
    entitlementSource: () => entitlementSource,
    accessChecks: () => accessChecks,
    modelSources: () => modelSources,
    modelCallGuards: () => modelCallGuards,
    outboxHandlers: () => outboxHandlers,
  }
}
