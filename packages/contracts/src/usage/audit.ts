// SPDX-License-Identifier: AGPL-3.0-only

/**
 * Actions the usage module writes to the audit log (`<area>.<verb>`, target type `budget`). The
 * metadata has the scope, the team or person, and the before/after diff of the changed fields.
 */
export const BUDGET_AUDIT_ACTIONS = {
  BUDGET_CREATED: 'budget.created',
  BUDGET_UPDATED: 'budget.updated',
  BUDGET_DELETED: 'budget.deleted',
} as const
export type BudgetAuditAction = (typeof BUDGET_AUDIT_ACTIONS)[keyof typeof BUDGET_AUDIT_ACTIONS]
