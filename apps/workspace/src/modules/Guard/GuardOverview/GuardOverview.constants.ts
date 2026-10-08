// SPDX-License-Identifier: AGPL-3.0-only
import { GUARD_OVERVIEW_RANGES } from '@surefy/contracts'

export const GUARD_RANGES = GUARD_OVERVIEW_RANGES
export const DEFAULT_GUARD_RANGE = '7d'

/** The three bands of a checked action, in the order the first row lists them. */
export const BAND_STATS = [
  { key: 'auto', field: 'auto' },
  { key: 'doubleChecked', field: 'doubleChecked' },
  { key: 'needsPerson', field: 'needsPerson' },
] as const

/** What Guard stopped or kept off the cloud, in the order the second row lists them. */
export const FACT_STATS = [
  'blockedByLimits',
  'personalDataHidden',
  'ranOnLocalModels',
  'medianMinutesToApprove',
] as const

const MINUTES_PER_HOUR = 60

/** A median under an hour reads in minutes; from an hour on, in hours. */
export const HOUR_THRESHOLD_MINUTES = MINUTES_PER_HOUR
