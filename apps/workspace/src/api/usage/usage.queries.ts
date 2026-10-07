// SPDX-License-Identifier: AGPL-3.0-only
import { keepPreviousData, queryOptions } from '@tanstack/react-query'

import { apiClient } from '@surefy/web-core/http'
import type { HttpClient } from '@surefy/web-core/http'

import { usageApi } from './usage.api'

import type { InsightsBreakdownQuery, InsightsQuery, InsightsTimeseriesQuery } from './usage.api'

/** Query keys of the `usage` domain (services-api.md §3): usage and cost for Insights. */
export const usageKeys = {
  all: (orgId: string) => ['orgs', orgId, 'usage'] as const,
  overview: (orgId: string, query: InsightsQuery) =>
    [...usageKeys.all(orgId), 'overview', query] as const,
  breakdown: (orgId: string, query: InsightsBreakdownQuery) =>
    [...usageKeys.all(orgId), 'breakdown', query] as const,
  timeseries: (orgId: string, query: InsightsTimeseriesQuery) =>
    [...usageKeys.all(orgId), 'timeseries', query] as const,
}

// `http` defaults to the browser client; server components pass getServerHttpClient().
// Changing the range or a filter keeps the previous numbers on screen until the new ones arrive.
export const usageQueries = {
  overview: (orgId: string, query: InsightsQuery, http: HttpClient = apiClient) =>
    queryOptions({
      queryKey: usageKeys.overview(orgId, query),
      queryFn: ({ signal }) => usageApi.overview(http, orgId, query, signal),
      placeholderData: keepPreviousData,
    }),
  breakdown: (orgId: string, query: InsightsBreakdownQuery, http: HttpClient = apiClient) =>
    queryOptions({
      queryKey: usageKeys.breakdown(orgId, query),
      queryFn: ({ signal }) => usageApi.breakdown(http, orgId, query, signal),
      placeholderData: keepPreviousData,
    }),
  timeseries: (orgId: string, query: InsightsTimeseriesQuery, http: HttpClient = apiClient) =>
    queryOptions({
      queryKey: usageKeys.timeseries(orgId, query),
      queryFn: ({ signal }) => usageApi.timeseries(http, orgId, query, signal),
      placeholderData: keepPreviousData,
    }),
}
