// SPDX-License-Identifier: AGPL-3.0-only
'use client'

import { useId } from 'react'

import type { ChatDto } from '@surefy/contracts'

import ChatRow from '../ChatRow'

import type { ChatRowContext } from '../ChatRow'

/** A titled run of chats: Pinned, "Today", "Previous 7 days"… */
export default function ChatGroup({
  heading,
  chats,
  ctx,
}: Readonly<{ heading: string; chats: readonly ChatDto[]; ctx: ChatRowContext }>) {
  const headingId = useId()
  return (
    <section aria-labelledby={headingId} className="flex flex-col gap-0.5">
      <h3 id={headingId} className="text-caption text-muted-foreground px-2 pb-1 font-medium">
        {heading}
      </h3>
      <ul className="flex flex-col gap-0.5">
        {chats.map((chat) => (
          <ChatRow key={chat.id} chat={chat} ctx={ctx} />
        ))}
      </ul>
    </section>
  )
}
