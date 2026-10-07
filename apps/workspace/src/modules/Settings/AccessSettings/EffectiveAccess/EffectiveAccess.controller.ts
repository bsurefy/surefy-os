// SPDX-License-Identifier: AGPL-3.0-only
import { useInfiniteQuery, useQuery } from '@tanstack/react-query'
import { useParams } from 'next/navigation'
import { useTranslations } from 'next-intl'
import { useState } from 'react'

import { effectiveAccessQueries } from '@/api/access'
import { memberQueries } from '@/api/members'
import { teamQueries } from '@/api/teams'
import { ROUTES, SETTINGS_SECTION } from '@/constants/routes'
import type { AccessReasonDto } from '@surefy/contracts'
import { useCurrentOrgId } from '@surefy/web-core/access'
import { getErrorMessage, isApiError } from '@surefy/web-core/errors'

import { getReasonTarget } from '../AccessSettings.utils'
import { SUBJECT_KIND, SUBJECT_LOOKUP_LIMIT } from './EffectiveAccess.constants'

import type { SubjectKind } from './EffectiveAccess.constants'

/** "Effective access": pick a person or a team and read what they can use, and why. */
export function useEffectiveAccessController() {
  const t = useTranslations('settings.access.effective')
  const tErrors = useTranslations('errors')
  const orgId = useCurrentOrgId()
  const { orgSlug } = useParams<{ orgSlug: string }>()
  const [kind, setKind] = useState<SubjectKind>(SUBJECT_KIND.PERSON)
  const [subjectId, setSubjectId] = useState<string | null>(null)

  const people = useInfiniteQuery(
    memberQueries.list(orgId, { status: 'active', limit: SUBJECT_LOOKUP_LIMIT }),
  )
  const teams = useInfiniteQuery(teamQueries.list(orgId, { limit: SUBJECT_LOOKUP_LIMIT }))
  const isPerson = kind === SUBJECT_KIND.PERSON
  const personAccess = useQuery({
    ...effectiveAccessQueries.member(orgId, subjectId ?? ''),
    enabled: isPerson && subjectId !== null,
  })
  const teamAccess = useQuery({
    ...effectiveAccessQueries.team(orgId, subjectId ?? ''),
    enabled: !isPerson && subjectId !== null,
  })
  const active = isPerson ? personAccess : teamAccess

  const options = isPerson
    ? (people.data?.pages.flatMap((page) => page.items) ?? []).map((member) => ({
        value: member.user.id,
        label: member.user.name,
        description: member.user.email,
      }))
    : (teams.data?.pages.flatMap((page) => page.items) ?? []).map((team) => ({
        value: team.id,
        label: team.name,
      }))

  return {
    kind,
    onKindChange: (next: SubjectKind) => {
      setKind(next)
      setSubjectId(null)
    },
    subjectId,
    onSubjectChange: setSubjectId,
    options,
    access: active.data,
    isLoading: subjectId !== null && active.isPending,
    errorMessage: active.error ? getErrorMessage(active.error, tErrors) : null,
    errorReference: isApiError(active.error) ? active.error.requestId : undefined,
    refetch: () => void active.refetch(),
    /** Where the reason can be changed, as a path; null when it cannot. */
    getReasonHref: (reason: AccessReasonDto) => {
      const target = getReasonTarget(reason)
      if (!target) return null
      return target.section === 'members'
        ? ROUTES.workspace.settings(orgSlug, SETTINGS_SECTION.MEMBERS)
        : `${ROUTES.workspace.settings(orgSlug, SETTINGS_SECTION.TEAMS)}?team=${target.teamId}`
    },
    t,
  }
}
