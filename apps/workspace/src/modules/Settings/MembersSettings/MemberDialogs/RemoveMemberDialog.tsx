// SPDX-License-Identifier: AGPL-3.0-only
'use client'

import { useInfiniteQuery } from '@tanstack/react-query'
import { useTranslations } from 'next-intl'
import { useState } from 'react'

import { memberQueries, useRemoveMemberMutation } from '@/api/members'
import type { MemberDto } from '@surefy/contracts'
import { toast } from '@surefy/ui/components/Feedback'
import { Field, SelectInput } from '@surefy/ui/components/Forms'
import { ConfirmDialog } from '@surefy/ui/components/Overlay'
import { getErrorMessage } from '@surefy/web-core/errors'

const ACTIVE_MEMBERS_LIMIT = 100

/**
 * Remove a person (T2): their agents and flows move to someone who stays, and their personal keys
 * are revoked. The person who takes over is chosen here, among the other active members.
 */
export default function RemoveMemberDialog({
  orgId,
  member,
  onClose,
}: Readonly<{ orgId: string; member: MemberDto; onClose: () => void }>) {
  const t = useTranslations('settings.members.remove')
  const tErrors = useTranslations('errors')
  const remove = useRemoveMemberMutation(orgId, { silent: true })
  const active = useInfiniteQuery(
    memberQueries.list(orgId, { status: 'active', limit: ACTIVE_MEMBERS_LIMIT }),
  )
  const [transferTo, setTransferTo] = useState<string | undefined>()
  const options = (active.data?.pages.flatMap((page) => page.items) ?? [])
    .filter((other) => other.id !== member.id)
    .map((other) => ({ value: other.user.id, label: other.user.name }))

  return (
    <ConfirmDialog
      open
      onOpenChange={(open) => {
        if (!open) onClose()
      }}
      tier="T2"
      tone="destructive"
      title={t('title', { name: member.user.name })}
      description={t('description')}
      impact={[
        t('impactKeys'),
        <Field key="transfer" label={t('transferTo')} description={t('transferHelp')}>
          <SelectInput
            options={options}
            value={transferTo}
            onValueChange={setTransferTo}
            placeholder={t('transferPlaceholder')}
          />
        </Field>,
      ]}
      labels={{ confirm: t('confirm') }}
      error={remove.error ? getErrorMessage(remove.error, tErrors) : undefined}
      onConfirm={async () => {
        await remove.mutateAsync({ memberId: member.id, transferToUserId: transferTo })
        toast.success(t('removed', { name: member.user.name }))
      }}
    />
  )
}
