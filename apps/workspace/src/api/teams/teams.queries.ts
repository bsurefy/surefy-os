// SPDX-License-Identifier: AGPL-3.0-only
import { infiniteQueryOptions, queryOptions } from '@tanstack/react-query'

import { PAGE_SIZE } from '@surefy/contracts'
import { apiClient } from '@surefy/web-core/http'
import type { HttpClient } from '@surefy/web-core/http'

import { teamsApi } from './teams.api'

export interface TeamListFilters {
  q?: string
  /** `name`, `-name`, `createdAt` or `-createdAt`. */
  sort?: string
  limit?: number
  cursor?: string
}

export interface TeamMemberListFilters {
  q?: string
  limit?: number
  cursor?: string
}

/** Query keys of the `teams` domain (services-api.md §3): teams and their members. */
export const teamKeys = {
  all: (orgId: string) => ['orgs', orgId, 'teams'] as const,
  lists: (orgId: string) => [...teamKeys.all(orgId), 'list'] as const,
  list: (orgId: string, filters: TeamListFilters) => [...teamKeys.lists(orgId), filters] as const,
  detail: (orgId: string, teamId: string) => [...teamKeys.all(orgId), 'detail', teamId] as const,
  deletionImpact: (orgId: string, teamId: string) =>
    [...teamKeys.detail(orgId, teamId), 'deletion-impact'] as const,
  members: (orgId: string, teamId: string, filters: TeamMemberListFilters) =>
    [...teamKeys.detail(orgId, teamId), 'members', filters] as const,
}

// `http` defaults to the browser client; server components pass getServerHttpClient()
export const teamQueries = {
  list: (orgId: string, filters: TeamListFilters, http: HttpClient = apiClient) =>
    infiniteQueryOptions({
      queryKey: teamKeys.list(orgId, filters),
      queryFn: ({ pageParam, signal }) =>
        teamsApi.list(
          http,
          orgId,
          { ...filters, limit: filters.limit ?? PAGE_SIZE.default, cursor: pageParam },
          signal,
        ),
      initialPageParam: undefined as string | undefined,
      getNextPageParam: (last) => last.nextCursor ?? undefined,
    }),
  detail: (orgId: string, teamId: string, http: HttpClient = apiClient) =>
    queryOptions({
      queryKey: teamKeys.detail(orgId, teamId),
      queryFn: ({ signal }) => teamsApi.get(http, orgId, teamId, signal),
    }),
  deletionImpact: (orgId: string, teamId: string, http: HttpClient = apiClient) =>
    queryOptions({
      queryKey: teamKeys.deletionImpact(orgId, teamId),
      queryFn: ({ signal }) => teamsApi.deletionImpact(http, orgId, teamId, signal),
      // the counts must be the ones at the moment of confirming
      gcTime: 0,
    }),
  members: (
    orgId: string,
    teamId: string,
    filters: TeamMemberListFilters,
    http: HttpClient = apiClient,
  ) =>
    infiniteQueryOptions({
      queryKey: teamKeys.members(orgId, teamId, filters),
      queryFn: ({ pageParam, signal }) =>
        teamsApi.members(
          http,
          orgId,
          teamId,
          { ...filters, limit: filters.limit ?? PAGE_SIZE.default, cursor: pageParam },
          signal,
        ),
      initialPageParam: undefined as string | undefined,
      getNextPageParam: (last) => last.nextCursor ?? undefined,
    }),
}
