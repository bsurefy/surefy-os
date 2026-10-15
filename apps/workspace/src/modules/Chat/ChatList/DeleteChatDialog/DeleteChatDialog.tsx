// SPDX-License-Identifier: AGPL-3.0-only
'use client'

import { useTranslations } from 'next-intl'

import { CHAT_RESTORE_WINDOW_DAYS } from '@surefy/contracts'
import { ConfirmDialog } from '@surefy/ui/components/Overlay'

import type { ChatActions } from '../ChatList.hooks'

/**
 * Deleting a chat shared with others (chat.md §1, T2): "3 people will lose access. You can
 * restore it for 30 days." Chats nobody else reads are deleted at once with Undo instead.
 */
export default function DeleteChatDialog({ actions }: Readonly<{ actions: ChatActions }>) {
  const t = useTranslations('chat.list.deleteShared')
  const tList = useTranslations('chat.list')
  const pending = actions.pendingDelete
  const title = pending && pending.chat.title !== '' ? pending.chat.title : tList('untitled')
  return (
    <ConfirmDialog
      open={pending !== null}
      onOpenChange={(open) => {
        if (!open) actions.onCancelDelete()
      }}
      tier="T2"
      title={t('title', { title })}
      description={t('description', {
        count: pending?.peopleWithAccess ?? 0,
        days: CHAT_RESTORE_WINDOW_DAYS,
      })}
      labels={{ confirm: t('confirm') }}
      onConfirm={actions.onConfirmDelete}
    />
  )
}
