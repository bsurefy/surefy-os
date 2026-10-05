// SPDX-License-Identifier: AGPL-3.0-only
import { useInfiniteQuery, useQuery } from '@tanstack/react-query'
import { useTranslations } from 'next-intl'
import { useState } from 'react'

import { memberQueries, useUpdateMemberMutation } from '@/api/members'
import {
  teamQueries,
  useAddTeamMembersMutation,
  useRemoveTeamMemberMutation,
  useUpdateTeamMutation,
} from '@/api/teams'
import { toast } from '@surefy/ui/components/Feedback'
import { getErrorMessage, isApiError } from '@surefy/web-core/errors'

import { PEOPLE_LOOKUP_LIMIT } from '../TeamsSettings.constants'

const NO_LEAD = 'none'

/** One team: its members (with the primary-team badge), lead, and who can be added. */
export function useTeamDetailController(orgId: string, teamId: string) {
  const t = useTranslations('settings.teams.detail')
  const tErrors = useTranslations('errors')
  const team = useQuery(teamQueries.detail(orgId, teamId))
  const members = useInfiniteQuery(
    teamQueries.members(orgId, teamId, { limit: PEOPLE_LOOKUP_LIMIT }),
  )
  // The team's member list names people by user; changing a primary team needs the member's id
  const everyone = useInfiniteQuery(
    memberQueries.list(orgId, { status: 'active', limit: PEOPLE_LOOKUP_LIMIT }),
  )
  const updateTeam = useUpdateTeamMutation(orgId)
  const updateMember = useUpdateMemberMutation(orgId)
  const addMembers = useAddTeamMembersMutation(orgId, teamId)
  const removeMember = useRemoveTeamMemberMutation(orgId, teamId)
  const [toAdd, setToAdd] = useState<string[]>([])

  const teamMembers = members.data?.pages.flatMap((page) => page.items) ?? []
  const people = everyone.data?.pages.flatMap((page) => page.items) ?? []
  const memberIdOf = (userId: string) => people.find((person) => person.user.id === userId)?.id
  const inTeam = new Set(teamMembers.map((member) => member.user.id))
  const error = team.error ?? members.error

  return {
    team: team.data,
    members: teamMembers,
    isLoading: team.isPending || members.isPending,
    errorMessage: error ? getErrorMessage(error, tErrors) : null,
    errorReference: isApiError(error) ? error.requestId : undefined,
    refetch: () => {
      void team.refetch()
      void members.refetch()
    },
    leadOptions: [
      { value: NO_LEAD, label: t('noLead') },
      ...teamMembers.map((member) => ({ value: member.user.id, label: member.user.name })),
    ],
    leadValue: team.data?.leadUserId ?? NO_LEAD,
    onLeadChange: (value: string) => {
      updateTeam.mutate(
        { teamId, leadUserId: value === NO_LEAD ? null : value },
        { onSuccess: () => toast.success(t('leadSaved')) },
      )
    },
    addOptions: people
      .filter((person) => !inTeam.has(person.user.id))
      .map((person) => ({
        value: person.user.id,
        label: person.user.name,
        description: person.user.email,
      })),
    toAdd,
    onToAddChange: setToAdd,
    isAdding: addMembers.isPending,
    onAdd: () => {
      addMembers.mutate(
        { userIds: toAdd },
        {
          onSuccess: (result) => {
            setToAdd([])
            toast.success(t('added', { count: result.added }))
          },
        },
      )
    },
    canMakePrimary: (userId: string, isPrimary: boolean) =>
      !isPrimary && memberIdOf(userId) !== undefined,
    onMakePrimary: (userId: string, name: string) => {
      const memberId = memberIdOf(userId)
      if (!memberId) return
      updateMember.mutate(
        { memberId, primaryTeamId: teamId },
        { onSuccess: () => toast.success(t('primarySaved', { name })) },
      )
    },
    onRemove: (userId: string, name: string) => {
      removeMember.mutate(userId, { onSuccess: () => toast.success(t('removed', { name })) })
    },
    t,
  }
}
