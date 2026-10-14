// SPDX-License-Identifier: AGPL-3.0-only
import { useInfiniteQuery } from '@tanstack/react-query'
import { useTranslations } from 'next-intl'
import { useEffect, useState } from 'react'

import { useTestDataFilterMutation } from '@/api/guard'
import { teamQueries } from '@/api/teams'
import { useDebouncedValue } from '@/hooks'
import { useCurrentOrgId } from '@surefy/web-core/access'
import { getErrorMessage } from '@surefy/web-core/errors'

import { TEAM_LOOKUP_LIMIT, TRY_IT_DEBOUNCE_MS } from '../DataFilters.constants'

/**
 * "Try it": runs the organization's filters (or a team's) over a sample text as the person types,
 * and again when a type's action changes (`version`). Nothing is saved or sent anywhere.
 */
export function useTryItController(version: string) {
  const t = useTranslations('guard.dataFilters.tryIt')
  const tErrors = useTranslations('errors')
  const orgId = useCurrentOrgId()
  const teams = useInfiniteQuery(teamQueries.list(orgId, { limit: TEAM_LOOKUP_LIMIT }))
  const [text, setText] = useState(t('sample'))
  const [teamId, setTeamId] = useState<string | null>(null)
  const settled = useDebouncedValue({ text, teamId }, TRY_IT_DEBOUNCE_MS)
  const { mutate, reset, data, error, isPending } = useTestDataFilterMutation(orgId)

  useEffect(() => {
    if (settled.text.trim() === '') {
      reset()
      return
    }
    mutate({ text: settled.text, ...(settled.teamId ? { teamId: settled.teamId } : {}) })
  }, [settled, version, mutate, reset])

  return {
    t,
    text,
    onTextChange: setText,
    teamId,
    onTeamChange: setTeamId,
    teamOptions: (teams.data?.pages.flatMap((page) => page.items) ?? []).map((team) => ({
      value: team.id,
      label: team.name,
    })),
    result: data,
    isRunning: isPending,
    isEmpty: text.trim() === '',
    errorMessage: error ? getErrorMessage(error, tErrors) : null,
    retry: () => {
      mutate({ text: settled.text, ...(settled.teamId ? { teamId: settled.teamId } : {}) })
    },
  }
}
