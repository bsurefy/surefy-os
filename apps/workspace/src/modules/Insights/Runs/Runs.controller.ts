// SPDX-License-Identifier: AGPL-3.0-only
import { useInfiniteQuery, useQuery } from '@tanstack/react-query'
import { useParams } from 'next/navigation'
import { useNow, useTimeZone, useTranslations } from 'next-intl'
import { debounce, useQueryStates } from 'nuqs'

import { agentRunQueries } from '@/api/agentRuns'
import { agentQueries } from '@/api/agents'
import { guardQueries } from '@/api/guard'
import { modelQueries } from '@/api/models'
import { teamQueries } from '@/api/teams'
import { ROUTES } from '@/constants/routes'
import { toRoute } from '@/modules/Workspace'
import { PERMISSIONS } from '@surefy/contracts'
import type { DataTableSort } from '@surefy/ui/components/DataDisplay'
import { useCan, useCurrentOrgId } from '@surefy/web-core/access'
import { getErrorMessage, isApiError } from '@surefy/web-core/errors'

import {
  DEFAULT_CONFIDENCE_THRESHOLDS,
  FILTER_OPTIONS_LIMIT,
  SEARCH_DEBOUNCE_MS,
} from './Runs.constants'
import { runsSearchParams } from './Runs.searchParams'
import { fromTableSort, hasActiveFilters, toRunListQuery, toTableSort } from './Runs.utils'
import { basisPointsToShare } from '../InsightsOverview/InsightsOverview.utils'

import type { FilterOption, RunsFilters } from './Runs.types'

/**
 * Insights › Runs: every run the person may read, newest first; search, filters and sort in the
 * URL; each row opens the run detail. Builders get the runs of their agents (the API narrows the
 * list).
 */
export function useRunsController() {
  const t = useTranslations('insights.runs')
  const tErrors = useTranslations('errors')
  const { orgSlug } = useParams<{ orgSlug: string }>()
  const orgId = useCurrentOrgId()
  const now = useNow()
  const timeZone = useTimeZone() ?? 'UTC'
  const [filters, setFilters] = useQueryStates(runsSearchParams)
  const canCreateAgents = useCan(PERMISSIONS.AGENTS_CREATE)

  const list = useInfiniteQuery(
    agentRunQueries.listAll(orgId, toRunListQuery(filters, now, timeZone)),
  )
  const agents = useInfiniteQuery(agentQueries.list(orgId, { limit: FILTER_OPTIONS_LIMIT }))
  const teams = useInfiniteQuery(teamQueries.list(orgId, { limit: FILTER_OPTIONS_LIMIT }))
  const models = useInfiniteQuery(modelQueries.list(orgId, { limit: FILTER_OPTIONS_LIMIT }))
  const guard = useQuery(guardQueries.defaults(orgId))

  const options = <Item>(
    pages: { pages: { items: Item[] }[] } | undefined,
    toOption: (item: Item) => FilterOption,
  ): FilterOption[] => (pages?.pages.flatMap((page) => page.items) ?? []).map(toOption)

  return {
    t,
    filters,
    timeZone,
    rows: list.data?.pages.flatMap((page) => page.items) ?? [],
    isLoading: list.isPending,
    errorMessage: list.error ? getErrorMessage(list.error, tErrors) : null,
    errorReference: isApiError(list.error) ? list.error.requestId : undefined,
    refetch: () => void list.refetch(),
    hasMore: list.hasNextPage,
    isLoadingMore: list.isFetchingNextPage,
    onLoadMore: () => void list.fetchNextPage(),
    agentOptions: options(agents.data, (agent) => ({ value: agent.id, label: agent.name })),
    teamOptions: options(teams.data, (team) => ({ value: team.id, label: team.name })),
    modelOptions: options(models.data, (model) => ({
      value: model.modelKey,
      label: model.displayName,
    })),
    thresholds: guard.data
      ? {
          low: basisPointsToShare(guard.data.reviewThresholdBp),
          high: basisPointsToShare(guard.data.autoThresholdBp),
        }
      : DEFAULT_CONFIDENCE_THRESHOLDS,
    hasFilters: hasActiveFilters(filters),
    sort: toTableSort(filters.sort),
    onSortChange: (sort: DataTableSort) => void setFilters({ sort: fromTableSort(sort) }),
    getRunHref: (runId: string) => toRoute(ROUTES.workspace.run(orgSlug, runId)),
    newAgentHref: canCreateAgents ? toRoute(ROUTES.workspace.agentNew(orgSlug)) : null,
    onSearchChange: (value: string) =>
      void setFilters(
        { q: value || null },
        { limitUrlUpdates: debounce(SEARCH_DEBOUNCE_MS), history: 'replace' },
      ),
    onFiltersChange: (next: Partial<RunsFilters>) => void setFilters(next),
    onClearFilters: () =>
      void setFilters({
        q: null,
        status: null,
        trigger: null,
        agent: null,
        team: null,
        model: null,
        human: null,
        range: null,
        from: null,
        to: null,
      }),
  }
}
