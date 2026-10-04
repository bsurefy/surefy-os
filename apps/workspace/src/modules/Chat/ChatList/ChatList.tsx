// SPDX-License-Identifier: AGPL-3.0-only
'use client'

import { useTranslations } from 'next-intl'

import ChatListPanel from './ChatListPanel'

/** The chat list beside the thread from the `lg` breakpoint up; below it `ChatListSheet` opens the same list. */
export default function ChatList() {
  const t = useTranslations('chat.list')
  return (
    <aside
      aria-label={t('label')}
      className="border-border hidden w-70 shrink-0 flex-col gap-3 border-r pr-3 lg:flex"
    >
      <ChatListPanel />
    </aside>
  )
}
