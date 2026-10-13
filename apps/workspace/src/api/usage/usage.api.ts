// SPDX-License-Identifier: AGPL-3.0-only
import type {
  InsightsBreakdownDimension,
  InsightsBreakdownDto,
  InsightsBreakdownSort,
  InsightsBudgetMeterDto,
  InsightsInterval,
  InsightsOverviewDto,
  InsightsRunsInterval,
  InsightsRunsOverviewDto,
  InsightsRunsTimeseriesDto,
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
  agentId?: string
}

export interface InsightsBreakdownQuery extends InsightsQuery {
  by: InsightsBreakdownDimension
  sort?: InsightsBreakdownSort
  limit?: number
}

export interface InsightsTimeseriesQuery extends InsightsQuery {
  interval: InsightsInterval
}

/** The run reads take the range and the agent only: run rollups have no team, person or model. */
export interface InsightsRunsQuery {
  from: string
  to: string
  timeZone: string
  agentId?: string
}

export interface InsightsRunsTimeseriesQuery extends InsightsRunsQuery {
  interval: InsightsRunsInterval
}

/** One team or one person picks their budget; neither picks the organization budget. */
export interface InsightsBudgetMeterQuery {
  teamId?: string
  userId?: string
}

/** Insights › Overview: KPIs, cost by group, the series over time, runs and the budget meter. */
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
  runsOverview: (http: HttpClient, orgId: string, query: InsightsRunsQuery, signal?: AbortSignal) =>
    http.get<InsightsRunsOverviewDto>(`/orgs/${orgId}/insights/runs-overview`, {
      params: { ...query },
      signal,
    }),
  runsTimeseries: (
    http: HttpClient,
    orgId: string,
    query: InsightsRunsTimeseriesQuery,
    signal?: AbortSignal,
  ) =>
    http.get<InsightsRunsTimeseriesDto>(`/orgs/${orgId}/insights/runs-timeseries`, {
      params: { ...query },
      signal,
    }),
  budgetMeter: (
    http: HttpClient,
    orgId: string,
    query: InsightsBudgetMeterQuery,
    signal?: AbortSignal,
  ) =>
    http.get<InsightsBudgetMeterDto>(`/orgs/${orgId}/insights/budget-meter`, {
      params: { ...query },
      signal,
    }),
}
