// SPDX-License-Identifier: AGPL-3.0-only
import { useInfiniteQuery, useQuery } from '@tanstack/react-query'
import { useParams } from 'next/navigation'
import { useQueryStates } from 'nuqs'
import { useState } from 'react'

import { chatQueries } from '@/api/chats'
import { CHAT_ERROR_CODES } from '@surefy/contracts'
import type { ChatMessageDto } from '@surefy/contracts'
import { useCurrentOrgId } from '@surefy/web-core/access'
import { isApiError } from '@surefy/web-core/errors'

import { APPROVAL_REFRESH_MS } from './ChatThread.constants'
import { chatThreadSearchParams } from './ChatThread.searchParams'
import { orderHistory } from './ChatThread.utils'

export type ChatThreadState = 'loading' | 'not-found' | 'error' | 'ready' | 'shared'

const isNotFound = (error: unknown) =>
  isApiError(error) && error.code === CHAT_ERROR_CODES.CHAT_NOT_FOUND

/**
 * The latest message is an agent answer the run has not finished: it waits for an approval, and
 * the stored answer changes once the run goes on.
 */
const waitsForRun = (pages: readonly { items: readonly ChatMessageDto[] }[] | undefined) => {
  const latest = pages?.[0]?.items[0]
  return latest?.role === 'assistant' && latest.status === 'streaming' && latest.agentRunId !== null
}

/**
 * Which chat the page shows and whether it can be shown: `/chat` is a new chat with an id made
 * here (`?agent=` makes it an agent chat), `/chat/<id>` loads the chat and its latest messages.
 * A chat someone shared with the person is not theirs: it opens view only. A deleted or unshared
 * chat is simply "not available", whatever the reason.
 */
export function useChatThreadController() {
  const params = useParams<{ orgSlug: string; chatId?: string }>()
  const orgId = useCurrentOrgId()
  const [newChatId] = useState(() => crypto.randomUUID())
  const isNew = params.chatId === undefined
  const chatId = params.chatId ?? newChatId

  const [{ agent: agentParam }, setThreadParams] = useQueryStates(chatThreadSearchParams)

  const chat = useQuery({
    ...chatQueries.detail(orgId, chatId),
    enabled: !isNew,
    retry: false,
  })
  // the owner's route does not know a chat shared with the person: it may be theirs to read
  const isOthers = isNotFound(chat.error)
  const shared = useQuery({
    ...chatQueries.sharedDetail(orgId, chatId),
    enabled: !isNew && isOthers,
    retry: false,
  })
  const messages = useInfiniteQuery({
    ...chatQueries.messages(orgId, chatId),
    enabled: !isNew,
    refetchInterval: (query) =>
      waitsForRun(query.state.data?.pages) ? APPROVAL_REFRESH_MS : false,
  })

  let state: ChatThreadState = 'ready'
  if (!isNew) {
    const chatError = isOthers ? shared.error : chat.error
    const error = chatError ?? messages.error
    if (isNotFound(error)) state = 'not-found'
    else if (error) state = 'error'
    else if (chat.isPending || (isOthers && shared.isPending) || messages.isPending) {
      state = 'loading'
    } else if (isOthers) state = 'shared'
  }

  return {
    state,
    orgId,
    orgSlug: params.orgSlug,
    chatId,
    isNew,
    chat: chat.data ?? null,
    shared: shared.data ?? null,
    /** The agent a new chat will talk to, from `?agent=`. */
    agentId: isNew ? agentParam : null,
    onAgentChange: (agentId: string | null) => {
      void setThreadParams({ agent: agentId })
    },
    history: messages.data ? orderHistory(messages.data.pages) : [],
    hasEarlier: messages.hasNextPage,
    isLoadingEarlier: messages.isFetchingNextPage,
    onLoadEarlier: () => void messages.fetchNextPage(),
    refetchHistory: async () => {
      if (isNew) return null
      const result = await messages.refetch()
      return result.data ? orderHistory(result.data.pages) : null
    },
    error: chat.error ?? messages.error,
    onRetry: () => {
      void chat.refetch()
      if (isOthers) void shared.refetch()
      void messages.refetch()
    },
  }
}
export type ChatThreadController = ReturnType<typeof useChatThreadController>
