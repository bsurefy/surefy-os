// SPDX-License-Identifier: AGPL-3.0-only
import { getTranslations } from 'next-intl/server'

import { checkPageAccess } from '@/core/auth'
import { ChatThread } from '@/modules/Chat'
import { assertNavReleased, NoAccessState } from '@/modules/Workspace'
import { PERMISSIONS } from '@surefy/contracts'

import type { Metadata } from 'next'

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations('chat.thread')
  return { title: t('title') }
}

/** One chat. */
export default async function ChatThreadPage({
  params,
}: Readonly<PageProps<'/[orgSlug]/chat/[chatId]'>>) {
  assertNavReleased('chat')
  const { orgSlug } = await params
  const { isAllowed } = await checkPageAccess(orgSlug, PERMISSIONS.CHAT_USE)
  if (!isAllowed) return <NoAccessState area="chat" />
  return <ChatThread />
}
