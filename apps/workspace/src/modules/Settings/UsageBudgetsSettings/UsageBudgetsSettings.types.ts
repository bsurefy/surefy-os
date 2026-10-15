// SPDX-License-Identifier: AGPL-3.0-only
import type { BudgetDto, BudgetScope } from '@surefy/contracts'

/** The open dialog: Create names the scope, Edit and Delete the budget. */
export type OpenBudgetDialog =
  { kind: 'create'; scope: BudgetScope } | { kind: 'edit' | 'delete'; budget: BudgetDto }

/** "Ana Ruiz is in Support and Sales; usage counts toward Sales, the primary team." */
export interface ChargingExample {
  userId: string
  name: string
  teams: string[]
  /** Null when the person has no primary team: only their limit and the organization budget. */
  primaryTeam: string | null
}
