// SPDX-License-Identifier: AGPL-3.0-only
import { orgKey } from '@/core/cache/index.js'
import { strictestBudgetAction } from '@surefy/contracts'
import type { BudgetOnReachedAction, BudgetScope, UsageEvent } from '@surefy/contracts'

import { BUDGETS_CACHE_TTL_SECONDS } from './budgets.constants.js'
import { BudgetExceededError } from './budgets.errors.js'
import { crossedThresholds, effectiveAmount, periodOf, yyyymm } from './budgets.utils.js'
import { utcDay } from './usage.utils.js'

import type { BudgetCounters, SpendCounter } from './budgetCounters.js'
import type { BudgetRow, BudgetsRepository } from './budgets.repository.js'
import type { Cache } from '@/core/cache/index.js'
import type { Database } from '@/core/database/index.js'
import type { Logger } from '@/core/logger/index.js'
import type { JobDefinition, Queues } from '@/core/queue/index.js'
import type {
  ModelCallBudgets,
  ModelCallBudgetVerdict,
  ModelCallContext,
} from '@/modules/modelGateway/index.js'

/** What the gateway needs of an enabled budget; cached per organization. */
export interface CachedBudget {
  id: string
  scope: BudgetScope
  teamId: string | null
  userId: string | null
  amountMicros: number
  currency: string
  onReached: BudgetOnReachedAction
  alertThresholdsBp: number[]
}

/** An enabled budget that applies to a call, with the amount that counts. */
export interface ApplicableBudget extends CachedBudget {
  effectiveAmountMicros: number
}

export interface BudgetAlertPayload {
  orgId: string
  budgetId: string
  periodStart: string
  thresholdBp: number
  spentMicros: number
}

export interface BudgetEnforcerDeps {
  db: Database
  cache: Cache
  queues: Queues
  logger: Logger
  repository: BudgetsRepository
  counters: BudgetCounters
  /** The `budgetAlert` job (built by the module, after this service). */
  alertJob: () => JobDefinition<BudgetAlertPayload>
  now?: () => Date
}

/** Who a call is charged to: the person, their primary team and the organization. */
export interface ChargedTo {
  userId: string | null
  teamId: string | null
}

export const budgetsCacheKey = (orgId: string): string => orgKey(orgId, 'budgets')

const toCached = (row: BudgetRow): CachedBudget => ({
  id: row.id,
  scope: row.scope,
  teamId: row.teamId,
  userId: row.userId,
  amountMicros: row.amountMicros,
  currency: row.currency,
  onReached: row.onReached,
  alertThresholdsBp: row.alertThresholdsBp,
})

const ALLOW: ModelCallBudgetVerdict = { action: 'allow' }

/** The enabled budgets a call counts against: the organization's, the primary team's, the person's. */
export function applicableBudgets(
  enabled: readonly CachedBudget[],
  charged: ChargedTo,
): ApplicableBudget[] {
  const applies = (budget: CachedBudget) =>
    budget.scope === 'organization' ||
    (budget.scope === 'team' && charged.teamId !== null && budget.teamId === charged.teamId) ||
    (budget.scope === 'user' && charged.userId !== null && budget.userId === charged.userId)
  return enabled.filter(applies).map((budget) => {
    const organization = enabled.find(
      (other) => other.scope === 'organization' && other.currency === budget.currency,
    )
    return {
      ...budget,
      effectiveAmountMicros: effectiveAmount(
        budget.amountMicros,
        budget.scope === 'organization' ? null : (organization?.amountMicros ?? null),
      ),
    }
  })
}

/**
 * Live budget enforcement (usage-budgets-and-audit.md): before a call to a cloud model, the
 * strictest `on_reached` of the reached budgets decides; after a metered call, its cost moves the
 * live counters and a crossed alert threshold enqueues `budgetAlert`. Calls without a person count
 * against the organization budget only. Enforcement is soft by the cost of calls in flight.
 */
export class BudgetEnforcer implements ModelCallBudgets {
  private readonly now: () => Date

  constructor(private readonly deps: BudgetEnforcerDeps) {
    this.now = deps.now ?? (() => new Date())
  }

  /** The enabled budgets of an organization, from the cache `org:{orgId}:budgets`. */
  enabled(orgId: string): Promise<CachedBudget[]> {
    return this.deps.cache.wrap(budgetsCacheKey(orgId), BUDGETS_CACHE_TTL_SECONDS, async () =>
      (await this.deps.db.tenant(orgId, (tx) => this.deps.repository.listEnabled(tx, orgId))).map(
        toCached,
      ),
    )
  }

  /** Drops the cached budget set; the next check loads it again. */
  async forget(orgId: string): Promise<void> {
    await this.deps.cache.del(budgetsCacheKey(orgId))
  }

