// SPDX-License-Identifier: AGPL-3.0-only
import type { InsightsBreakdownDimension } from '@surefy/contracts'

import type { InsightsRangeOption } from './InsightsOverview.constants'

/** The URL state of Insights › Overview. */
export interface InsightsOverviewFilters {
  range: InsightsRangeOption
  from: string | null
  to: string | null
  team: string | null
  person: string | null
  model: string | null
  by: InsightsBreakdownDimension
}

/** A breakdown group as the chart and its table show it. */
export interface CostGroup {
  key: string | null
  label: string
  costMicros: number
  tokens: number
  requests: number
  isLocal: boolean
  isOthers: boolean
}
