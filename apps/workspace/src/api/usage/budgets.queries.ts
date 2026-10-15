// SPDX-License-Identifier: AGPL-3.0-only
import { infiniteQueryOptions } from '@tanstack/react-query'

import { PAGE_SIZE } from '@surefy/contracts'
import { apiClient } from '@surefy/web-core/http'
import type { HttpClient } from '@surefy/web-core/http'

import { budgetsApi } from './budgets.api'
import { usageKeys } from './usage.queries'

import type { BudgetListFilters } from './budgets.api'

/** Query keys of the `usage` domain's budgets, under `usageKeys.all`. */
export const budgetKeys = {
  all: (orgId: string) => [...usageKeys.all(orgId), 'budgets'] as const,
  lists: (orgId: string) => [...budgetKeys.all(orgId), 'list'] as const,
  list: (orgId: string, filters: BudgetListFilters) =>
    [...budgetKeys.lists(orgId), filters] as const,
}

// `http` defaults to the browser client; server components pass getServerHttpClient()
export const budgetQueries = {
  list: (orgId: string, filters: BudgetListFilters, http: HttpClient = apiClient) =>
    infiniteQueryOptions({
      queryKey: budgetKeys.list(orgId, filters),
      queryFn: ({ pageParam, signal }) =>
        budgetsApi.list(
          http,
          orgId,
          { ...filters, limit: filters.limit ?? PAGE_SIZE.default, cursor: pageParam },
          signal,
        ),
      initialPageParam: undefined as string | undefined,
      getNextPageParam: (last) => last.nextCursor ?? undefined,
    }),
}
