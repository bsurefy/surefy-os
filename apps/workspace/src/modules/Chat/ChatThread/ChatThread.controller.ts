// SPDX-License-Identifier: AGPL-3.0-only
import { useInfiniteQuery, useQuery } from '@tanstack/react-query'
import { useParams } from 'next/navigation'
import { useState } from 'react'

import { chatQueries } from '@/api/chats'
import { CHAT_ERROR_CODES } from '@surefy/contracts'
import { useCurrentOrgId } from '@surefy/web-core/access'
import { isApiError } from '@surefy/web-core/errors'

import { orderHistory } from './ChatThread.utils'

export type ChatThreadState = 'loading' | 'not-found' | 'error' | 'ready'

/**
 * Which chat the page shows and whether it can be shown: `/chat` is a new chat with an id made
 * here, `/chat/<id>` loads the chat and its latest messages. A deleted or unshared chat is simply
 * "not available", whatever the reason.
 */
export function useChatThreadController() {
  const params = useParams<{ orgSlug: string; chatId?: string }>()
  const orgId = useCurrentOrgId()
  const [newChatId] = useState(() => crypto.randomUUID())
  const isNew = params.chatId === undefined
  const chatId = params.chatId ?? newChatId

  const chat = useQuery({
    ...chatQueries.detail(orgId, chatId),
    enabled: !isNew,
    retry: false,
  })
  const messages = useInfiniteQuery({ ...chatQueries.messages(orgId, chatId), enabled: !isNew })

  let state: ChatThreadState = 'ready'
  if (!isNew) {
    const error = chat.error ?? messages.error
    if (isApiError(error) && error.code === CHAT_ERROR_CODES.CHAT_NOT_FOUND) state = 'not-found'
    else if (error) state = 'error'
    else if (chat.isPending || messages.isPending) state = 'loading'
  }

  return {
    state,
    orgId,
    orgSlug: params.orgSlug,
    chatId,
    isNew,
    chat: chat.data ?? null,
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
      void messages.refetch()
    },
  }
}
export type ChatThreadController = ReturnType<typeof useChatThreadController>
