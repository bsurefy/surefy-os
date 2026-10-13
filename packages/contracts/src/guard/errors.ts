// SPDX-License-Identifier: AGPL-3.0-only
/** Error codes of the guard domain (UPPER_SNAKE_CASE, <DOMAIN>_<PROBLEM>; never renamed or reused). */
export const GUARD_ERROR_CODES = {
  GUARD_BLOCKED_ACTION: 'GUARD_BLOCKED_ACTION', // 403: a blocked-action rule matched; the step is `blocked`
  GUARD_ACTION_LIMIT: 'GUARD_ACTION_LIMIT', // 403: an action limit was reached
  GUARD_PII_BLOCKED: 'GUARD_PII_BLOCKED', // 422: the data filter blocks a personal-data type found in the request
  GUARD_CONTENT_BLOCKED: 'GUARD_CONTENT_BLOCKED', // 422: a content filter blocks the content
  GUARD_RULE_NOT_FOUND: 'GUARD_RULE_NOT_FOUND', // 404
  GUARD_RULE_NAME_TAKEN: 'GUARD_RULE_NAME_TAKEN', // 409: names are unique per organization, ignoring case
  GUARD_RULE_LOCKED: 'GUARD_RULE_LOCKED', // 403: an Owner locked it; only Owners change, disable or delete it
  GUARD_RULE_TYPE_IMMUTABLE: 'GUARD_RULE_TYPE_IMMUTABLE', // 422: a rule keeps its type; create another
  GUARD_THRESHOLDS_INVALID: 'GUARD_THRESHOLDS_INVALID', // 422: the review threshold must be below the automatic one
  GUARD_REASON_REQUIRED: 'GUARD_REASON_REQUIRED', // 422: loosening, disabling or deleting needs a reason for the audit log
  GUARD_LOOSER_THAN_PARENT: 'GUARD_LOOSER_THAN_PARENT', // 422: an agent or flow rule may only be stricter than the organization's
  GUARD_PII_RULE_NOT_FOUND: 'GUARD_PII_RULE_NOT_FOUND', // 404
  GUARD_PII_RULE_DUPLICATE: 'GUARD_PII_RULE_DUPLICATE', // 409: the type already has a rule in this scope; change it instead
  GUARD_PII_PATTERN_INVALID: 'GUARD_PII_PATTERN_INVALID', // 422: the custom pattern is too long, does not compile or can backtrack catastrophically
} as const
