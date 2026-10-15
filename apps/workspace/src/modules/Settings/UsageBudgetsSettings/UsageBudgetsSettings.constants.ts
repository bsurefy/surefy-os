// SPDX-License-Identifier: AGPL-3.0-only
import { BUDGET_DEFAULT_ALERT_THRESHOLDS_BP, PAGE_SIZE } from '@surefy/contracts'

export const BUDGET_DIALOG = {
  CREATE: 'create',
  EDIT: 'edit',
  DELETE: 'delete',
} as const
export type BudgetDialogKind = (typeof BUDGET_DIALOG)[keyof typeof BUDGET_DIALOG]

export const MICROS_PER_UNIT = 1_000_000
export const BASIS_POINTS = 10_000

/** The alerts the form offers: 50, 80 and 100 percent, each on or off. */
export const BUDGET_ALERT_CHOICES_BP = BUDGET_DEFAULT_ALERT_THRESHOLDS_BP

/** People in several teams named next to the team budgets ("Ana is in Support and Sales…"). */
export const CHARGING_EXAMPLES_MAX = 3

/** Teams and people the pickers and the charging note read in one page. */
export const PICKER_PAGE_SIZE = PAGE_SIZE.max
