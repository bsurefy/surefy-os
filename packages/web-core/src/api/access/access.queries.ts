// SPDX-License-Identifier: AGPL-3.0-only
import { queryOptions } from '@tanstack/react-query'

import { accessApi } from './access.api'
import { apiClient } from '../../http/apiClient'

import type { HttpClient } from '../../http/http.types'
import type { QueryFilters, QueryKey } from '@tanstack/react-query'

/** Effective access changes rarely; navigation and every gate read it. */
export const EFFECTIVE_ACCESS_STALE_TIME = 60_000

const ACCESS_SEGMENT = 'access'

export const accessKeys = {
  all: (orgId: string) => ['orgs', orgId, ACCESS_SEGMENT] as const,
  me: (orgId: string) => [...accessKeys.all(orgId), 'me'] as const,
}

function isAccessKey(queryKey: QueryKey): boolean {
  return queryKey[0] === 'orgs' && queryKey[2] === ACCESS_SEGMENT
}

/**
 * Every organization's access queries, for handlers that do not know the current organization:
 * `queryClient.invalidateQueries(allAccessQueries)` after `FEATURE_NOT_AVAILABLE`.
 */
export const allAccessQueries: QueryFilters = {
  predicate: (query) => isAccessKey(query.queryKey),
}

// `http` defaults to the browser client; server components pass getServerHttpClient()
export const accessQueries = {
  me: (orgId: string, http: HttpClient = apiClient) =>
    queryOptions({
      queryKey: accessKeys.me(orgId),
      queryFn: ({ signal }) => accessApi.me(http, orgId, signal),
      staleTime: EFFECTIVE_ACCESS_STALE_TIME,
    }),
}
