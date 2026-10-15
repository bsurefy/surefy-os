// SPDX-License-Identifier: AGPL-3.0-only
import type { CredentialSpendDto } from '@surefy/contracts'

import { BudgetAlerts } from './budgetAlerts.js'
import { BudgetCounters } from './budgetCounters.js'
import { BudgetEnforcer } from './budgetEnforcement.js'
import { BudgetsController } from './budgets.controller.js'
import { createBudgetAlertJob } from './budgets.jobs.js'
import { BudgetsRepository } from './budgets.repository.js'
import { budgetsRoutes } from './budgets.routes.js'
import { BudgetsService } from './budgets.service.js'
import { InsightsService } from './insights.service.js'
import { RunStatsRepository } from './runStats.repository.js'
import { UsageController } from './usage.controller.js'
import { createAggregateUsageJob } from './usage.jobs.js'
import { UsageRepository } from './usage.repository.js'
import { usageRoutes } from './usage.routes.js'
import { createUsageCsvProducer } from './usageExport.js'
import { UsageMeter } from './usageMeter.js'
import { UsageRollupService } from './usageRollup.service.js'

import type { BudgetsNotifier, BudgetsOrganizations, BudgetsOutbox } from './budgets.types.js'
import type {
  UsageAgents,
  UsageApprovals,
  UsageModels,
  UsageTeams,
  UsageUserRefs,
} from './usage.types.js'
import type { Cache } from '@/core/cache/index.js'
import type { Database } from '@/core/database/index.js'
import type { Logger } from '@/core/logger/index.js'
import type { Queues } from '@/core/queue/index.js'
import type { AuditRecorder } from '@/modules/audit/index.js'
import type { VaultUsage } from '@/modules/vault/index.js'
import type { FastifyPluginAsyncZod } from 'fastify-type-provider-zod'

export interface UsageModuleDeps {
  db: Database
  cache: Cache
  queues: Queues
  logger: Logger
  teams: UsageTeams
  users: UsageUserRefs
  models: UsageModels
  /** Read per request: the agents module is built after this one. */
  agents: () => UsageAgents
  approvals: UsageApprovals
  organizations: BudgetsOrganizations
  notifications: BudgetsNotifier
  audit: AuditRecorder
  /** Built after this module: read when a budget changes or an alert fires. */
  outbox: () => BudgetsOutbox
}

/**
 * Usage, budgets and Insights: the meter the model gateway records through, the budgets it
 * enforces, the hourly and nightly rollups, the Insights endpoints, the usage CSV export and the
 * spend per Vault key. Created before the vault and the gateway, which take its `vaultUsage`,
 * `meter` and `budgets`.
 */
export function createUsageModule(deps: UsageModuleDeps) {
  const repository = new UsageRepository()
  const budgetsRepository = new BudgetsRepository()
  const counters = new BudgetCounters(deps.cache)
  const alertJob = createBudgetAlertJob(() => alerts)
  const budgets = new BudgetEnforcer({
    db: deps.db,
    cache: deps.cache,
    queues: deps.queues,
    logger: deps.logger,
    repository: budgetsRepository,
    counters,
    alertJob: () => alertJob,
  })
  const alerts = new BudgetAlerts({
    db: deps.db,
    logger: deps.logger,
    repository: budgetsRepository,
    counters,
    enforcer: budgets,
    outbox: deps.outbox,
    notifications: deps.notifications,
  })
  const budgetsService = new BudgetsService({
    db: deps.db,
    repository: budgetsRepository,
    enforcer: budgets,
    organizations: deps.organizations,
    teams: deps.teams,
    users: deps.users,
    audit: deps.audit,
    outbox: deps.outbox,
  })
  const meter = new UsageMeter({
    db: deps.db,
    repository,
    logger: deps.logger,
    onRecorded: (orgId, event) => budgets.recorded(orgId, event),
  })
  const rollup = new UsageRollupService({
    db: deps.db,
    cache: deps.cache,
    logger: deps.logger,
    repository,
    runStats: new RunStatsRepository(),
    reconcile: () => alerts.reconcile(),
  })
  const insights = new InsightsService({
    db: deps.db,
    cache: deps.cache,
    repository,
    teams: deps.teams,
    users: deps.users,
    models: deps.models,
    agents: deps.agents,
    approvals: deps.approvals,
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
  const insightsRoutes = usageRoutes(new UsageController(insights, budgetsService))
  const budgetRoutes = budgetsRoutes(new BudgetsController(budgetsService))
  const routes: FastifyPluginAsyncZod = async (app, options) => {
    await insightsRoutes(app, options)
    await budgetRoutes(app, options)
  }
  return {
    meter,
    budgets,
    budgetAlerts: alerts,
    budgetsService,
    rollup,
    insights,
    vaultUsage,
    exportProducers: [createUsageCsvProducer(repository)],
    jobs: [createAggregateUsageJob(rollup), alertJob],
    outboxHandlers: [alerts.changedHandler(), alerts.thresholdReachedHandler()],
    routes,
  }
}
export type UsageModule = ReturnType<typeof createUsageModule>
