// SPDX-License-Identifier: AGPL-3.0-only

/**
 * Actions the approvals module writes to the audit log (`<area>.<verb>`, target type `approval`).
 * `approval.decided` carries `via`, the reason, whether the payload was edited and whether step-up
 * was used.
 */
export const APPROVAL_AUDIT_ACTIONS = {
  APPROVAL_REQUESTED: 'approval.requested',
  APPROVAL_DECIDED: 'approval.decided',
  /** System actor: the timeout rejected or continued. */
  APPROVAL_EXPIRED: 'approval.expired',
  /** System actor: the timeout added assignees and waits again. */
  APPROVAL_ESCALATED: 'approval.escalated',
  APPROVAL_CANCELED: 'approval.canceled',
} as const
export type ApprovalAuditAction =
  (typeof APPROVAL_AUDIT_ACTIONS)[keyof typeof APPROVAL_AUDIT_ACTIONS]
