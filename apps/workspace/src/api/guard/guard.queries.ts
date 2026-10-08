// SPDX-License-Identifier: AGPL-3.0-only
import { infiniteQueryOptions, queryOptions } from '@tanstack/react-query'

import { PAGE_SIZE } from '@surefy/contracts'
import { apiClient } from '@surefy/web-core/http'
import type { HttpClient } from '@surefy/web-core/http'

import { guardApi } from './guard.api'

/** The Guardrails table's filters. */
export interface GuardRuleListFilters {
  q?: string
  /** One or more of `organization`, `team`, `agent`, `flow`, comma separated. */
  scope?: string
  type?: string
  isEnabled?: boolean
  limit?: number
  cursor?: string
}

/** Query keys of the `guard` domain (services-api.md §3): Guard. */
export const guardKeys = {
  all: (orgId: string) => ['orgs', orgId, 'guard'] as const,
  defaults: (orgId: string) => [...guardKeys.all(orgId), 'defaults'] as const,
  rules: (orgId: string) => [...guardKeys.all(orgId), 'rules'] as const,
  ruleList: (orgId: string, filters: GuardRuleListFilters) =>
    [...guardKeys.rules(orgId), filters] as const,
}

// `http` defaults to the browser client; server components pass getServerHttpClient()
export const guardQueries = {
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
}
