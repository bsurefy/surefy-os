// SPDX-License-Identifier: AGPL-3.0-only

/**
 * Actions the guard module writes to the audit log (`<area>.<verb>`; target types `guard_settings`,
 * `guardrail` and `pii_rule`). Loosening, disabling and deleting carry the person's reason.
 */
export const GUARD_AUDIT_ACTIONS = {
  /** Metadata: the values before and after, and the reason when it loosened. */
  GUARD_DEFAULTS_CHANGED: 'guard.defaults_changed',
  /** System actor, target type `guardrail`: counted as "Triggered this week". */
  GUARD_RULE_TRIGGERED: 'guard.rule_triggered',
  GUARDRAIL_CREATED: 'guardrail.created',
  GUARDRAIL_UPDATED: 'guardrail.updated',
  GUARDRAIL_DELETED: 'guardrail.deleted',
  GUARDRAIL_LOCKED: 'guardrail.locked',
  GUARDRAIL_UNLOCKED: 'guardrail.unlocked',
  PII_RULE_CREATED: 'pii_rule.created',
  PII_RULE_UPDATED: 'pii_rule.updated',
  PII_RULE_DELETED: 'pii_rule.deleted',
} as const
export type GuardAuditAction = (typeof GUARD_AUDIT_ACTIONS)[keyof typeof GUARD_AUDIT_ACTIONS]
