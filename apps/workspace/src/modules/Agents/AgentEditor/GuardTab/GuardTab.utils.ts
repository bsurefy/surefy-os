// SPDX-License-Identifier: AGPL-3.0-only
import type { Approver } from '@surefy/contracts'
import { approverSchema } from '@surefy/contracts'

import { BASIS_POINTS_PER_PERCENT, MINUTES_PER, WAIT_UNITS } from './GuardTab.constants'

import type { WaitUnit } from './GuardTab.constants'

export interface Thresholds {
  autoBp: number
  reviewBp: number
}

/** An approver as one value of a picker: `role:admin`, `team:<id>`, `user:<id>`. */
export function toApproverKey(approver: Approver): string {
  return `${approver.type}:${approver.id}`
}

/** The approver a picker value stands for; null for a value that is none. */
export function fromApproverKey(key: string): Approver | null {
  const [type, ...rest] = key.split(':')
  const parsed = approverSchema.safeParse({ type, id: rest.join(':') })
  return parsed.success ? parsed.data : null
}

export function toApprovers(keys: readonly string[]): Approver[] {
  return keys.flatMap((key) => {
    const approver = fromApproverKey(key)
    return approver ? [approver] : []
  })
}

/** Minutes as the biggest whole unit they fill: 120 → 2 hours, 90 → 90 minutes. */
export function splitWait(minutes: number): { amount: number; unit: WaitUnit } {
  const unit = [...WAIT_UNITS].reverse().find((candidate) => minutes % MINUTES_PER[candidate] === 0)
  const chosen = unit ?? 'minutes'
  return { amount: minutes / MINUTES_PER[chosen], unit: chosen }
}

export const joinWait = (amount: number, unit: WaitUnit): number => amount * MINUTES_PER[unit]

export const toPercent = (basisPoints: number): number =>
  Math.round(basisPoints / BASIS_POINTS_PER_PERCENT)

export const toBasisPoints = (percent: number): number => percent * BASIS_POINTS_PER_PERCENT

/** The agent's thresholds are lower than the organization's: the organization's apply at run time. */
export function isLooserThan(organization: Thresholds, own: Thresholds): boolean {
  return own.autoBp < organization.autoBp || own.reviewBp < organization.reviewBp
}

/** The agent's thresholds raised to the organization's where they are lower, and review kept under auto. */
export function raiseToOrganization(organization: Thresholds, own: Thresholds): Thresholds {
  const autoBp = Math.max(own.autoBp, organization.autoBp)
  return { autoBp, reviewBp: Math.min(Math.max(own.reviewBp, organization.reviewBp), autoBp) }
}

/** An id for a rule inside the agent: lasts as long as the rule does. */
export function newRuleId(): string {
  return globalThis.crypto.randomUUID()
}
