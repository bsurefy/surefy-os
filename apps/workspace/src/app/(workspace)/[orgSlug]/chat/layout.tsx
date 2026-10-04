// SPDX-License-Identifier: AGPL-3.0-only
import { checkPageAccess } from '@/core/auth'
import { ChatList, ChatListSheet } from '@/modules/Chat'
import { assertNavReleased, NoAccessState } from '@/modules/Workspace'
import { PERMISSIONS } from '@surefy/contracts'

/** Every chat page: the chat list beside the thread (chat.md §1). */
export default async function ChatLayout({
  children,
  params,
}: Readonly<LayoutProps<'/[orgSlug]/chat'>>) {
  assertNavReleased('chat')
  const { orgSlug } = await params
  const { isAllowed } = await checkPageAccess(orgSlug, PERMISSIONS.CHAT_USE)
  if (!isAllowed) return <NoAccessState area="chat" />
  return (
    <div className="flex flex-col gap-4 lg:flex-row lg:gap-6">
      <ChatListSheet />
      <ChatList />
      <div className="min-w-0 flex-1">{children}</div>
    </div>
  )
}
