// SPDX-License-Identifier: AGPL-3.0-only
import { useInfiniteQuery, useQuery } from '@tanstack/react-query'
import { useParams } from 'next/navigation'
import { useNow, useTimeZone, useTranslations } from 'next-intl'
import { createSerializer, useQueryStates } from 'nuqs'
import { useState } from 'react'

import { agentQueries } from '@/api/agents'
import { memberQueries } from '@/api/members'
import { modelQueries } from '@/api/models'
import { teamQueries } from '@/api/teams'
import { usageQueries } from '@/api/usage'
import { ROUTES, SETTINGS_SECTION } from '@/constants/routes'
import { toRoute } from '@/modules/Workspace'
import { PERMISSIONS } from '@surefy/contracts'
import { useCan, useCurrentOrgId } from '@surefy/web-core/access'
import { getErrorMessage, isApiError } from '@surefy/web-core/errors'

import { BREAKDOWN_LIMIT, FILTER_OPTIONS_LIMIT } from './InsightsOverview.constants'
import { insightsOverviewSearchParams } from './InsightsOverview.searchParams'
import {
  getRangeDays,
  hasActiveFilters,
  hasUsageOnlyFilters,
  intervalFor,
  runsIntervalFor,
  toBudgetMeterQuery,
  toInsightsQuery,
  toRunsQuery,
} from './InsightsOverview.utils'
import { runsSearchParams } from '../Runs/Runs.searchParams'

import type { InsightsOverviewFilters } from './InsightsOverview.types'

const serializeRunsFilters = createSerializer(runsSearchParams)

/**
 * Insights › Overview: range, filters and grouping in the URL; the usage KPIs, the run KPIs, the
 * budget meter, the cost breakdown and the two series as separate queries, so one failing part
 * leaves the rest on screen.
 */
export function useInsightsOverviewController() {
  const t = useTranslations('insights.overview')
  const tErrors = useTranslations('errors')
  const orgId = useCurrentOrgId()
  const now = useNow()
  const timeZone = useTimeZone() ?? 'UTC'
  const { orgSlug } = useParams<{ orgSlug: string }>()
  const [filters, setFilters] = useQueryStates(insightsOverviewSearchParams)
  const [isExportOpen, setIsExportOpen] = useState(false)
  const canReadBudgets = useCan(PERMISSIONS.BUDGETS_READ)
  const canCreateAgents = useCan(PERMISSIONS.AGENTS_CREATE)

  const query = toInsightsQuery(filters, now, timeZone)
  const interval = intervalFor(query)
  const overview = useQuery(usageQueries.overview(orgId, query))
  const breakdown = useQuery(
    usageQueries.breakdown(orgId, { ...query, by: filters.by, limit: BREAKDOWN_LIMIT }),
  )
  const series = useQuery(usageQueries.timeseries(orgId, { ...query, interval }))
  const runsQuery = toRunsQuery(query)
  const runsInterval = runsIntervalFor(runsQuery)
  const runs = useQuery(usageQueries.runsOverview(orgId, runsQuery))
  const runsSeries = useQuery(
    usageQueries.runsTimeseries(orgId, { ...runsQuery, interval: runsInterval }),
  )
  const budget = useQuery(usageQueries.budgetMeter(orgId, toBudgetMeterQuery(filters)))

  const teams = useInfiniteQuery(teamQueries.list(orgId, { limit: FILTER_OPTIONS_LIMIT }))
  const people = useInfiniteQuery(memberQueries.list(orgId, { limit: FILTER_OPTIONS_LIMIT }))
  const models = useInfiniteQuery(modelQueries.list(orgId, { limit: FILTER_OPTIONS_LIMIT }))
  const agents = useInfiniteQuery(agentQueries.list(orgId, { limit: FILTER_OPTIONS_LIMIT }))

  const errorOf = (error: Error | null) =>
    error
      ? {
          message: getErrorMessage(error, tErrors),
          reference: isApiError(error) ? error.requestId : undefined,
        }
      : null

  const teamOptions = (teams.data?.pages.flatMap((page) => page.items) ?? []).map((team) => ({
    value: team.id,
    label: team.name,
  }))
  const personOptions = (people.data?.pages.flatMap((page) => page.items) ?? []).map((member) => ({
    value: member.user.id,
    label: member.user.name,
  }))
  const labelOf = (options: { value: string; label: string }[], value: string) =>
    options.find((option) => option.value === value)?.label ?? null
  let budgetScope: { kind: 'organization' | 'team' | 'person'; name: string | null } = {
    kind: 'organization',
    name: null,
  }
  if (filters.person) budgetScope = { kind: 'person', name: labelOf(personOptions, filters.person) }
  else if (filters.team) budgetScope = { kind: 'team', name: labelOf(teamOptions, filters.team) }

  // the Runs tab for the same range and agent; it has no team, person or model filter
  const runsHref = `${ROUTES.workspace.insights(orgSlug, 'runs')}${serializeRunsFilters({
    range: filters.range,
    from: filters.range === 'custom' ? filters.from : null,
    to: filters.range === 'custom' ? filters.to : null,
    agent: filters.agent,
  })}`

  return {
    orgId,
    orgSlug,
    filters,
    query,
    interval,
    rangeDays: getRangeDays(filters, now, timeZone),
    timeZone,
    overview: {
      data: overview.data,
      isLoading: overview.isPending,
      error: errorOf(overview.error),
      refetch: () => void overview.refetch(),
    },
    breakdown: {
      data: breakdown.data,
      isLoading: breakdown.isPending,
      error: errorOf(breakdown.error),
      refetch: () => void breakdown.refetch(),
    },
    series: {
      data: series.data,
      isLoading: series.isPending,
      error: errorOf(series.error),
      refetch: () => void series.refetch(),
    },
    runs: {
      data: runs.data,
      isLoading: runs.isPending,
      error: errorOf(runs.error),
      refetch: () => void runs.refetch(),
    },
    runsSeries: {
      data: runsSeries.data,
      isLoading: runsSeries.isPending,
      error: errorOf(runsSeries.error),
      refetch: () => void runsSeries.refetch(),
    },
    runsInterval,
    runsHref: toRoute(runsHref),
    hasUsageOnlyFilters: hasUsageOnlyFilters(filters),
    budget: {
      data: budget.data,
      isLoading: budget.isPending,
      error: errorOf(budget.error),
      refetch: () => void budget.refetch(),
    },
    budgetScope,
    budgetsHref: canReadBudgets
      ? toRoute(ROUTES.workspace.settings(orgSlug, SETTINGS_SECTION.USAGE))
      : null,
    newAgentHref: canCreateAgents ? toRoute(ROUTES.workspace.agentNew(orgSlug)) : null,
    teamOptions,
    personOptions,
    modelOptions: (models.data?.pages.flatMap((page) => page.items) ?? []).map((model) => ({
      value: model.modelKey,
      label: model.displayName,
    })),
    agentOptions: (agents.data?.pages.flatMap((page) => page.items) ?? []).map((agent) => ({
      value: agent.id,
      label: agent.name,
    })),
    hasFilters: hasActiveFilters(filters),
    onFiltersChange: (next: Partial<InsightsOverviewFilters>) => void setFilters(next),
    onClearFilters: () => void setFilters({ team: null, person: null, model: null, agent: null }),
    isExportOpen,
    onExportOpenChange: setIsExportOpen,
    t,
  }
}
