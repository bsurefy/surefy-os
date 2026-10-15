// SPDX-License-Identifier: AGPL-3.0-only
import { INSIGHTS_RANGE_PRESETS } from '@surefy/contracts'
import type { InsightsBreakdownDimension, InsightsRunsInterval } from '@surefy/contracts'

/** Today, 7d, 30d, 90d and Custom (the person picks the days). */
export const INSIGHTS_RANGES = INSIGHTS_RANGE_PRESETS
export type InsightsRangeOption = (typeof INSIGHTS_RANGES)[number]

/** Days a preset covers, counting today. */
export const RANGE_DAYS: Record<Exclude<InsightsRangeOption, 'custom'>, number> = {
  today: 1,
  '7d': 7,
  '30d': 30,
  '90d': 90,
}

/** Cost by team, by person, by model or by agent; each is also a filter of the page. */
export const BREAKDOWN_DIMENSIONS = [
  'team',
  'person',
  'model',
  'agent',
] as const satisfies readonly InsightsBreakdownDimension[]
export type BreakdownDimension = (typeof BREAKDOWN_DIMENSIONS)[number]

/** Groups shown in the cost chart; the rest are summed as "Others". */
export const BREAKDOWN_LIMIT = 10

/** The "any" choice of a single-value filter; never sent to the API. */
export const ANY = 'any'

export const CHART_HEIGHT = 260

/** Filter lists load this many teams, people, models and agents. */
export const FILTER_OPTIONS_LIMIT = 100

export const MICROS_PER_UNIT = 1_000_000

/** Runs over time per day; ranges longer than this many days are shown per week. */
export const RUNS_DAILY_MAX_DAYS = 120
export const RUNS_INTERVALS = {
  short: 'day',
  long: 'week',
} as const satisfies Record<string, InsightsRunsInterval>

export const BASIS_POINTS = 10_000
export const MS_PER_SECOND = 1000
export const MS_PER_MINUTE = 60_000
