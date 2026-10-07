// SPDX-License-Identifier: AGPL-3.0-only
import { useInfiniteQuery } from '@tanstack/react-query'

import { teamQueries } from '@/api/teams'
import { useCurrentOrgId } from '@surefy/web-core/access'

import { PEOPLE_LOOKUP_LIMIT } from './Knowledge.constants'

/** The organization's teams for pickers and name lookups (the first page; a person has few). */
export function useTeamOptions() {
  const orgId = useCurrentOrgId()
  const teams = useInfiniteQuery(teamQueries.list(orgId, { limit: PEOPLE_LOOKUP_LIMIT }))
  const items = teams.data?.pages.flatMap((page) => page.items) ?? []
  return {
    teams: items,
    options: items.map((team) => ({ value: team.id, label: team.name })),
  }
}
