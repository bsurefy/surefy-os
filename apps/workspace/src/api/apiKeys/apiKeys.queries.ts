// SPDX-License-Identifier: AGPL-3.0-only
import { infiniteQueryOptions, queryOptions } from '@tanstack/react-query'

import { PAGE_SIZE } from '@surefy/contracts'
import type { ApiKeyStatus } from '@surefy/contracts'
import { apiClient } from '@surefy/web-core/http'
import type { HttpClient } from '@surefy/web-core/http'

import { apiKeysApi } from './apiKeys.api'

/** The table's filters; the API accepts several statuses, the screen offers one at a time. */
export interface ApiKeyListFilters {
  q?: string
  status?: ApiKeyStatus
  /** `name`, `-name`, `createdAt`, `-createdAt`, `lastUsedAt` or `-lastUsedAt`. */
  sort?: string
  limit?: number
  cursor?: string
}

/** Query keys of the `apiKeys` domain (services-api.md §3): organization API keys. */
export const apiKeyKeys = {
  all: (orgId: string) => ['orgs', orgId, 'api-keys'] as const,
  lists: (orgId: string) => [...apiKeyKeys.all(orgId), 'list'] as const,
  list: (orgId: string, filters: ApiKeyListFilters) =>
    [...apiKeyKeys.lists(orgId), filters] as const,
  impact: (orgId: string, keyId: string) => [...apiKeyKeys.all(orgId), 'impact', keyId] as const,
}

// `http` defaults to the browser client; server components pass getServerHttpClient()
export const apiKeyQueries = {
  list: (orgId: string, filters: ApiKeyListFilters, http: HttpClient = apiClient) =>
    infiniteQueryOptions({
      queryKey: apiKeyKeys.list(orgId, filters),
      queryFn: ({ pageParam, signal }) =>
        apiKeysApi.list(
          http,
          orgId,
          { ...filters, limit: filters.limit ?? PAGE_SIZE.default, cursor: pageParam },
          signal,
        ),
      initialPageParam: undefined as string | undefined,
      getNextPageParam: (last) => last.nextCursor ?? undefined,
    }),
  impact: (orgId: string, keyId: string, http: HttpClient = apiClient) =>
    queryOptions({
      queryKey: apiKeyKeys.impact(orgId, keyId),
      queryFn: ({ signal }) => apiKeysApi.impact(http, orgId, keyId, signal),
      // the names must be the ones at the moment of confirming
      gcTime: 0,
    }),
}
