// SPDX-License-Identifier: AGPL-3.0-only
import { useInfiniteQuery, useQuery } from '@tanstack/react-query'
import { useTranslations } from 'next-intl'

import { guardQueries } from '@/api/guard'
import { memberQueries } from '@/api/members'
import { teamQueries } from '@/api/teams'
import { useCurrentOrgId } from '@surefy/web-core/access'

import { APPROVER_LOOKUP_LIMIT, APPROVER_ROLES, TEAM_LOOKUP_LIMIT } from '../Guardrails.constants'

/** The teams a rule can be scoped to. */
export function useTeamOptions() {
  const orgId = useCurrentOrgId()
  const teams = useInfiniteQuery(teamQueries.list(orgId, { limit: TEAM_LOOKUP_LIMIT }))
  return {
    options: (teams.data?.pages.flatMap((page) => page.items) ?? []).map((team) => ({
      value: team.id,
      label: team.name,
    })),
    isLoading: teams.isPending,
  }
}

/**
 * The roles, teams and people that can be named as approvers. Builders may not read the member
 * list: the picker then offers roles and teams.
 */
export function useApproverOptions() {
  const t = useTranslations('guard.guardrails.sheet.approval')
  const orgId = useCurrentOrgId()
  const teams = useInfiniteQuery(teamQueries.list(orgId, { limit: APPROVER_LOOKUP_LIMIT }))
  const people = useInfiniteQuery(
    memberQueries.list(orgId, { status: 'active', limit: APPROVER_LOOKUP_LIMIT }),
  )
  const options = [
    ...APPROVER_ROLES.map((role) => ({
      value: `role:${role}`,
      label: t(`roles.${role}`),
      description: t('kindRole'),
    })),
    ...(teams.data?.pages.flatMap((page) => page.items) ?? []).map((team) => ({
      value: `team:${team.id}`,
      label: team.name,
      description: t('kindTeam'),
    })),
    ...(people.data?.pages.flatMap((page) => page.items) ?? []).map((member) => ({
      value: `user:${member.user.id}`,
      label: member.user.name,
      description: member.user.email,
    })),
  ]
  return { options, isLoading: teams.isPending || people.isPending }
}

/** The organization's currency, for the amounts of an action limit. */
export function useGuardCurrency(): string {
  const orgId = useCurrentOrgId()
  const { data } = useQuery(guardQueries.defaults(orgId))
  return data?.currency ?? 'USD'
}
