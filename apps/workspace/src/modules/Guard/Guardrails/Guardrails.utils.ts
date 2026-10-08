// SPDX-License-Identifier: AGPL-3.0-only
import type {
  GuardCondition,
  GuardMatch,
  GuardrailDefinition,
  GuardrailDto,
  GuardrailImpactDto,
} from '@surefy/contracts'

import { ANY } from './Guardrails.constants'

import type { GuardrailSort } from './Guardrails.constants'

/** The table's sort as the data table takes it (`{ id, desc }`). */
export function toSortState(sort: GuardrailSort): { id: string; desc: boolean } {
  return sort.startsWith('-') ? { id: sort.slice(1), desc: true } : { id: sort, desc: false }
}

export function toSortParam(next: { id: string; desc: boolean }): string {
  return next.desc ? `-${next.id}` : next.id
}

/** A filter select's value as the API takes it: nothing for "any". */
export function filterValue<T extends string>(value: T): T | undefined {
  return value === ANY ? undefined : value
}

export function statusToEnabled(status: string): boolean | undefined {
  if (status === 'on') return true
  if (status === 'off') return false
  return undefined
}

const numeric = (value: GuardCondition['value']): number | null =>
  typeof value === 'number' ? value : null

/** Whether `next` makes the condition apply to fewer actions than `old` (narrower means looser). */
function conditionNarrowed(old: GuardCondition, next: GuardCondition): boolean {
  if (old.operator !== next.operator) return true
  const before = numeric(old.value)
  const after = numeric(next.value)
  if (before !== null && after !== null) {
    if (old.operator === 'gt' || old.operator === 'gte') return after > before
    if (old.operator === 'lt' || old.operator === 'lte') return after < before
  }
  if (old.operator === 'in' && Array.isArray(old.value) && Array.isArray(next.value)) {
    const kept = next.value
    return old.value.some((item) => !kept.includes(item))
  }
  return JSON.stringify(old.value) !== JSON.stringify(next.value)
}

/**
 * A match gets looser when the rule applies to fewer actions: another action, a condition added,
 * or an existing condition that now lets more actions through. Dropping a condition widens it.
 */
export function isMatchLoosened(before: GuardMatch, after: GuardMatch): boolean {
  if (before.action.trim().toLowerCase() !== after.action.trim().toLowerCase()) return true
  const old = before.conditions ?? []
  return (after.conditions ?? []).some((condition) => {
    const previous = old.find((entry) => entry.field === condition.field)
    return previous === undefined || conditionNarrowed(previous, condition)
  })
}

const raised = (before: number | undefined, after: number | undefined): boolean =>
  before !== undefined && (after === undefined || after > before)

/**
 * Turning a rule off, or editing it so it stops less (design/workspace/guard.md: "Turning off,
 * loosening or deleting a guardrail is T2"). A rule keeps its type, so another type never counts.
 */
export function isGuardrailLoosened(
  before: GuardrailDto,
  next: { isEnabled: boolean; definition: GuardrailDefinition },
): boolean {
  if (before.isEnabled && !next.isEnabled) return true
  const old = before.definition
  const edited = next.definition
  if (old.kind !== edited.kind) return false
  if (isMatchLoosened(old.match, edited.match)) return true
  switch (old.kind) {
    case 'approval_rule':
      return (
        edited.kind === 'approval_rule' &&
        old.onTimeout !== 'continue' &&
        edited.onTimeout === 'continue'
      )
    case 'threshold_override':
      return (
        edited.kind === 'threshold_override' &&
        (edited.autoBp < old.autoBp || edited.reviewBp < old.reviewBp)
      )
    case 'blocked_action':
      return false
    case 'action_limit':
      return (
        edited.kind === 'action_limit' &&
        (raised(old.limit.perActionAmountMicros, edited.limit.perActionAmountMicros) ||
          raised(old.limit.perDayCount, edited.limit.perDayCount) ||
          raised(old.limit.perDayAmountMicros, edited.limit.perDayAmountMicros) ||
          (old.onReached === 'block' && edited.onReached === 'require_approval'))
      )
    case 'content_filter':
      return (
        edited.kind === 'content_filter' &&
        (old.categories.some((category) => !edited.categories.includes(category)) ||
          (old.action === 'block' && edited.action === 'flag'))
      )
  }
}

/** The agents and flows a change reaches, as one count per kind of dependent. */
export function getDependentCounts(impact: GuardrailImpactDto): { type: string; count: number }[] {
  return impact.dependents.filter((dependent) => dependent.count > 0)
}
