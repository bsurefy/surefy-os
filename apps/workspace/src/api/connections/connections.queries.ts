// SPDX-License-Identifier: AGPL-3.0-only
import { infiniteQueryOptions, queryOptions } from '@tanstack/react-query'

import { PAGE_SIZE } from '@surefy/contracts'
import type { ConnectionKind, ConnectionScope, ConnectionStatus } from '@surefy/contracts'
import { apiClient } from '@surefy/web-core/http'
import type { HttpClient } from '@surefy/web-core/http'

import { connectionsApi } from './connections.api'

/** The table's filters; the screen offers one app, kind and scope at a time and a group of statuses. */
export interface ConnectionListFilters {
  q?: string
  providerKey?: string
  kind?: ConnectionKind
  scope?: ConnectionScope
  /** Several at once: "Needs attention" is `expired` and `error`. */
  status?: readonly ConnectionStatus[]
  teamId?: string
  /** Only connections the caller may use: the pickers of tools, channels and connectors. */
  usable?: boolean
  /** `name`, `-name`, `createdAt`, `-createdAt`, `lastUsedAt` or `-lastUsedAt`. */
  sort?: string
  limit?: number
  cursor?: string
}

/** Query keys of the `connections` domain (services-api.md §3): connections and their providers. */
export const connectionKeys = {
  all: (orgId: string) => ['orgs', orgId, 'connections'] as const,
  lists: (orgId: string) => [...connectionKeys.all(orgId), 'list'] as const,
  list: (orgId: string, filters: ConnectionListFilters) =>
    [...connectionKeys.lists(orgId), filters] as const,
  providers: (orgId: string) => [...connectionKeys.all(orgId), 'providers'] as const,
  impact: (orgId: string, id: string) => [...connectionKeys.all(orgId), 'impact', id] as const,
}

// `http` defaults to the browser client; server components pass getServerHttpClient()
export const connectionQueries = {
  list: (orgId: string, filters: ConnectionListFilters, http: HttpClient = apiClient) =>
    infiniteQueryOptions({
      queryKey: connectionKeys.list(orgId, filters),
      queryFn: ({ pageParam, signal }) =>
        connectionsApi.list(
          http,
          orgId,
          { ...filters, limit: filters.limit ?? PAGE_SIZE.default, cursor: pageParam },
          signal,
        ),
      initialPageParam: undefined as string | undefined,
      getNextPageParam: (last) => last.nextCursor ?? undefined,
    }),
  providers: (orgId: string, http: HttpClient = apiClient) =>
    queryOptions({
      queryKey: connectionKeys.providers(orgId),
      queryFn: ({ signal }) => connectionsApi.providers(http, orgId, signal),
    }),
  impact: (orgId: string, id: string, http: HttpClient = apiClient) =>
    queryOptions({
      queryKey: connectionKeys.impact(orgId, id),
      queryFn: ({ signal }) => connectionsApi.impact(http, orgId, id, signal),
      // the names must be the ones at the moment of confirming
      gcTime: 0,
    }),
}
