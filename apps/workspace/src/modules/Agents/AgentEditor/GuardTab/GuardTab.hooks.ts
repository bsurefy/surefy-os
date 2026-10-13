// SPDX-License-Identifier: AGPL-3.0-only
import { useInfiniteQuery } from '@tanstack/react-query'
import { useTranslations } from 'next-intl'

import { memberQueries } from '@/api/members'
import { teamQueries } from '@/api/teams'
import type { Approver } from '@surefy/contracts'
import { useCurrentOrgId } from '@surefy/web-core/access'

import { APPROVER_LOOKUP_LIMIT, APPROVER_ROLES } from './GuardTab.constants'
import { toApproverKey } from './GuardTab.utils'

/**
 * The people, teams and roles that can be named as approvers, for the picker and for reading a
 * rule back ("Admins and Owners, Support"). Builders may not read the member list: the picker then
 * offers roles and teams.
 */
export function useApproverDirectory() {
  const t = useTranslations('agents.editor.guard.approvers')
  const orgId = useCurrentOrgId()
  const teams = useInfiniteQuery(teamQueries.list(orgId, { limit: APPROVER_LOOKUP_LIMIT }))
  const people = useInfiniteQuery(
    memberQueries.list(orgId, { status: 'active', limit: APPROVER_LOOKUP_LIMIT }),
  )

  const options = [
    ...APPROVER_ROLES.map((role) => ({
      value: `role:${role}`,
      label: t(`roles.${role}`),
      description: t('role'),
    })),
    ...(teams.data?.pages.flatMap((page) => page.items) ?? []).map((team) => ({
      value: `team:${team.id}`,
      label: team.name,
      description: t('team'),
    })),
    ...(people.data?.pages.flatMap((page) => page.items) ?? []).map((member) => ({
      value: `user:${member.user.id}`,
      label: member.user.name,
      description: member.user.email,
    })),
  ]

  const labelOf = (approver: Approver): string => {
    const key = toApproverKey(approver)
    const found = options.find((option) => option.value === key)
    if (found) return found.label
    return approver.type === 'team' ? t('unknownTeam') : t('unknownPerson')
  }

  return { options, labelOf, isLoading: teams.isPending || people.isPending }
}
