// SPDX-License-Identifier: AGPL-3.0-only

/** How long the impact preview waits after a slider stopped before it asks the API. */
export const IMPACT_DEBOUNCE_MS = 400

export const TARGET_UNITS = ['minutes', 'hours', 'days'] as const
export type TargetUnit = (typeof TARGET_UNITS)[number]

export const MINUTES_PER_UNIT = { minutes: 1, hours: 60, days: 1440 } as const satisfies Record<
  TargetUnit,
  number
>

/** The longest target the contract accepts: one year, in minutes. */
export const TARGET_MAX_MINUTES = 525_600

export const FORM_ID = 'guard-defaults-form'
