// SPDX-License-Identifier: AGPL-3.0-only
'use client'

import { useTranslations } from 'next-intl'

import ChatListPanel from './ChatListPanel'

/** The 264px chat list beside the thread from the `lg` breakpoint up; below it `ChatListSheet` opens the same list. */
export default function ChatList() {
  const t = useTranslations('chat.list')
  return (
    <aside
      aria-label={t('label')}
      className="border-border bg-surface hidden w-66 shrink-0 flex-col border-r lg:flex"
    >
      <ChatListPanel />
    </aside>
  )
}
