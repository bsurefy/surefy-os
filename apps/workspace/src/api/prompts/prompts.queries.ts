// SPDX-License-Identifier: AGPL-3.0-only
import { infiniteQueryOptions } from '@tanstack/react-query'

import { PAGE_SIZE } from '@surefy/contracts'
import { apiClient } from '@surefy/web-core/http'
import type { HttpClient } from '@surefy/web-core/http'

import { promptsApi } from './prompts.api'

export interface PromptListFilters {
  /** Matches the title and the body. */
  q?: string
  visibility?: 'personal' | 'shared'
  /** `deleted` is Recently deleted. */
  state?: 'active' | 'deleted'
  /** `updatedAt`, `title` or `deletedAt`, with a leading `-` for descending. */
  sort?: string
  limit?: number
  cursor?: string
}

/** Query keys of the prompt library (services-api.md §3). */
export const promptKeys = {
  all: (orgId: string) => ['orgs', orgId, 'prompts'] as const,
  lists: (orgId: string) => [...promptKeys.all(orgId), 'list'] as const,
  list: (orgId: string, filters: PromptListFilters) =>
    [...promptKeys.lists(orgId), filters] as const,
}

// `http` defaults to the browser client; server components pass getServerHttpClient()
export const promptQueries = {
  list: (orgId: string, filters: PromptListFilters, http: HttpClient = apiClient) =>
    infiniteQueryOptions({
      queryKey: promptKeys.list(orgId, filters),
      queryFn: ({ pageParam, signal }) =>
        promptsApi.list(
          http,
          orgId,
          { ...filters, limit: filters.limit ?? PAGE_SIZE.default, cursor: pageParam },
          signal,
        ),
      initialPageParam: undefined as string | undefined,
      getNextPageParam: (last) => last.nextCursor ?? undefined,
    }),
}
