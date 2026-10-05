// SPDX-License-Identifier: AGPL-3.0-only
import { useInfiniteQuery, useQuery } from '@tanstack/react-query'
import { useTranslations } from 'next-intl'
import { useState } from 'react'

import { knowledgeQueries, useSetKnowledgeAccessMutation } from '@/api/knowledge'
import { memberQueries } from '@/api/members'
import { PERMISSIONS } from '@surefy/contracts'
import type {
  KnowledgeAccessGrantDto,
  KnowledgeAccessGrantInput,
  KnowledgeAccessLevel,
  KnowledgeBaseDto,
  TeamRefDto,
} from '@surefy/contracts'
import { useCan, useCurrentOrgId } from '@surefy/web-core/access'
import { getErrorMessage, isApiError } from '@surefy/web-core/errors'

import { PEOPLE_LOOKUP_LIMIT } from '../Knowledge.constants'
import { useTeamOptions } from '../Knowledge.hooks'

/** "No access" is the absence of a grant, so it is a level of the select but never sent. */
export type TeamLevel = KnowledgeAccessLevel | 'none'

function toInput(grant: KnowledgeAccessGrantDto): KnowledgeAccessGrantInput[] {
  if (grant.subjectType === 'team' && grant.team) {
    return [{ subjectType: 'team', teamId: grant.team.id, level: grant.level }]
  }
  if (grant.subjectType === 'user' && grant.user) {
    return [{ subjectType: 'user', userId: grant.user.id, level: grant.level }]
  }
  return []
}

/** Access: who may search or manage the base. Rows only grant; "No access" removes the row. */
export function useAccessTabController(base: KnowledgeBaseDto) {
  const t = useTranslations('knowledge.detail.access')
  const tErrors = useTranslations('errors')
  const orgId = useCurrentOrgId()
  const canReadAudit = useCan(PERMISSIONS.AUDIT_READ)
  const access = useQuery(knowledgeQueries.access(orgId, base.id))
  const save = useSetKnowledgeAccessMutation(orgId, base.id)
  const { teams } = useTeamOptions()
  const people = useInfiniteQuery(
    memberQueries.list(orgId, { status: 'active', limit: PEOPLE_LOOKUP_LIMIT }),
  )
  const [removingTeam, setRemovingTeam] = useState<TeamRefDto | null>(null)
  const [personToAdd, setPersonToAdd] = useState('')
  const [levelToAdd, setLevelToAdd] = useState<KnowledgeAccessLevel>('search')

  const grants = access.data?.grants ?? []
  const teamGrants = grants.filter(({ subjectType }) => subjectType === 'team')
  const personGrants = grants.filter(({ subjectType }) => subjectType === 'user')
  const current = grants.flatMap(toInput)
  const members = people.data?.pages.flatMap((page) => page.items) ?? []
  const granted = new Set(personGrants.map(({ user }) => user?.id))

  const levelOf = (teamId: string): TeamLevel =>
    teamGrants.find((grant) => grant.team?.id === teamId)?.level ?? 'none'
  const saveGrants = (next: KnowledgeAccessGrantInput[]) => save.mutateAsync({ grants: next })
  const withoutTeam = (teamId: string) =>
    current.filter((grant) => !(grant.subjectType === 'team' && grant.teamId === teamId))

  return {
    t,
    orgId,
    canReadAudit,
    isLoading: access.isPending,
    errorMessage: access.error ? getErrorMessage(access.error, tErrors) : null,
    errorReference: isApiError(access.error) ? access.error.requestId : undefined,
    refetch: () => void access.refetch(),
    isLocalOnly: access.data?.isLocalOnly ?? base.isLocalOnly,
    blockedAgents: access.data?.blockedAgents ?? [],
    teams: teams.map((team) => ({
      team,
      level: levelOf(team.id),
    })),
    personGrants,
    memberOptions: members
      .filter((member) => !granted.has(member.user.id))
      .map((member) => ({
        value: member.user.id,
        label: member.user.name,
        description: member.user.email,
      })),
    isSaving: save.isPending,
    onTeamLevelChange: (team: TeamRefDto, level: TeamLevel) => {
      if (level === 'none') {
        setRemovingTeam(team)
        return
      }
      void saveGrants([...withoutTeam(team.id), { subjectType: 'team', teamId: team.id, level }])
    },
    removingTeam,
    onCloseRemoveTeam: () => {
      setRemovingTeam(null)
    },
    onRemoveTeamAccess: async (teamId: string) => {
      await saveGrants(withoutTeam(teamId))
      setRemovingTeam(null)
    },
    onPersonLevelChange: (userId: string, level: KnowledgeAccessLevel) => {
      void saveGrants([
        ...current.filter((grant) => !(grant.subjectType === 'user' && grant.userId === userId)),
        { subjectType: 'user', userId, level },
      ])
    },
    onRemovePerson: (userId: string) => {
      void saveGrants(
        current.filter((grant) => !(grant.subjectType === 'user' && grant.userId === userId)),
      )
    },
    personToAdd,
    onPersonToAddChange: (value: string | null) => {
      setPersonToAdd(value ?? '')
    },
    levelToAdd,
    onLevelToAddChange: setLevelToAdd,
    onAddPerson: async () => {
      if (!personToAdd) return
      await saveGrants([
        ...current,
        { subjectType: 'user', userId: personToAdd, level: levelToAdd },
      ])
      setPersonToAdd('')
    },
  }
}
