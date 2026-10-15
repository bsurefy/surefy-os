// SPDX-License-Identifier: AGPL-3.0-only
import { monthOf, utcDay } from './usage.utils.js'

/** The first day of the month after `month` (`YYYY-MM-01`). */
export function nextMonth(month: string): string {
  const at = new Date(`${month}T00:00:00Z`)
  at.setUTCMonth(at.getUTCMonth() + 1)
  return utcDay(at)
}

/** The UTC calendar month of an instant: its first day and the first day of the next. */
export function periodOf(at: Date): { periodStart: string; periodEnd: string } {
  const periodStart = monthOf(utcDay(at))
  return { periodStart, periodEnd: nextMonth(periodStart) }
}

/** `yyyymm` of a month, for counter keys and job ids. */
export const yyyymm = (month: string): string => month.slice(0, 7).replace('-', '')

/**
 * The amount that applies: a team or personal budget never exceeds the enabled organization
 * budget, which never rewrites them (usage-budgets-and-audit.md, §2).
 */
export const effectiveAmount = (amountMicros: number, organizationAmountMicros: number | null) =>
  organizationAmountMicros === null
    ? amountMicros
    : Math.min(amountMicros, organizationAmountMicros)

/** The spend at which a threshold (basis points of the amount) is crossed. */
export const thresholdMicros = (amountMicros: number, thresholdBp: number): number =>
  Math.ceil((amountMicros * thresholdBp) / 10_000)

/** The thresholds a spend has reached: all of them at a zero amount. */
export const reachedThresholds = (
  spentMicros: number,
  amountMicros: number,
  thresholdsBp: readonly number[],
): number[] => thresholdsBp.filter((bp) => spentMicros >= thresholdMicros(amountMicros, bp))

/** The thresholds a spend went past between two values. */
export const crossedThresholds = (
  beforeMicros: number,
  afterMicros: number,
  amountMicros: number,
  thresholdsBp: readonly number[],
): number[] =>
  thresholdsBp.filter((bp) => {
    const at = thresholdMicros(amountMicros, bp)
    return beforeMicros < at && afterMicros >= at
  })
