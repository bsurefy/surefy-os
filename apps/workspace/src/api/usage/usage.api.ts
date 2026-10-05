// SPDX-License-Identifier: AGPL-3.0-only
import type {
  InsightsBreakdownDimension,
  InsightsBreakdownDto,
  InsightsBreakdownSort,
  InsightsInterval,
  InsightsOverviewDto,
  InsightsTimeseriesDto,
  UsageSourceModule,
} from '@surefy/contracts'
import type { HttpClient } from '@surefy/web-core/http'

/**
 * The range and filters every Insights read takes. The API accepts several values per filter;
 * the screen offers one at a time.
 */
export interface InsightsQuery {
  /** ISO date-times: `from` inclusive, `to` exclusive. */
  from: string
  to: string
  timeZone: string
  teamId?: string
  userId?: string
  modelKey?: string
  sourceModule?: UsageSourceModule
}

export interface InsightsBreakdownQuery extends InsightsQuery {
  by: InsightsBreakdownDimension
  sort?: InsightsBreakdownSort
  limit?: number
}

export interface InsightsTimeseriesQuery extends InsightsQuery {
  interval: InsightsInterval
}

/** Insights › Overview: KPIs, cost by group and the series over time. */
export const usageApi = {
  overview: (http: HttpClient, orgId: string, query: InsightsQuery, signal?: AbortSignal) =>
    http.get<InsightsOverviewDto>(`/orgs/${orgId}/insights/overview`, {
      params: { ...query },
      signal,
    }),
  breakdown: (
    http: HttpClient,
    orgId: string,
    query: InsightsBreakdownQuery,
    signal?: AbortSignal,
  ) =>
    http.get<InsightsBreakdownDto>(`/orgs/${orgId}/insights/breakdown`, {
      params: { ...query },
      signal,
    }),
  timeseries: (
    http: HttpClient,
    orgId: string,
    query: InsightsTimeseriesQuery,
    signal?: AbortSignal,
  ) =>
    http.get<InsightsTimeseriesDto>(`/orgs/${orgId}/insights/timeseries`, {
      params: { ...query },
      signal,
    }),
}
