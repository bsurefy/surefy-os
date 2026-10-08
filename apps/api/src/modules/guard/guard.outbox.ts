// SPDX-License-Identifier: AGPL-3.0-only
import { outboxHandler } from '@/modules/outbox/index.js'

import type { GuardRuleSets } from './guard.ruleSet.js'

/**
 * `guard.rules_changed`: drops the organization's cached rule set so the next check loads the
 * current one. Idempotent, so the at-least-once delivery does no harm.
 */
export function createGuardHandlers(deps: { ruleSets: GuardRuleSets }) {
  return [
    outboxHandler('guard.rules_changed', 'guard.drop-rules-cache', async (delivery) => {
      if (delivery.orgId === null) return
      await deps.ruleSets.invalidate(delivery.orgId)
    }),
  ]
}
