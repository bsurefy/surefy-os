// SPDX-License-Identifier: AGPL-3.0-only
'use client'

import { useTranslations } from 'next-intl'

import {
  useBulkMemberActionMutation,
  useDeactivateMemberMutation,
  useRevokeInvitationMutation,
} from '@/api/members'
import type { InvitationDto, MemberDto } from '@surefy/contracts'
import { toast } from '@surefy/ui/components/Feedback'
import { ConfirmDialog } from '@surefy/ui/components/Overlay'
import { getErrorMessage } from '@surefy/web-core/errors'

interface BaseProps {
  orgId: string
  onClose: () => void
}

function useCloseOnDismiss(onClose: () => void) {
  return (open: boolean) => {
    if (!open) onClose()
  }
}

/** Deactivate one person (T2): they cannot sign in until reactivated. */
export function DeactivateMemberDialog({
  orgId,
  member,
  onClose,
}: Readonly<BaseProps & { member: MemberDto }>) {
  const t = useTranslations('settings.members.deactivate')
  const tErrors = useTranslations('errors')
  const deactivate = useDeactivateMemberMutation(orgId, { silent: true })
  return (
    <ConfirmDialog
      open
      onOpenChange={useCloseOnDismiss(onClose)}
      tier="T2"
      tone="destructive"
      title={t('title', { name: member.user.name })}
      description={t('description')}
      impact={[t('impact')]}
      labels={{ confirm: t('confirm') }}
      error={deactivate.error ? getErrorMessage(deactivate.error, tErrors) : undefined}
      onConfirm={async () => {
        await deactivate.mutateAsync(member.id)
        toast.success(t('done', { name: member.user.name }))
      }}
    />
  )
}

/** Deactivate the selected people (T2); the ones that cannot be changed are reported. */
export function BulkDeactivateDialog({
  orgId,
  memberIds,
  onClose,
}: Readonly<BaseProps & { memberIds: string[] }>) {
  const t = useTranslations('settings.members')
  const tErrors = useTranslations('errors')
  const bulk = useBulkMemberActionMutation(orgId, { silent: true })
  return (
    <ConfirmDialog
      open
      onOpenChange={useCloseOnDismiss(onClose)}
      tier="T2"
      tone="destructive"
      title={t('bulkDeactivate.title', { count: memberIds.length })}
      description={t('deactivate.description')}
      impact={[t('deactivate.impact')]}
      labels={{ confirm: t('bulkDeactivate.confirm') }}
      error={bulk.error ? getErrorMessage(bulk.error, tErrors) : undefined}
      onConfirm={async () => {
        const result = await bulk.mutateAsync({ action: 'deactivate', memberIds })
        toast.success(
          t('bulkDeactivate.done', { count: result.affected, skipped: result.skipped.length }),
        )
      }}
    />
  )
}

/** Revoke a pending invitation (T2): its link stops working. */
export function RevokeInvitationDialog({
  orgId,
  invitation,
  onClose,
}: Readonly<BaseProps & { invitation: InvitationDto }>) {
  const t = useTranslations('settings.members.revoke')
  const tErrors = useTranslations('errors')
  const revoke = useRevokeInvitationMutation(orgId, { silent: true })
  return (
    <ConfirmDialog
      open
      onOpenChange={useCloseOnDismiss(onClose)}
      tier="T2"
      tone="destructive"
      title={t('title', { email: invitation.email })}
      description={t('description')}
      labels={{ confirm: t('confirm') }}
      error={revoke.error ? getErrorMessage(revoke.error, tErrors) : undefined}
      onConfirm={async () => {
        await revoke.mutateAsync(invitation.id)
      }}
    />
  )
}
