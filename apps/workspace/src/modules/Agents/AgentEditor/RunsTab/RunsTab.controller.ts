// SPDX-License-Identifier: AGPL-3.0-only
import { useInfiniteQuery } from '@tanstack/react-query'
import { useParams } from 'next/navigation'
import { useTranslations } from 'next-intl'
import { debounce, useQueryStates } from 'nuqs'

import { agentRunQueries } from '@/api/agentRuns'
import { ROUTES } from '@/constants/routes'
import { toRoute } from '@/modules/Workspace'
import { useCurrentOrgId } from '@surefy/web-core/access'
import { getErrorMessage, isApiError } from '@surefy/web-core/errors'

import { SEARCH_DEBOUNCE_MS } from './RunsTab.constants'
import { runsTabSearchParams } from './RunsTab.searchParams'
import { hasActiveFilters, toRunQuery } from './RunsTab.utils'

import type { RunsTabFilters, RunsTabProps } from './RunsTab.types'

/** Runs: this agent's runs newest first; filters in the URL; each run opens its detail in Insights. */
export function useRunsTabController({ agent }: RunsTabProps) {
  const t = useTranslations('agents.editor.runs')
  const tErrors = useTranslations('errors')
  const { orgSlug } = useParams<{ orgSlug: string }>()
  const orgId = useCurrentOrgId()
  const [filters, setFilters] = useQueryStates(runsTabSearchParams)

  const list = useInfiniteQuery(agentRunQueries.list(orgId, agent.id, toRunQuery(filters)))

  return {
    t,
    filters,
    rows: list.data?.pages.flatMap((page) => page.items) ?? [],
    isLoading: list.isPending,
    errorMessage: list.error ? getErrorMessage(list.error, tErrors) : null,
    errorReference: isApiError(list.error) ? list.error.requestId : undefined,
    refetch: () => void list.refetch(),
    hasMore: list.hasNextPage,
    isLoadingMore: list.isFetchingNextPage,
    onLoadMore: () => void list.fetchNextPage(),
    hasFilters: hasActiveFilters(filters),
    getRunHref: (runId: string) => toRoute(ROUTES.workspace.run(orgSlug, runId)),
    onSearchChange: (value: string) =>
      void setFilters(
        { q: value || null },
        { limitUrlUpdates: debounce(SEARCH_DEBOUNCE_MS), history: 'replace' },
      ),
    onFiltersChange: (next: Partial<RunsTabFilters>) => void setFilters(next),
    onClearFilters: () => void setFilters({ q: null, status: null, human: null, test: null }),
  }
}
