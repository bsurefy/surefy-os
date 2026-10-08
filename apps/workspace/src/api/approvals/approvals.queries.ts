// SPDX-License-Identifier: AGPL-3.0-only
import { infiniteQueryOptions, queryOptions } from '@tanstack/react-query'

import { PAGE_SIZE } from '@surefy/contracts'
import type { ApprovalKind, ApprovalRisk, ApprovalStatus } from '@surefy/contracts'
import { apiClient } from '@surefy/web-core/http'
import type { HttpClient } from '@surefy/web-core/http'

import { approvalsApi } from './approvals.api'

/**
 * The queue's filters; without `status` the API answers the pending items, oldest first. The HTTP
 * client sends one value per key, so each facet holds a single value.
 */
export interface ApprovalListFilters {
  q?: string
  status?: ApprovalStatus
  kind?: ApprovalKind
  risk?: ApprovalRisk
  agentId?: string
  ruleRef?: string
  canDecide?: boolean
  quickApprovable?: boolean
  decidedToday?: boolean
  /** `createdAt`, `-createdAt`, `decidedAt`, `-decidedAt`, `amountMicros` or `-amountMicros`. */
  sort?: string
  limit?: number
  cursor?: string
}

/** Query keys of the `approvals` domain (services-api.md §3): the approvals queue. */
export const approvalKeys = {
  all: (orgId: string) => ['orgs', orgId, 'approvals'] as const,
  lists: (orgId: string) => [...approvalKeys.all(orgId), 'list'] as const,
  list: (orgId: string, filters: ApprovalListFilters) =>
    [...approvalKeys.lists(orgId), filters] as const,
  summary: (orgId: string) => [...approvalKeys.all(orgId), 'summary'] as const,
  details: (orgId: string) => [...approvalKeys.all(orgId), 'detail'] as const,
  detail: (orgId: string, approvalId: string) =>
    [...approvalKeys.details(orgId), approvalId] as const,
}

// `http` defaults to the browser client; server components pass getServerHttpClient()
export const approvalQueries = {
  list: (orgId: string, filters: ApprovalListFilters, http: HttpClient = apiClient) =>
    infiniteQueryOptions({
      queryKey: approvalKeys.list(orgId, filters),
      queryFn: ({ pageParam, signal }) =>
        approvalsApi.list(
          http,
          orgId,
          { ...filters, limit: filters.limit ?? PAGE_SIZE.default, cursor: pageParam },
          signal,
        ),
      initialPageParam: undefined as string | undefined,
      getNextPageParam: (last) => last.nextCursor ?? undefined,
    }),
  summary: (orgId: string, http: HttpClient = apiClient) =>
    queryOptions({
      queryKey: approvalKeys.summary(orgId),
      queryFn: ({ signal }) => approvalsApi.summary(http, orgId, signal),
    }),
  detail: (orgId: string, approvalId: string, http: HttpClient = apiClient) =>
    queryOptions({
      queryKey: approvalKeys.detail(orgId, approvalId),
      queryFn: ({ signal }) => approvalsApi.detail(http, orgId, approvalId, signal),
    }),
}