  async check(ctx: ModelCallContext): Promise<ModelCallBudgetVerdict> {
    const charged: ChargedTo = {
      userId: ctx.userId,
      teamId: ctx.userId === null ? null : ctx.primaryTeamId,
    }
    const budgets = applicableBudgets(await this.enabled(ctx.orgId), charged)
    if (budgets.length === 0) return ALLOW
    const at = this.now()
    const reached: ApplicableBudget[] = []
    for (const budget of budgets) {
      const spent = await this.spend(ctx.orgId, budget, at)
      if (spent >= budget.effectiveAmountMicros) reached.push(budget)
    }
    const action = strictestBudgetAction(reached.map((budget) => budget.onReached))
    if (action === null || action === 'notify_only') return ALLOW
    // the budget that decided: the first one with the strictest action
    const decisive = reached.find((budget) => budget.onReached === action) ?? reached[0]
    if (decisive === undefined) return ALLOW
    const { periodEnd } = periodOf(at)
    return {
      action,
      error: new BudgetExceededError({
        scope: decisive.scope,
        amountMicros: decisive.effectiveAmountMicros,
        currency: decisive.currency,
        periodEnd,
      }),
    }
  }

  /**
   * This month's spend of a budget: the live counter, seeded from Postgres when missing. When
   * Redis cannot answer, Postgres does.
   */
  async spend(orgId: string, budget: CachedBudget, at: Date): Promise<number> {
    const counter = this.counterOf(orgId, budget, at)
    try {
      const live = await this.deps.counters.read(counter)
      if (live !== null) return live
    } catch (error) {
      this.deps.logger.warn({ err: error, orgId, budgetId: budget.id }, 'budget counter unreadable')
      return this.authoritativeSpend(orgId, budget, at)
    }
    const value = await this.authoritativeSpend(orgId, budget, at)
    try {
      return await this.deps.counters.seed(counter, value)
    } catch (error) {
      this.deps.logger.warn({ err: error, orgId, budgetId: budget.id }, 'budget counter not seeded')
      return value
    }
  }

  /**
   * After a usage row was inserted (and committed): adds its cost to the counters that exist and
   * enqueues an alert for each threshold the spend went past. A lost increment is repaired by the
   * hourly reconciliation.
   */
  async recorded(orgId: string, event: UsageEvent): Promise<void> {
    if (event.costMicros <= 0) return
    const budgets = applicableBudgets(await this.enabled(orgId), {
      userId: event.userId,
      teamId: event.teamId,
    }).filter((budget) => budget.currency === event.currency)
    if (budgets.length === 0) return
    const at = new Date(event.occurredAt)
    const counters = budgets.map((budget) => this.counterOf(orgId, budget, at))
    let moved: ({ before: number; after: number } | null)[]
    try {
      moved = await this.deps.counters.increment(counters, event.costMicros)
    } catch (error) {
      this.deps.logger.warn({ err: error, orgId }, 'budget counters not incremented')
      return
    }
    const { periodStart } = periodOf(at)
    for (const [i, budget] of budgets.entries()) {
      const change = moved[i]
      if (change == null) continue
      const crossed = crossedThresholds(
        change.before,
        change.after,
        budget.effectiveAmountMicros,
        budget.alertThresholdsBp,
      )
      for (const thresholdBp of crossed) {
        await this.enqueueAlert({
          orgId,
          budgetId: budget.id,
          periodStart,
          thresholdBp,
          spentMicros: change.after,
        })
      }
    }
  }

  /** `budgetAlert`, once per budget, month and threshold while the job exists. */
  async enqueueAlert(payload: BudgetAlertPayload): Promise<void> {
    const jobId = `budget-${payload.budgetId}-${yyyymm(payload.periodStart)}-${payload.thresholdBp}`
    try {
      await this.deps.queues.enqueue(this.deps.alertJob(), payload, { jobId })
    } catch (error) {
      // the hourly reconciliation inserts the alerts this missed
      this.deps.logger.warn({ err: error, ...payload }, 'budget alert not enqueued')
    }
  }

  private counterOf(orgId: string, budget: CachedBudget, at: Date): SpendCounter {
    return {
      orgId,
      month: periodOf(at).periodStart,
      currency: budget.currency,
      scope: budget.scope,
      scopeId: budget.teamId ?? budget.userId ?? orgId,
    }
  }

  private authoritativeSpend(orgId: string, budget: CachedBudget, at: Date): Promise<number> {
    const { periodStart } = periodOf(at)
    return this.deps.db.tenant(orgId, (tx) =>
      this.deps.repository.spendThisMonth(
        tx,
        orgId,
        budget.scope,
        budget.teamId ?? budget.userId ?? orgId,
        budget.currency,
        periodStart,
        utcDay(at),
      ),
    )
  }
}
