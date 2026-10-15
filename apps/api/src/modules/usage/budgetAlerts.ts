// SPDX-License-Identifier: AGPL-3.0-only
import { outboxHandler } from '@/modules/outbox/index.js'
import type { BudgetThresholdReachedParams } from '@surefy/contracts'

import { effectiveAmount, periodOf, reachedThresholds } from './budgets.utils.js'

import type { BudgetCounters } from './budgetCounters.js'
import type { BudgetAlertPayload, BudgetEnforcer } from './budgetEnforcement.js'
import type { BudgetsRepository } from './budgets.repository.js'
import type { BudgetsNotifier, BudgetsOutbox } from './budgets.types.js'
import type { Database } from '@/core/database/index.js'
import type { Logger } from '@/core/logger/index.js'

export interface BudgetAlertsDeps {
  db: Database
  logger: Logger
  repository: BudgetsRepository
  counters: BudgetCounters
  enforcer: BudgetEnforcer
  outbox: () => BudgetsOutbox
  notifications: BudgetsNotifier
  now?: () => Date
}

const REASON = 'usage-aggregation'

/**
 * Budget alerts (usage-budgets-and-audit.md, §3): one `budget_alerts` row per budget, month and
 * threshold, written by the `budgetAlert` job or the hourly reconciliation; only the inserting
 * transaction emits `budget.threshold_reached`, whose handler notifies the people concerned.
 */
export class BudgetAlerts {
  private readonly now: () => Date

  constructor(private readonly deps: BudgetAlertsDeps) {
    this.now = deps.now ?? (() => new Date())
  }

  /** Inserts the alert unless it fired already; false when nothing was inserted. */
  fire(payload: BudgetAlertPayload): Promise<boolean> {
    const { orgId } = payload
    return this.deps.db.tenant(orgId, async (tx) => {
      const budget = await this.deps.repository.findById(tx, orgId, payload.budgetId)
      // deleted, disabled or its thresholds changed since the call
      if (budget?.isEnabled !== true || !budget.alertThresholdsBp.includes(payload.thresholdBp))
        return false
      const alert = await this.deps.repository.insertAlert(tx, {
        organizationId: orgId,
        budgetId: budget.id,
        periodStart: payload.periodStart,
        thresholdBp: payload.thresholdBp,
        spentMicros: payload.spentMicros,
        currency: budget.currency,
      })
      if (alert === undefined) return false
      await this.deps.outbox().write(tx, {
        orgId,
        topic: 'budget.threshold_reached',
        payload: { version: 1, id: alert.id },
      })
      return true
    })
  }

  /**
   * Step 7 of every rollup run: raises each enabled budget's counter to this month's
   * `usage_monthly` spend (never lowering it) and inserts the alerts that spend has crossed.
   * Repairs counters that lost increments within an hour.
   */
  async reconcile(): Promise<{ budgets: number; alerts: number }> {
    const { periodStart } = periodOf(this.now())
    const rows = await this.deps.db.system(REASON, (tx) =>
      this.deps.repository.reconcileRows(tx, periodStart),
    )
    let alerts = 0
    for (const { budget, spentMicros, organizationAmountMicros } of rows) {
      const orgId = budget.organizationId
      try {
        await this.deps.counters.raise(
          {
            orgId,
            month: periodStart,
            currency: budget.currency,
            scope: budget.scope,
            scopeId: budget.teamId ?? budget.userId ?? orgId,
          },
          spentMicros,
        )
      } catch (error) {
        this.deps.logger.warn(
          { err: error, orgId, budgetId: budget.id },
          'budget counter not raised',
        )
      }
      const amount = effectiveAmount(
        budget.amountMicros,
        budget.scope === 'organization' ? null : organizationAmountMicros,
      )
      for (const thresholdBp of reachedThresholds(spentMicros, amount, budget.alertThresholdsBp)) {
        const fired = await this.fire({
          orgId,
          budgetId: budget.id,
          periodStart,
          thresholdBp,
          spentMicros,
        })
        if (fired) alerts++
      }
    }
    return { budgets: rows.length, alerts }
  }

  /** `budgets.changed`: drops the cached budget set of the organization. */
  changedHandler() {
    return outboxHandler('budgets.changed', 'usage.forget-budgets', async (delivery) => {
      if (delivery.orgId !== null) await this.deps.enforcer.forget(delivery.orgId)
    })
  }

  /**
   * `budget.threshold_reached`: tells the Admins and Owners, the team lead for a team budget and
   * the person for a personal limit. Delivery is at least once: the dedupe key makes a second
   * delivery a no-op.
   */
  thresholdReachedHandler() {
    return outboxHandler(
      'budget.threshold_reached',
      'usage.notify-budget-threshold',
      async (delivery) => {
        if (delivery.orgId === null) return
        const orgId = delivery.orgId
        const found = await this.deps.db.tenant(orgId, async (tx) => {
          const alert = await this.deps.repository.findAlert(tx, orgId, delivery.payload.id)
          if (alert === undefined) return
          const budget = await this.deps.repository.findById(tx, orgId, alert.budgetId)
          if (budget === undefined) return
          const organization =
            budget.scope === 'organization'
              ? undefined
              : await this.deps.repository.findOrganizationBudget(tx, orgId)
          return {
            alert,
            budget,
            organizationAmountMicros:
              organization?.isEnabled === true && organization.currency === budget.currency
                ? organization.amountMicros
                : null,
            recipients: await this.deps.repository.alertRecipients(tx, orgId, budget),
            scopeLabel: await this.deps.repository.scopeLabel(tx, orgId, budget),
          }
        })
        // the budget was deleted since: nothing to tell
        if (found === undefined) return
        const { alert, budget } = found
        const params: BudgetThresholdReachedParams = {
          version: 1,
          scope: budget.scope,
          scopeLabel: found.scopeLabel,
          thresholdBp: alert.thresholdBp,
          spentMicros: alert.spentMicros,
          amountMicros: effectiveAmount(budget.amountMicros, found.organizationAmountMicros),
          currency: alert.currency,
          onReached: budget.onReached,
          periodStart: alert.periodStart,
        }
        for (const userId of found.recipients) {
          await this.deps.notifications.notify(
            { orgId },
            {
              userId,
              type: 'budget.threshold_reached',
              params,
              target: { type: 'budget', id: budget.id },
              dedupeKey: `budget.threshold_reached:${alert.id}`,
            },
          )
        }
        this.deps.logger.info(
          {
            orgId,
            budgetId: budget.id,
            thresholdBp: alert.thresholdBp,
            notified: found.recipients.length,
          },
          'budget threshold reached',
        )
      },
    )
  }
}
