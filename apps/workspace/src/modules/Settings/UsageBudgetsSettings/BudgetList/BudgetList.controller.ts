// SPDX-License-Identifier: AGPL-3.0-only
import { useInfiniteQuery } from '@tanstack/react-query'
import { useTranslations } from 'next-intl'
import { debounce, useQueryStates } from 'nuqs'

import { budgetQueries } from '@/api/usage'
import { getErrorMessage, isApiError } from '@surefy/web-core/errors'

import { usageBudgetsSearchParams } from '../UsageBudgetsSettings.searchParams'

const SEARCH_DEBOUNCE_MS = 300

/** One list of budgets: the team budgets, or the personal limits with their search in the URL. */
export function useBudgetListController({
  orgId,
  scope,
}: {
  orgId: string
  scope: 'team' | 'user'
}) {
  const t = useTranslations('settings.usage')
  const tErrors = useTranslations('errors')
  const [filters, setFilters] = useQueryStates(usageBudgetsSearchParams)
  const q = scope === 'user' ? filters.q : ''
  const budgets = useInfiniteQuery(budgetQueries.list(orgId, { scope, q: q || undefined }))

  return {
    q,
    rows: budgets.data?.pages.flatMap((page) => page.items) ?? [],
    isLoading: budgets.isPending,
    errorMessage: budgets.error ? getErrorMessage(budgets.error, tErrors) : null,
    errorReference: isApiError(budgets.error) ? budgets.error.requestId : undefined,
    refetch: () => void budgets.refetch(),
    hasMore: budgets.hasNextPage,
    isLoadingMore: budgets.isFetchingNextPage,
    onLoadMore: () => void budgets.fetchNextPage(),
    onSearchChange: (value: string) =>
      void setFilters(
        { q: value || null },
        { limitUrlUpdates: debounce(SEARCH_DEBOUNCE_MS), history: 'replace' },
      ),
    onClearSearch: () => void setFilters({ q: null }),
    t,
  }
}
