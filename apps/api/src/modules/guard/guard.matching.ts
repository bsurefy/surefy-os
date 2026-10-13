// SPDX-License-Identifier: AGPL-3.0-only
import type { GuardCondition, GuardMatch } from '@surefy/contracts'

/**
 * A rule's `match.action` names a tool, a bridge action or a category: `payments.refund` matches
 * itself and `payments` matches every action under it (`payments.refund`, `payments.charge`).
 */
export function actionMatches(ruleAction: string, actionName: string): boolean {
  return actionName === ruleAction || actionName.startsWith(`${ruleAction}.`)
}

/** `amount` or `order.total`: a value of the action's input, or undefined when it is not there. */
function readField(input: Readonly<Record<string, unknown>>, path: string): unknown {
  let current: unknown = input
  for (const key of path.split('.')) {
    if (typeof current !== 'object' || current === null || Array.isArray(current)) return undefined
    current = (current as Record<string, unknown>)[key]
  }
  return current
}

const asNumber = (value: unknown): number | undefined => {
  if (typeof value === 'number' && Number.isFinite(value)) return value
  if (typeof value === 'string' && value.trim() !== '' && Number.isFinite(Number(value))) {
    return Number(value)
  }
  return undefined
}

/**
 * Whether one condition holds for the action's input. A rule only ever makes Guard stricter, so a
 * condition that cannot be evaluated (the field is missing or of another type) counts as holding:
 * the rule applies rather than letting an action slip past it.
 */
export function conditionHolds(
  condition: GuardCondition,
  input: Readonly<Record<string, unknown>>,
): boolean {
  const actual = readField(input, condition.field)
  if (actual === undefined || actual === null) return true
  const { operator, value } = condition
  switch (operator) {
    case 'eq':
      return actual === value
    case 'neq':
      return actual !== value
    case 'in':
      return Array.isArray(value) ? value.includes(actual as string | number) : true
    default: {
      const left = asNumber(actual)
      const right = asNumber(value)
      if (left === undefined || right === undefined) return true
      if (operator === 'gt') return left > right
      if (operator === 'gte') return left >= right
      if (operator === 'lt') return left < right
      return left <= right
    }
  }
}

/** The action matches and every condition holds. */
export function matchHolds(
  match: GuardMatch,
  action: { name: string; input: Readonly<Record<string, unknown>> },
): boolean {
  return (
    actionMatches(match.action, action.name) &&
    (match.conditions ?? []).every((condition) => conditionHolds(condition, action.input))
  )
}
