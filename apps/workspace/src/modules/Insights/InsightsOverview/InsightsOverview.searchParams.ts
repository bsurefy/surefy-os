// SPDX-License-Identifier: AGPL-3.0-only
import { createLoader, parseAsString, parseAsStringLiteral } from 'nuqs/server'

import { BREAKDOWN_DIMENSIONS, INSIGHTS_RANGES } from './InsightsOverview.constants'

/**
 * `?range=&from=&to=&team=&person=&model=&by=`: the range, filters and cost grouping survive a
 * reload and can be shared. `from` and `to` are calendar days (`2026-09-01`), used by `custom`.
 */
export const insightsOverviewSearchParams = {
  range: parseAsStringLiteral(INSIGHTS_RANGES).withDefault('30d'),
  from: parseAsString,
  to: parseAsString,
  team: parseAsString,
  person: parseAsString,
  model: parseAsString,
  by: parseAsStringLiteral(BREAKDOWN_DIMENSIONS).withDefault('team'),
}

export const loadInsightsOverviewSearchParams = createLoader(insightsOverviewSearchParams)
