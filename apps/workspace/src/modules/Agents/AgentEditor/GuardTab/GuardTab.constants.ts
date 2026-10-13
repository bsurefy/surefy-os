// SPDX-License-Identifier: AGPL-3.0-only

/** Organization and team rules listed as locked rows come from the first page of this size. */
export const INHERITED_RULES_LIMIT = 100

/** Teams and people offered as approvers come from the first page of this size. */
export const APPROVER_LOOKUP_LIMIT = 100

/** Scopes whose rules an agent inherits (agent and flow rules are not inherited). */
export const INHERITED_SCOPES = 'organization,team'

export const BASIS_POINTS_PER_PERCENT = 100

export const MINUTES_PER = { minutes: 1, hours: 60, days: 1440 } as const
export const WAIT_UNITS = ['minutes', 'hours', 'days'] as const
export type WaitUnit = (typeof WAIT_UNITS)[number]

/** Built-in roles that can approve: "that role and every role above it". */
export const APPROVER_ROLES = ['builder', 'admin', 'owner'] as const

/** A new approval rule waits an hour, then escalates. */
export const DEFAULT_WAIT = { amount: 1, unit: 'hours' } as const
