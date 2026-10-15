// SPDX-License-Identifier: AGPL-3.0-only
import { useInfiniteQuery } from '@tanstack/react-query'
import { useTranslations } from 'next-intl'

import { promptQueries } from '@/api/prompts'
import { getErrorMessage, isApiError } from '@surefy/web-core/errors'

import type { PromptListFilters } from '@/api/prompts'

/** One filtered list of prompts, loaded a page at a time. */
export function usePromptPages(orgId: string, filters: PromptListFilters, isEnabled = true) {
  const tErrors = useTranslations('errors')
  const list = useInfiniteQuery({ ...promptQueries.list(orgId, filters), enabled: isEnabled })
  return {
    prompts: list.data?.pages.flatMap((page) => page.items) ?? [],
    isLoading: isEnabled && list.isPending,
    errorMessage: list.error ? getErrorMessage(list.error, tErrors) : null,
    errorReference: isApiError(list.error) ? list.error.requestId : undefined,
    refetch: () => void list.refetch(),
    hasMore: list.hasNextPage,
    isLoadingMore: list.isFetchingNextPage,
    onLoadMore: () => void list.fetchNextPage(),
  }
}
export type PromptPages = ReturnType<typeof usePromptPages>
