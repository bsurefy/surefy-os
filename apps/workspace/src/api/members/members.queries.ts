// SPDX-License-Identifier: AGPL-3.0-only
import { infiniteQueryOptions } from '@tanstack/react-query'

import { PAGE_SIZE } from '@surefy/contracts'
import type { InvitationStatus, MemberStatus, OrgRole } from '@surefy/contracts'
import { apiClient } from '@surefy/web-core/http'
import type { HttpClient } from '@surefy/web-core/http'

import { invitationsApi, membersApi } from './members.api'

/** The Members table's filters; the API accepts several values, the screen offers one at a time. */
export interface MemberListFilters {
  q?: string
  role?: OrgRole
  status?: MemberStatus
  teamId?: string
  /** `name` or `-name`, `lastActiveAt`, `createdAt`. */
  sort?: string
  limit?: number
  cursor?: string
}

export interface InvitationListFilters {
  q?: string
  status?: InvitationStatus
  limit?: number
  cursor?: string
}

/** Query keys of the `members` domain (services-api.md §3): members and invitations. */
export const memberKeys = {
  all: (orgId: string) => ['orgs', orgId, 'members'] as const,
  lists: (orgId: string) => [...memberKeys.all(orgId), 'list'] as const,
  list: (orgId: string, filters: MemberListFilters) =>
    [...memberKeys.lists(orgId), filters] as const,
  invitations: (orgId: string) => [...memberKeys.all(orgId), 'invitations'] as const,
  invitationList: (orgId: string, filters: InvitationListFilters) =>
    [...memberKeys.invitations(orgId), filters] as const,
}

// `http` defaults to the browser client; server components pass getServerHttpClient()
export const memberQueries = {
  list: (orgId: string, filters: MemberListFilters, http: HttpClient = apiClient) =>
    infiniteQueryOptions({
      queryKey: memberKeys.list(orgId, filters),
      queryFn: ({ pageParam, signal }) =>
        membersApi.list(
          http,
          orgId,
          { ...filters, limit: filters.limit ?? PAGE_SIZE.default, cursor: pageParam },
          signal,
        ),
      initialPageParam: undefined as string | undefined,
      getNextPageParam: (last) => last.nextCursor ?? undefined,
    }),
  invitations: (orgId: string, filters: InvitationListFilters, http: HttpClient = apiClient) =>
    infiniteQueryOptions({
      queryKey: memberKeys.invitationList(orgId, filters),
      queryFn: ({ pageParam, signal }) =>
        invitationsApi.list(
          http,
          orgId,
          { ...filters, limit: filters.limit ?? PAGE_SIZE.default, cursor: pageParam },
          signal,
        ),
      initialPageParam: undefined as string | undefined,
      getNextPageParam: (last) => last.nextCursor ?? undefined,
    }),
}
