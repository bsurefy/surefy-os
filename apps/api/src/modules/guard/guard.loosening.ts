// SPDX-License-Identifier: AGPL-3.0-only
import { APPROVAL_RISKS, APPROVAL_TIMEOUT_ACTIONS } from '@surefy/contracts'
import type { GuardCondition, GuardMatch, GuardrailDefinition } from '@surefy/contracts'

// "Loosening" a guardrail (Guard › Guardrails): a change that lets an action through that the
// rule held back before. It is T2 and needs a reason for the audit log; tightening saves directly.

const conditionKey = (condition: GuardCondition): string =>
  JSON.stringify([condition.field, condition.operator, condition.value])

/**
 * A match is looser when it can hold for fewer actions: another action (unless it is the category
 * the old one sat in) or a condition the old one did not have. Fewer conditions match more.
 */
function matchLoosened(before: GuardMatch, after: GuardMatch): boolean {
  if (before.action !== after.action && !before.action.startsWith(`${after.action}.`)) return true
  const kept = new Set((before.conditions ?? []).map(conditionKey))
  return (after.conditions ?? []).some((condition) => !kept.has(conditionKey(condition)))
}

/** Lower is looser: no timeout waits for ever, `reject` is the strictest action, `continue` the loosest. */
const timeoutStrictness = (action: string | null): number =>
  action === null
    ? Number.POSITIVE_INFINITY
    : APPROVAL_TIMEOUT_ACTIONS.length - APPROVAL_TIMEOUT_ACTIONS.indexOf(action as never)

const riskRank = (risk: string): number => APPROVAL_RISKS.indexOf(risk as never)

type Limit = Extract<GuardrailDefinition, { kind: 'action_limit' }>['limit']
const LIMIT_FIELDS = ['perActionAmountMicros', 'perDayCount', 'perDayAmountMicros'] as const

/** A bound that is gone or higher lets more through. */
function limitLoosened(before: Limit, after: Limit): boolean {
  return LIMIT_FIELDS.some((field) => {
    const was = before[field]
    const is = after[field]
    return was !== undefined && (is === undefined || is > was)
  })
}

/** Whether replacing `before` with `after` (the same kind) lets more through. */
export function guardrailLoosened(
  before: GuardrailDefinition,
  after: GuardrailDefinition,
): boolean {
  if (matchLoosened(before.match, after.match)) return true
  switch (before.kind) {
    case 'approval_rule': {
      if (after.kind !== 'approval_rule') return true
      return (
        riskRank(after.risk) < riskRank(before.risk) ||
        timeoutStrictness(after.onTimeout) < timeoutStrictness(before.onTimeout)
      )
    }
    case 'threshold_override':
      return (
        after.kind !== 'threshold_override' ||
        after.autoBp < before.autoBp ||
        after.reviewBp < before.reviewBp
      )
    case 'blocked_action':
      return false
    case 'action_limit':
      return (
        after.kind !== 'action_limit' ||
        limitLoosened(before.limit, after.limit) ||
        (before.onReached === 'block' && after.onReached === 'require_approval')
      )
    case 'content_filter':
      return (
        after.kind !== 'content_filter' ||
        before.categories.some((category) => !after.categories.includes(category)) ||
        (before.action === 'block' && after.action === 'flag')
      )
  }
}
