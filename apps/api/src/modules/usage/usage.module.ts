// SPDX-License-Identifier: AGPL-3.0-only
import type { CredentialSpendDto } from '@surefy/contracts'

import { InsightsService } from './insights.service.js'
import { UsageController } from './usage.controller.js'
import { createAggregateUsageJob } from './usage.jobs.js'
import { UsageRepository } from './usage.repository.js'
import { usageRoutes } from './usage.routes.js'
import { createUsageCsvProducer } from './usageExport.js'
import { UsageMeter } from './usageMeter.js'
import { UsageRollupService } from './usageRollup.service.js'

import type { UsageModels, UsageTeams, UsageUserRefs } from './usage.types.js'
import type { Cache } from '@/core/cache/index.js'
import type { Database } from '@/core/database/index.js'
import type { Logger } from '@/core/logger/index.js'
import type { VaultUsage } from '@/modules/vault/index.js'

export interface UsageModuleDeps {
  db: Database
  cache: Cache
  logger: Logger
  teams: UsageTeams
  users: UsageUserRefs
  models: UsageModels
}

/**
 * Usage and Insights: the meter the model gateway records through, the hourly and nightly
 * rollups, the Insights endpoints, the usage CSV export and the spend per Vault key. Created
 * before the vault and the gateway, which take its `vaultUsage` and `meter`.
 */
export function createUsageModule(deps: UsageModuleDeps) {
  const repository = new UsageRepository()
  const meter = new UsageMeter({ db: deps.db, repository, logger: deps.logger })
  const rollup = new UsageRollupService({ db: deps.db, cache: deps.cache, repository })
  const insights = new InsightsService({
    db: deps.db,
    cache: deps.cache,
    repository,
    teams: deps.teams,
    users: deps.users,
    models: deps.models,
  })
  const vaultUsage: VaultUsage = {
    async spendThisMonth(tx, orgId, credentialIds) {
      const spend = new Map<string, CredentialSpendDto[]>()
      for (const row of await repository.spendByCredential(tx, orgId, credentialIds)) {
        const list = spend.get(row.credentialId) ?? []
        list.push({ currency: row.currency, costMicros: row.costMicros })
        spend.set(row.credentialId, list)
      }
      return spend
    },
    usersThisMonth: (tx, orgId, credentialId) =>
      repository.usersOfCredential(tx, orgId, credentialId),
  }
  return {
    meter,
    rollup,
    insights,
    vaultUsage,
    exportProducers: [createUsageCsvProducer(repository)],
    jobs: [createAggregateUsageJob(rollup)],
    routes: usageRoutes(new UsageController(insights)),
  }
}
export type UsageModule = ReturnType<typeof createUsageModule>
