// SPDX-License-Identifier: AGPL-3.0-only
import { queryOptions } from '@tanstack/react-query'

import { accessKeys } from '@surefy/web-core/api/access'
import { apiClient } from '@surefy/web-core/http'
import type { HttpClient } from '@surefy/web-core/http'

import { effectiveAccessApi } from './access.api'

/** Keys under the organization's `access` segment, so a feature error refreshes them with the rest. */
export const effectiveAccessKeys = {
  member: (orgId: string, userId: string) => [...accessKeys.all(orgId), 'members', userId] as const,
  team: (orgId: string, teamId: string) => [...accessKeys.all(orgId), 'teams', teamId] as const,
}

// `http` defaults to the browser client; server components pass getServerHttpClient()
export const effectiveAccessQueries = {
  member: (orgId: string, userId: string, http: HttpClient = apiClient) =>
    queryOptions({
      queryKey: effectiveAccessKeys.member(orgId, userId),
      queryFn: ({ signal }) => effectiveAccessApi.member(http, orgId, userId, signal),
    }),
  team: (orgId: string, teamId: string, http: HttpClient = apiClient) =>
    queryOptions({
      queryKey: effectiveAccessKeys.team(orgId, teamId),
      queryFn: ({ signal }) => effectiveAccessApi.team(http, orgId, teamId, signal),
    }),
}
