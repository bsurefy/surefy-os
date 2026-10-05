// SPDX-License-Identifier: AGPL-3.0-only
import { useInfiniteQuery } from '@tanstack/react-query'
import { useTranslations } from 'next-intl'
import { debounce, parseAsString, useQueryState } from 'nuqs'

import { modelQueries } from '@/api/models'
import { useCurrentOrgId } from '@surefy/web-core/access'
import { getErrorMessage, isApiError } from '@surefy/web-core/errors'

import { KEYS_PAGE_SIZE } from '../Vault.constants'

const SEARCH_DEBOUNCE_MS = 300

/** The Builder's read-only list of the models they may use. */
export function useModelListController() {
  const t = useTranslations('vault.builder')
  const tErrors = useTranslations('errors')
  const orgId = useCurrentOrgId()
  const [q, setQ] = useQueryState('q', parseAsString.withDefault(''))
  const query = useInfiniteQuery(
    modelQueries.usable(orgId, { q: q || undefined, limit: KEYS_PAGE_SIZE }),
  )

  return {
    t,
    q,
    models: query.data?.pages.flatMap((page) => page.items) ?? [],
    isLoading: query.isPending,
    errorMessage: query.error ? getErrorMessage(query.error, tErrors) : null,
    errorReference: isApiError(query.error) ? query.error.requestId : undefined,
    refetch: () => void query.refetch(),
    hasMore: query.hasNextPage,
    isLoadingMore: query.isFetchingNextPage,
    onLoadMore: () => void query.fetchNextPage(),
    onSearchChange: (value: string) =>
      void setQ(value || null, {
        limitUrlUpdates: debounce(SEARCH_DEBOUNCE_MS),
        history: 'replace',
      }),
    onClearSearch: () => void setQ(null),
  }
}
