// SPDX-License-Identifier: AGPL-3.0-only
import { checkPageAccess } from '@/core/auth'
import { ChatList, ChatListSheet } from '@/modules/Chat'
import { assertNavReleased, NoAccessState, PageLayout } from '@/modules/Workspace'
import { PERMISSIONS } from '@surefy/contracts'

/** Every chat page: the chat list beside the thread, filling the frame below the top bar (chat.md §1). */
export default async function ChatLayout({
  children,
  params,
}: Readonly<LayoutProps<'/[orgSlug]/chat'>>) {
  assertNavReleased('chat')
  const { orgSlug } = await params
  const { isAllowed } = await checkPageAccess(orgSlug, PERMISSIONS.CHAT_USE)
  if (!isAllowed) return <NoAccessState area="chat" />
  return (
    <>
      <PageLayout width="flush" />
      <div className="flex min-h-0 flex-1">
        <ChatList />
        <div className="flex min-w-0 flex-1 flex-col">
          <ChatListSheet />
          {children}
        </div>
      </div>
    </>
  )
}
