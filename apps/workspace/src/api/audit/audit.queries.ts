// SPDX-License-Identifier: AGPL-3.0-only
import { infiniteQueryOptions, queryOptions } from '@tanstack/react-query'

import { PAGE_SIZE } from '@surefy/contracts'
import type { AuditActorType, AuditOutcome } from '@surefy/contracts'
import { apiClient } from '@surefy/web-core/http'
import type { HttpClient } from '@surefy/web-core/http'

import { auditApi } from './audit.api'

/** The audit table's filters; the API accepts several values, the screen offers one at a time. */
export interface AuditEntryListFilters {
  q?: string
  actorType?: AuditActorType
  actorUserId?: string
  action?: string
  targetType?: string
  outcome?: AuditOutcome
  /** ISO date-times bounding `createdAt` (inclusive from, exclusive to). */
  from?: string
  to?: string
  limit?: number
  cursor?: string
}

/** Query keys of the `audit` domain (services-api.md §3): the audit log. */
export const auditKeys = {
  all: (orgId: string) => ['orgs', orgId, 'audit'] as const,
  entries: (orgId: string) => [...auditKeys.all(orgId), 'entries'] as const,
  entryList: (orgId: string, filters: AuditEntryListFilters) =>
    [...auditKeys.entries(orgId), 'list', filters] as const,
  entry: (orgId: string, entryId: string) =>
    [...auditKeys.entries(orgId), 'detail', entryId] as const,
  integrity: (orgId: string) => [...auditKeys.all(orgId), 'integrity'] as const,
}

// `http` defaults to the browser client; server components pass getServerHttpClient()
export const auditQueries = {
  list: (orgId: string, filters: AuditEntryListFilters, http: HttpClient = apiClient) =>
    infiniteQueryOptions({
      queryKey: auditKeys.entryList(orgId, filters),
      queryFn: ({ pageParam, signal }) =>
        auditApi.list(
          http,
          orgId,
          { ...filters, limit: filters.limit ?? PAGE_SIZE.default, cursor: pageParam },
          signal,
        ),
      initialPageParam: undefined as string | undefined,
      getNextPageParam: (last) => last.nextCursor ?? undefined,
    }),
  entry: (orgId: string, entryId: string, http: HttpClient = apiClient) =>
    queryOptions({
      queryKey: auditKeys.entry(orgId, entryId),
      queryFn: ({ signal }) => auditApi.get(http, orgId, entryId, signal),
    }),
  integrity: (orgId: string, http: HttpClient = apiClient) =>
    queryOptions({
      queryKey: auditKeys.integrity(orgId),
      queryFn: ({ signal }) => auditApi.integrity(http, orgId, signal),
    }),
}
