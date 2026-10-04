// SPDX-License-Identifier: AGPL-3.0-only
import { useTranslations } from 'next-intl'
import { useState } from 'react'

import { useBulkMemberActionMutation, useUpdateMemberMutation } from '@/api/members'
import type { OrgRole } from '@surefy/contracts'
import { toast } from '@surefy/ui/components/Feedback'
import { getErrorMessage } from '@surefy/web-core/errors'

import { getRoleChangeImpactKey, isPromotion } from '../MembersSettings.utils'

import type { ChangeRoleDialogProps } from './MemberDialogs.types'

/** One person's role changes through the member route, several through the bulk route. */
export function useChangeRoleController({
  orgId,
  members,
  currentRole,
  onClose,
}: ChangeRoleDialogProps) {
  const t = useTranslations('settings.members.changeRole')
  const tErrors = useTranslations('errors')
  const update = useUpdateMemberMutation(orgId, { silent: true })
  const bulk = useBulkMemberActionMutation(orgId, { silent: true })
  const isBulk = !Array.isArray(members)
  const person = Array.isArray(members) && members.length === 1 ? members[0] : undefined
  const from = currentRole ?? person?.role
  const [role, setRole] = useState<OrgRole>(from ?? 'user')

  const isChanged = from === undefined ? true : role !== from
  const mutation = isBulk ? bulk : update
  const impactKey = getRoleChangeImpactKey(from, role)
  const impact = impactKey ? t(impactKey, { role: t(`roles.${role}.name`) }) : null

  const onConfirm = () => {
    if (!isChanged) return
    if (Array.isArray(members)) {
      const [member] = members
      if (!member) return
      update.mutate(
        { memberId: member.id, role },
        {
          onSuccess: () => {
            toast.success(t('changed', { name: member.user.name, role: t(`roles.${role}.name`) }))
            onClose()
          },
        },
      )
      return
    }
    bulk.mutate(
      { action: 'change-role', memberIds: members.ids, role },
      {
        onSuccess: (result) => {
          toast.success(
            t('bulkChanged', { count: result.affected, skipped: result.skipped.length }),
          )
          onClose()
        },
      },
    )
  }

  return {
    role,
    onRoleChange: (value: string) => {
      setRole(value as OrgRole)
    },
    isChanged,
    isDemotion: from !== undefined && !isPromotion(from, role) && role !== from,
    isPending: mutation.isPending,
    errorMessage: mutation.error ? getErrorMessage(mutation.error, tErrors) : null,
    impact,
    title: Array.isArray(members)
      ? t('title', { name: members[0]?.user.name ?? '' })
      : t('bulkTitle', { count: members.count }),
    onConfirm,
  }
}
