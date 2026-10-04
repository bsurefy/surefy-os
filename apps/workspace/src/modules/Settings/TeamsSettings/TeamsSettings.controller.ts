// SPDX-License-Identifier: AGPL-3.0-only
import { useInfiniteQuery } from '@tanstack/react-query'
import { useTranslations } from 'next-intl'
import { debounce, useQueryStates } from 'nuqs'
import { useState } from 'react'

import { memberQueries } from '@/api/members'
import { teamQueries } from '@/api/teams'
import { PERMISSIONS } from '@surefy/contracts'
import type { TeamDto } from '@surefy/contracts'
import { useCan, useCurrentOrgId } from '@surefy/web-core/access'
import { getErrorMessage, isApiError } from '@surefy/web-core/errors'

import { PEOPLE_LOOKUP_LIMIT } from './TeamsSettings.constants'
import { teamsSearchParams } from './TeamsSettings.searchParams'
import { indexNamesByUserId } from './TeamsSettings.utils'

import type { TeamDialogKind } from './TeamsSettings.constants'

const SEARCH_DEBOUNCE_MS = 300

export interface OpenTeamDialog {
  kind: TeamDialogKind
  team?: TeamDto
}

/** Settings › Teams: the list with its filters in the URL, the open team detail and the dialogs. */
export function useTeamsSettingsController() {
  const t = useTranslations('settings.teams')
  const tErrors = useTranslations('errors')
  const orgId = useCurrentOrgId()
  const [filters, setFilters] = useQueryStates(teamsSearchParams)
  const [dialog, setDialog] = useState<OpenTeamDialog | null>(null)
  const canManage = useCan(PERMISSIONS.TEAMS_MANAGE)

  const list = useInfiniteQuery(
    teamQueries.list(orgId, { q: filters.q || undefined, sort: filters.sort }),
  )
  // The list names the lead by user id; the people list turns it into a name
  const people = useInfiniteQuery(
    memberQueries.list(orgId, { status: 'active', limit: PEOPLE_LOOKUP_LIMIT }),
  )

  const teams = list.data?.pages.flatMap((page) => page.items) ?? []
  return {
    orgId,
    filters,
    teams,
    leadNames: indexNamesByUserId(people.data?.pages.flatMap((page) => page.items) ?? []),
    isLoading: list.isPending,
    errorMessage: list.error ? getErrorMessage(list.error, tErrors) : null,
    errorReference: isApiError(list.error) ? list.error.requestId : undefined,
    refetch: () => void list.refetch(),
    hasMore: list.hasNextPage,
    isLoadingMore: list.isFetchingNextPage,
    onLoadMore: () => void list.fetchNextPage(),
    canManage,
    hasSearch: filters.q !== '',
    onSearchChange: (value: string) =>
      void setFilters(
        { q: value || null },
        { limitUrlUpdates: debounce(SEARCH_DEBOUNCE_MS), history: 'replace' },
      ),
    onSortChange: (sort: string) => void setFilters({ sort: sort as typeof filters.sort }),
    onClearSearch: () => void setFilters({ q: null }),
    getTeamHref: (teamId: string) => {
      const params = new URLSearchParams()
      if (filters.q) params.set('q', filters.q)
      if (filters.sort !== 'name') params.set('sort', filters.sort)
      params.set('team', teamId)
      return `?${params.toString()}`
    },
    openTeamId: filters.team,
    onCloseDetail: () => void setFilters({ team: null }),
    dialog,
    openDialog: setDialog,
    closeDialog: () => {
      setDialog(null)
    },
    onTeamDeleted: () => {
      setDialog(null)
      void setFilters({ team: null })
    },
    t,
  }
}
