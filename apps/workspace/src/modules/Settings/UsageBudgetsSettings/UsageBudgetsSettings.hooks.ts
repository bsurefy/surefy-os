// SPDX-License-Identifier: AGPL-3.0-only
import { useFormatter } from 'next-intl'

import { MICROS_PER_UNIT } from './UsageBudgetsSettings.constants'
import { microsToUnits } from './UsageBudgetsSettings.utils'

/** Amounts in micros as money: "$430" for whole amounts, "$12.50" otherwise. */
export function useFormatMoney() {
  const format = useFormatter()
  return (micros: number, currency: string) =>
    format.number(microsToUnits(micros), {
      style: 'currency',
      currency,
      ...(micros % MICROS_PER_UNIT === 0 && { maximumFractionDigits: 0 }),
    })
}

/** A budget's `YYYY-MM-DD` dates (UTC months) as "Feb 1". */
export function useFormatBudgetDate() {
  const format = useFormatter()
  return (date: string) =>
    format.dateTime(new Date(`${date}T00:00:00.000Z`), {
      month: 'short',
      day: 'numeric',
      timeZone: 'UTC',
    })
}
