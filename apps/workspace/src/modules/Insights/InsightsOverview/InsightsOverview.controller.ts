// SPDX-License-Identifier: AGPL-3.0-only
import { useInfiniteQuery, useQuery } from '@tanstack/react-query'
import { useNow, useTimeZone, useTranslations } from 'next-intl'
import { useQueryStates } from 'nuqs'
import { useState } from 'react'

import { memberQueries } from '@/api/members'
import { modelQueries } from '@/api/models'
import { teamQueries } from '@/api/teams'
import { usageQueries } from '@/api/usage'
import { useCurrentOrgId } from '@surefy/web-core/access'
import { getErrorMessage, isApiError } from '@surefy/web-core/errors'

import { BREAKDOWN_LIMIT, FILTER_OPTIONS_LIMIT } from './InsightsOverview.constants'
import { insightsOverviewSearchParams } from './InsightsOverview.searchParams'
import {
  getRangeDays,
  hasActiveFilters,
  intervalFor,
  toInsightsQuery,
} from './InsightsOverview.utils'

import type { InsightsOverviewFilters } from './InsightsOverview.types'

/**
 * Insights › Overview: range, filters and grouping in the URL; the KPIs, the cost breakdown and
 * the token series as three queries, so one failing chart leaves the rest on screen.
 */
export function useInsightsOverviewController() {
  const t = useTranslations('insights.overview')
  const tErrors = useTranslations('errors')
  const orgId = useCurrentOrgId()
  const now = useNow()
  const timeZone = useTimeZone() ?? 'UTC'
  const [filters, setFilters] = useQueryStates(insightsOverviewSearchParams)
  const [isExportOpen, setIsExportOpen] = useState(false)

  const query = toInsightsQuery(filters, now, timeZone)
  const interval = intervalFor(query)
  const overview = useQuery(usageQueries.overview(orgId, query))
  const breakdown = useQuery(
    usageQueries.breakdown(orgId, { ...query, by: filters.by, limit: BREAKDOWN_LIMIT }),
  )
  const series = useQuery(usageQueries.timeseries(orgId, { ...query, interval }))

  const teams = useInfiniteQuery(teamQueries.list(orgId, { limit: FILTER_OPTIONS_LIMIT }))
  const people = useInfiniteQuery(memberQueries.list(orgId, { limit: FILTER_OPTIONS_LIMIT }))
  const models = useInfiniteQuery(modelQueries.list(orgId, { limit: FILTER_OPTIONS_LIMIT }))

  const errorOf = (error: Error | null) =>
    error
      ? {
          message: getErrorMessage(error, tErrors),
          reference: isApiError(error) ? error.requestId : undefined,
        }
      : null

  return {
    orgId,
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
    teamOptions: (teams.data?.pages.flatMap((page) => page.items) ?? []).map((team) => ({
      value: team.id,
      label: team.name,
    })),
    personOptions: (people.data?.pages.flatMap((page) => page.items) ?? []).map((member) => ({
      value: member.user.id,
      label: member.user.name,
    })),
    modelOptions: (models.data?.pages.flatMap((page) => page.items) ?? []).map((model) => ({
      value: model.modelKey,
      label: model.displayName,
    })),
    hasFilters: hasActiveFilters(filters),
    onFiltersChange: (next: Partial<InsightsOverviewFilters>) => void setFilters(next),
    onClearFilters: () => void setFilters({ team: null, person: null, model: null }),
    isExportOpen,
    onExportOpenChange: setIsExportOpen,
    t,
  }
}
