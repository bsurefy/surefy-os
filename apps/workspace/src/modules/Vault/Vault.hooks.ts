// SPDX-License-Identifier: AGPL-3.0-only
import { useInfiniteQuery } from '@tanstack/react-query'
import { useState } from 'react'

import { memberQueries } from '@/api/members'
import { teamQueries } from '@/api/teams'
import { useCurrentOrgId } from '@surefy/web-core/access'

import { PEOPLE_LOOKUP_LIMIT } from './Vault.constants'

/** The current time, read once per mount so a render never calls `Date.now()` twice. */
export function useNow(): number {
  const [now] = useState(() => Date.now())
  return now
}

/** The organization's teams and people, as the team and person pickers need them. */
export function useAccessSubjects() {
  const orgId = useCurrentOrgId()
  const teams = useInfiniteQuery(teamQueries.list(orgId, { limit: PEOPLE_LOOKUP_LIMIT }))
  const people = useInfiniteQuery(
    memberQueries.list(orgId, { status: 'active', limit: PEOPLE_LOOKUP_LIMIT }),
  )
  return {
    teams: teams.data?.pages.flatMap((page) => page.items) ?? [],
    people: people.data?.pages.flatMap((page) => page.items) ?? [],
    isLoading: teams.isPending || people.isPending,
  }
}
