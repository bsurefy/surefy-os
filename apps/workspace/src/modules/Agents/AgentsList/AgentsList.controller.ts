// SPDX-License-Identifier: AGPL-3.0-only
import { useInfiniteQuery, useQuery } from '@tanstack/react-query'
import { useParams, useRouter } from 'next/navigation'
import { useTranslations } from 'next-intl'
import { debounce, useQueryStates } from 'nuqs'
import { useState } from 'react'

import { agentQueries, useCreateAgentMutation } from '@/api/agents'
import { guardQueries } from '@/api/guard'
import { ROUTES } from '@/constants/routes'
import { toRoute } from '@/modules/Workspace'
import { GUARD_DEFAULTS, PERMISSIONS } from '@surefy/contracts'
import type { ConfidenceThresholds } from '@surefy/ui/components/Feedback'
import { useCan, useCurrentOrgId } from '@surefy/web-core/access'
import { getErrorMessage, isApiError } from '@surefy/web-core/errors'

import { SEARCH_DEBOUNCE_MS } from './AgentsList.constants'
import { useAgentRowActions } from './AgentsList.hooks'
import { agentsListSearchParams } from './AgentsList.searchParams'
import { hasListFilters, toAgentListFilters } from './AgentsList.utils'

import type { AgentFilter, AgentOwner, AgentSort, AgentView } from './AgentsList.constants'

const BP = 10_000

/** Agents: the list with its filters in the URL, Create agent, and the actions of each agent. */
export function useAgentsListController() {
  const t = useTranslations('agents.list')
  const tErrors = useTranslations('errors')
  const router = useRouter()
  const orgId = useCurrentOrgId()
  const { orgSlug } = useParams<{ orgSlug: string }>()
  const canCreate = useCan(PERMISSIONS.AGENTS_CREATE)
  const [params, setParams] = useQueryStates(agentsListSearchParams)
  const [createError, setCreateError] = useState<string | null>(null)

  const list = useInfiniteQuery(agentQueries.list(orgId, toAgentListFilters(params)))
  const settings = useQuery(guardQueries.defaults(orgId))
  const create = useCreateAgentMutation(orgId, { silent: true })
  const actions = useAgentRowActions(orgId, orgSlug)

  // Colors the trust score; the defaults hold until the organization's own are read
  const thresholds: ConfidenceThresholds = {
    low: (settings.data?.reviewThresholdBp ?? GUARD_DEFAULTS.reviewThresholdBp) / BP,
    high: (settings.data?.autoThresholdBp ?? GUARD_DEFAULTS.autoThresholdBp) / BP,
  }
  const agents = (list.data?.pages.flatMap((page) => page.items) ?? []).filter(
    ({ id }) => !actions.hiddenIds.includes(id),
  )

  return {
    t,
    orgId,
    orgSlug,
    params,
    thresholds,
    agents,
    canCreate,
    actions,
    isLoading: list.isPending,
    errorMessage: list.error ? getErrorMessage(list.error, tErrors) : null,
    errorReference: isApiError(list.error) ? list.error.requestId : undefined,
    refetch: () => void list.refetch(),
    hasMore: list.hasNextPage,
    isLoadingMore: list.isFetchingNextPage,
    onLoadMore: () => void list.fetchNextPage(),
    hasFilters: hasListFilters(params),
    isCreating: create.isPending,
    createError,
    onDismissCreateError: () => {
      setCreateError(null)
    },
    /** "Create agent" starts from scratch; the editor opens on the new draft. */
    onCreate: async () => {
      setCreateError(null)
      try {
        const agent = await create.mutateAsync({ name: t('newAgentName') })
        router.push(toRoute(ROUTES.workspace.agent(orgSlug, agent.id)))
      } catch (error) {
        // The plan's agent limit, or any other reason, shown above the list where the button is
        setCreateError(getErrorMessage(error, tErrors))
      }
    },
    onSearchChange: (value: string) =>
      void setParams(
        { q: value || null },
        { limitUrlUpdates: debounce(SEARCH_DEBOUNCE_MS), history: 'replace' },
      ),
    onFilterChange: (filter: AgentFilter) =>
      void setParams({ filter: filter === 'all' ? null : filter }),
    onOwnerChange: (owner: AgentOwner) =>
      void setParams({ owner: owner === 'anyone' ? null : owner }),
    onSortChange: (sort: AgentSort) => void setParams({ sort: sort === 'lastRun' ? null : sort }),
    onViewChange: (view: AgentView) => void setParams({ view: view === 'cards' ? null : view }),
    onClearFilters: () => void setParams({ q: null, filter: null, owner: null }),
  }
}
