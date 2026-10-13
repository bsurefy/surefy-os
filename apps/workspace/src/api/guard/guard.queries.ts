// SPDX-License-Identifier: AGPL-3.0-only
import { infiniteQueryOptions, keepPreviousData, queryOptions } from '@tanstack/react-query'

import { PAGE_SIZE } from '@surefy/contracts'
import type { GuardOverviewRange } from '@surefy/contracts'
import { apiClient } from '@surefy/web-core/http'
import type { HttpClient } from '@surefy/web-core/http'

import { guardApi } from './guard.api'

/** The Guardrails table's filters. */
export interface GuardRuleListFilters {
  q?: string
  /** One or more of `organization`, `team`, `agent`, `flow`, comma separated. */
  scope?: string
  /** One or more guardrail types or `data_filter`, comma separated. */
  type?: string
  isEnabled?: boolean
  /** `name`, `-name`, `createdAt`, `-createdAt`, `triggeredThisWeek` or `-triggeredThisWeek`. */
  sort?: string
  limit?: number
  cursor?: string
}

/** Query keys of the `guard` domain (services-api.md §3): Guard. */
export const guardKeys = {
  all: (orgId: string) => ['orgs', orgId, 'guard'] as const,
  overview: (orgId: string, range: GuardOverviewRange) =>
    [...guardKeys.all(orgId), 'overview', range] as const,
  defaults: (orgId: string) => [...guardKeys.all(orgId), 'defaults'] as const,
  defaultsImpact: (orgId: string, autoBp: number, reviewBp: number) =>
    [...guardKeys.defaults(orgId), 'impact', autoBp, reviewBp] as const,
  rules: (orgId: string) => [...guardKeys.all(orgId), 'rules'] as const,
  ruleList: (orgId: string, filters: GuardRuleListFilters) =>
    [...guardKeys.rules(orgId), filters] as const,
  guardrails: (orgId: string) => [...guardKeys.all(orgId), 'guardrail'] as const,
  guardrail: (orgId: string, guardrailId: string) =>
    [...guardKeys.guardrails(orgId), guardrailId] as const,
  guardrailImpact: (orgId: string, guardrailId: string) =>
    [...guardKeys.guardrail(orgId, guardrailId), 'impact'] as const,
  dataFilters: (orgId: string) => [...guardKeys.all(orgId), 'data-filters'] as const,
}

// `http` defaults to the browser client; server components pass getServerHttpClient()
export const guardQueries = {
  overview: (orgId: string, range: GuardOverviewRange, http: HttpClient = apiClient) =>
    queryOptions({
      queryKey: guardKeys.overview(orgId, range),
      queryFn: ({ signal }) => guardApi.overview(http, orgId, range, signal),
    }),
  defaults: (orgId: string, http: HttpClient = apiClient) =>
    queryOptions({
      queryKey: guardKeys.defaults(orgId),
      queryFn: ({ signal }) => guardApi.defaults(http, orgId, signal),
    }),
  rules: (orgId: string, filters: GuardRuleListFilters, http: HttpClient = apiClient) =>
    infiniteQueryOptions({
      queryKey: guardKeys.ruleList(orgId, filters),
      queryFn: ({ pageParam, signal }) =>
        guardApi.rules(
          http,
          orgId,
          { ...filters, limit: filters.limit ?? PAGE_SIZE.default, cursor: pageParam },
          signal,
        ),
      initialPageParam: undefined as string | undefined,
      getNextPageParam: (last) => last.nextCursor ?? undefined,
    }),
  defaultsImpact: (
    orgId: string,
    thresholds: { autoThresholdBp: number; reviewThresholdBp: number },
    http: HttpClient = apiClient,
  ) =>
    queryOptions({
      queryKey: guardKeys.defaultsImpact(
        orgId,
        thresholds.autoThresholdBp,
        thresholds.reviewThresholdBp,
      ),
      queryFn: ({ signal }) => guardApi.defaultsImpact(http, orgId, thresholds, signal),
      // the preview stays on screen while the next values load
      placeholderData: keepPreviousData,
    }),
  guardrail: (orgId: string, guardrailId: string, http: HttpClient = apiClient) =>
    queryOptions({
      queryKey: guardKeys.guardrail(orgId, guardrailId),
      queryFn: ({ signal }) => guardApi.guardrail(http, orgId, guardrailId, signal),
    }),
  guardrailImpact: (orgId: string, guardrailId: string, http: HttpClient = apiClient) =>
    queryOptions({
      queryKey: guardKeys.guardrailImpact(orgId, guardrailId),
      queryFn: ({ signal }) => guardApi.guardrailImpact(http, orgId, guardrailId, signal),
      // the names must be the ones at the moment of confirming
      gcTime: 0,
    }),
  dataFilters: (orgId: string, http: HttpClient = apiClient) =>
    queryOptions({
      queryKey: guardKeys.dataFilters(orgId),
      queryFn: ({ signal }) => guardApi.dataFilters(http, orgId, signal),
    }),
}
