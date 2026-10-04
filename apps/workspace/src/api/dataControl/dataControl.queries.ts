// SPDX-License-Identifier: AGPL-3.0-only
import { queryOptions } from '@tanstack/react-query'

import type { DataRequestStatus, DataRequestType } from '@surefy/contracts'
import { apiClient } from '@surefy/web-core/http'
import type { HttpClient } from '@surefy/web-core/http'

import { dataControlApi } from './dataControl.api'

export interface DataRequestFilters {
  type?: DataRequestType
  status?: DataRequestStatus
  limit?: number
}

/**
 * Query keys of the `dataControl` domain (services-api.md §3): data export and organization
 * deletion.
 */
export const dataControlKeys = {
  all: (orgId: string) => ['orgs', orgId, 'data-control'] as const,
  requests: (orgId: string) => [...dataControlKeys.all(orgId), 'requests'] as const,
  requestList: (orgId: string, filters: DataRequestFilters) =>
    [...dataControlKeys.requests(orgId), filters] as const,
  retention: (orgId: string) => [...dataControlKeys.all(orgId), 'retention'] as const,
}

/** An export that is still being prepared is polled; everything else changes only on action. */
const ACTIVE_POLL_MS = 3000
const ACTIVE_STATUSES = new Set(['requested', 'preparing'])

// `http` defaults to the browser client; server components pass getServerHttpClient()
export const dataControlQueries = {
  requests: (orgId: string, filters: DataRequestFilters, http: HttpClient = apiClient) =>
    queryOptions({
      queryKey: dataControlKeys.requestList(orgId, filters),
      queryFn: ({ signal }) => dataControlApi.requests(http, orgId, filters, signal),
      refetchInterval: (query) =>
        query.state.data?.items.some((item) => ACTIVE_STATUSES.has(item.status))
          ? ACTIVE_POLL_MS
          : false,
    }),
  retention: (orgId: string, http: HttpClient = apiClient) =>
    queryOptions({
      queryKey: dataControlKeys.retention(orgId),
      queryFn: ({ signal }) => dataControlApi.retention(http, orgId, signal),
    }),
}
