// SPDX-License-Identifier: AGPL-3.0-only
import { GUARD_TABLE_SCOPES, GUARD_TABLE_TYPES, GUARDRAIL_TYPES } from '@surefy/contracts'

export const GUARDRAIL_SORTS = ['name', '-name', 'triggeredThisWeek', '-triggeredThisWeek'] as const
export type GuardrailSort = (typeof GUARDRAIL_SORTS)[number]
export const DEFAULT_GUARDRAIL_SORT: GuardrailSort = 'name'

/** The "any" choice of a filter select; the filter is then off. */
export const ANY = 'any'

export const TYPE_FILTERS = [ANY, ...GUARD_TABLE_TYPES] as const
export const SCOPE_FILTERS = [ANY, ...GUARD_TABLE_SCOPES] as const
export const STATUS_FILTERS = [ANY, 'on', 'off'] as const

/** The types a person can add; personal-data filters have their own tab. */
export const ADDABLE_TYPES = GUARDRAIL_TYPES

/** `?rule=new` opens the sheet to add a guardrail. */
export const NEW_RULE = 'new'

/** Teams offered in the scope picker come from the first page of this size. */
export const TEAM_LOOKUP_LIMIT = 100

/** Teams and people offered as approvers come from the first page of this size. */
export const APPROVER_LOOKUP_LIMIT = 100

/** Built-in roles that can approve: "that role and every role above it". */
export const APPROVER_ROLES = ['builder', 'admin', 'owner'] as const

export const WAIT_UNITS = ['minutes', 'hours', 'days'] as const
export type WaitUnit = (typeof WAIT_UNITS)[number]
export const MINUTES_PER = { minutes: 1, hours: 60, days: 1440 } as const satisfies Record<
  WaitUnit,
  number
>

/** A new approval rule waits an hour, then rejects. */
export const DEFAULT_WAIT = { amount: 1, unit: 'hours' } as const

export const SHEET_FORM_ID = 'guardrail-form'

/** The categories a content filter offers as suggestions; any lowercase word is accepted. */
export const CONTENT_CATEGORIES = ['profanity', 'violence', 'self_harm', 'hate', 'sexual'] as const
