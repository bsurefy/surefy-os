// SPDX-License-Identifier: AGPL-3.0-only

/** Jobs on the `usage` queue for budgets (usage-budgets-and-audit.md, "Live budget enforcement"). */
export const BUDGET_JOBS = {
  ALERT: 'budgetAlert',
} as const

/** A spend counter expires this many days after its month ends. */
export const BUDGET_COUNTER_GRACE_DAYS = 7

/** The enabled budgets of an organization the gateway checks; `budgets.changed` clears it. */
export const BUDGETS_CACHE_TTL_SECONDS = 600
