// SPDX-License-Identifier: AGPL-3.0-only
import { queryOptions } from '@tanstack/react-query'

import type { DataRequestStatus, DataRequestType, ExportStatus } from '@surefy/contracts'
import { apiClient } from '@surefy/web-core/http'
import type { HttpClient } from '@surefy/web-core/http'

import { dataControlApi, exportsApi } from './dataControl.api'

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
  exports: (orgId: string) => [...dataControlKeys.all(orgId), 'exports'] as const,
  export: (orgId: string, exportId: string) =>
    [...dataControlKeys.exports(orgId), 'detail', exportId] as const,
}

/** An export that is still being prepared is polled; everything else changes only on action. */
const ACTIVE_POLL_MS = 3000
const ACTIVE_STATUSES = new Set(['requested', 'preparing'])
const ACTIVE_EXPORT_STATUSES: readonly ExportStatus[] = ['queued', 'preparing']

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
  /** One background export, polled while its file is being prepared. */
  export: (orgId: string, exportId: string, http: HttpClient = apiClient) =>
    queryOptions({
      queryKey: dataControlKeys.export(orgId, exportId),
      queryFn: ({ signal }) => exportsApi.get(http, orgId, exportId, signal),
      refetchInterval: (query) => {
        const status = query.state.data?.status
        return status && ACTIVE_EXPORT_STATUSES.includes(status) ? ACTIVE_POLL_MS : false
      },
    }),
}
