// SPDX-License-Identifier: AGPL-3.0-only
import { useInfiniteQuery, useQuery } from '@tanstack/react-query'
import { useFormatter, useNow, useTranslations } from 'next-intl'
import { debounce, useQueryStates } from 'nuqs'
import { useState } from 'react'

import { knowledgeQueries } from '@/api/knowledge'
import { useCurrentOrgId } from '@surefy/web-core/access'
import { getErrorMessage, isApiError } from '@surefy/web-core/errors'

import { SEARCH_DEBOUNCE_MS } from '../Knowledge.constants'
import { canManageBase, toBaseListFilter } from '../Knowledge.utils'
import { knowledgeLibrarySearchParams } from './KnowledgeLibrary.searchParams'

import type { BaseFilter, BaseSort, LibraryView } from '../Knowledge.constants'

/** Knowledge: the KPIs, the list with its filters in the URL, and Recently deleted in its place. */
export function useKnowledgeLibraryController() {
  const t = useTranslations('knowledge.library')
  const tErrors = useTranslations('errors')
  const format = useFormatter()
  const now = useNow()
  const orgId = useCurrentOrgId()
  const [params, setParams] = useQueryStates(knowledgeLibrarySearchParams)
  const [isCreatingHere, setIsCreatingHere] = useState(false)

  const summary = useQuery(knowledgeQueries.summary(orgId))
  const list = useInfiniteQuery(
    knowledgeQueries.list(orgId, {
      q: params.q || undefined,
      sort: params.sort,
      ...toBaseListFilter(params.filter),
    }),
  )
  // Recently deleted is for people who can manage at least one base; ask the unfiltered list
  const everything = useInfiniteQuery(knowledgeQueries.list(orgId, {}))
  const canSeeDeleted = (everything.data?.pages.flatMap((page) => page.items) ?? []).some(
    canManageBase,
  )

  const bases = list.data?.pages.flatMap((page) => page.items) ?? []
  const hasFilters = params.q !== '' || params.filter !== 'all'
  return {
    t,
    orgId,
    format,
    now,
    params,
    view: params.view,
    bases,
    summary: summary.data,
    isLoading: list.isPending,
    errorMessage: list.error ? getErrorMessage(list.error, tErrors) : null,
    errorReference: isApiError(list.error) ? list.error.requestId : undefined,
    refetch: () => void list.refetch(),
    hasMore: list.hasNextPage,
    isLoadingMore: list.isFetchingNextPage,
    onLoadMore: () => void list.fetchNextPage(),
    hasFilters,
    canSeeDeleted: canSeeDeleted || params.view === 'deleted',
    // Opened by the button, or by the command palette's link (`?create=1`)
    isCreating: isCreatingHere || params.create === '1',
    onCreate: () => {
      setIsCreatingHere(true)
    },
    onCloseCreate: () => {
      setIsCreatingHere(false)
      if (params.create) void setParams({ create: null })
    },
    onViewChange: (view: LibraryView) => void setParams({ view: view === 'bases' ? null : view }),
    onSearchChange: (value: string) =>
      void setParams(
        { q: value || null },
        { limitUrlUpdates: debounce(SEARCH_DEBOUNCE_MS), history: 'replace' },
      ),
    onFilterChange: (filter: BaseFilter) =>
      void setParams({ filter: filter === 'all' ? null : filter }),
    onSortChange: (sort: BaseSort) => void setParams({ sort: sort === 'name' ? null : sort }),
    onClearFilters: () => void setParams({ q: null, filter: null }),
  }
}
