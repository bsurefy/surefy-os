// SPDX-License-Identifier: AGPL-3.0-only
import { INSIGHTS_BREAKDOWN_DIMENSIONS, INSIGHTS_RANGE_PRESETS } from '@surefy/contracts'

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

/** Cost by team, by person or by model (by agent from V1). */
export const BREAKDOWN_DIMENSIONS = INSIGHTS_BREAKDOWN_DIMENSIONS

/** Groups shown in the cost chart; the rest are summed as "Others". */
export const BREAKDOWN_LIMIT = 10

/** The "any" choice of a single-value filter; never sent to the API. */
export const ANY = 'any'

export const CHART_HEIGHT = 260

/** Filter lists load this many teams, people and models. */
export const FILTER_OPTIONS_LIMIT = 100

export const MICROS_PER_UNIT = 1_000_000
