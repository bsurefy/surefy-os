// SPDX-License-Identifier: AGPL-3.0-only
'use no memo'

import { Chat, useChat } from '@ai-sdk/react'
import { useQueryClient } from '@tanstack/react-query'
import { DefaultChatTransport } from 'ai'
import { useRouter } from 'next/navigation'
import { useState } from 'react'

import { chatKeys, chatStreamPath } from '@/api/chats'
import { usageKeys } from '@/api/usage'
import { ROUTES } from '@/constants/routes'
import { toRoute } from '@/modules/Workspace'
import type { ChatMessageDto, SendChatMessageInput } from '@surefy/contracts'
import { API_PREFIX } from '@surefy/web-core/http'

import { ACTIVITY_OF_STATUS, STOP_RECONCILE_MS } from '../ChatThread.constants'
import { getErrorCode, toUiMessage } from '../ChatThread.utils'

import type { AttachmentChip, ThreadActivity, ThreadUiMessage } from '../ChatThread.types'

/** The request body before defaults: what the transport sends as is. */
type SendBody = Record<string, unknown> & { trigger: SendChatMessageInput['trigger'] }

/** What the last request answered with when it failed before the first byte. */
class FailureBox {
  private failed = false

  clear() {
    this.failed = false
  }

  record() {
    this.failed = true
  }

  hasFailed() {
    return this.failed
  }
}

export interface ThreadStreamArgs {
  orgId: string
  orgSlug: string
  chatId: string
  isNew: boolean
  history: readonly ChatMessageDto[]
  /** Loads history again once an answer ended; null for a chat that does not exist yet. */
  refetchHistory: () => Promise<readonly ChatMessageDto[] | null>
  /** The settings a message is sent with. */
  modelKey: string | null
  newChat: Record<string, unknown>
  lastAnswerModelKey: string | null
}

/**
 * The live conversation: `useChat` over the SSE stream (services-api.md §7). Persisted history seeds
 * it and replaces it when an answer ends, so the thread always ends up showing what the server
 * stored. A new chat has no history yet: it moves to its own address when the first answer ended.
 */
export function useThreadStream({
  orgId,
  orgSlug,
  chatId,
  isNew,
  history,
  refetchHistory,
  modelKey,
  newChat,
  lastAnswerModelKey,
}: ThreadStreamArgs) {
  const queryClient = useQueryClient()
  const router = useRouter()
  const [failureCode, setFailureCode] = useState<string | null>(null)
  const [stoppedId, setStoppedId] = useState<string | null>(null)
  const [switchedFrom, setSwitchedFrom] = useState<{ from: string; to: string } | null>(null)

  // One chat instance per mounted thread: `useChat` would otherwise share the state of a chat id
  // across mounts, and coming back to a chat would show what an earlier visit left behind.
  const [session] = useState(() => {
    const failure = new FailureBox()
    const transport = new DefaultChatTransport<ThreadUiMessage>({
      // relative: same origin through the `/api` rewrite, and nothing to read while rendering on the server
      api: `${API_PREFIX}${chatStreamPath(orgId, chatId)}`,
      credentials: 'include',
      // the body is built per call, from the trigger (submit, regenerate, edit, continue)
      prepareSendMessagesRequest: ({ body }) => ({ body: body ?? {} }),
      fetch: async (input, init) => {
        failure.clear()
        setFailureCode(null)
        const response = await fetch(input, init)
        if (!response.ok) {
          const body = (await response
            .clone()
            .json()
            .catch(() => null)) as { error?: { code?: string } } | null
          failure.record()
          setFailureCode(body?.error?.code ?? null)
        }
        return response
      },
    })
    const instance = new Chat<ThreadUiMessage>({
      id: chatId,
      messages: history.map(toUiMessage),
      transport,
      onFinish: ({ isError, isAbort, messages }) => {
        void queryClient.invalidateQueries({ queryKey: chatKeys.lists(orgId) })
        void queryClient.invalidateQueries({ queryKey: usageKeys.all(orgId) })
        if (isNew) {
          // the chat exists once the server answered, even with an error it recorded
          if (!isError || failure.hasFailed()) {
            router.replace(toRoute(ROUTES.workspace.chat(orgSlug, chatId)))
          }
          return
        }
        // the server may have given the chat a title while answering
        void queryClient.invalidateQueries({ queryKey: chatKeys.detail(orgId, chatId) })
        const reconcile = () => {
          void refetchHistory().then((stored) => {
            if (stored) instance.messages = stored.map(toUiMessage)
            setSwitchedFrom(null)
            setStoppedId(null)
          })
        }
        if (!isAbort) {
          reconcile()
          return
        }
        // The server records the partial answer a moment after the request ended: the thread says
        // "Stopped" at once and picks the stored answer up shortly after.
        const last = messages.at(-1)
        setStoppedId(last?.role === 'assistant' ? last.id : null)
        setTimeout(reconcile, STOP_RECONCILE_MS)
      },
    })
    return instance
  })

  const chat = useChat<ThreadUiMessage>({ chat: session })

  const markSwitch = (to: string | null) => {
    setSwitchedFrom(
      lastAnswerModelKey && to && lastAnswerModelKey !== to
        ? { from: lastAnswerModelKey, to }
        : null,
    )
  }

  const send = (text: string, chips: AttachmentChip[]) => {
    markSwitch(modelKey)
    const body: SendBody = {
      trigger: 'submit',
      text,
      attachmentIds: chips.map((chip) => chip.id),
      ...(modelKey ? { modelKey } : {}),
      ...(isNew ? { newChat } : {}),
    }
    void chat.sendMessage({ text, metadata: { attachments: chips } }, { body })
  }

  return {
    live: chat.messages,
    stoppedId,
    activity: ACTIVITY_OF_STATUS[chat.status] satisfies ThreadActivity,
    errorCode: chat.status === 'error' ? (failureCode ?? getErrorCode(chat.error)) : null,
    switchedFrom,
    send,
    stop: () => {
      void chat.stop()
    },
    edit: (messageId: string, text: string) => {
      markSwitch(modelKey)
      const body: SendBody = {
        trigger: 'edit',
        messageId,
        text,
        attachmentIds: [],
        ...(modelKey ? { modelKey } : {}),
      }
      void chat.sendMessage({ text, messageId }, { body })
    },
    regenerate: (messageId: string) => {
      const body: SendBody = { trigger: 'regenerate', messageId, ...(modelKey ? { modelKey } : {}) }
      void chat.regenerate({ messageId, body })
    },
    continueAnswer: (messageId: string) => {
      const body: SendBody = { trigger: 'continue', messageId }
      void chat.sendMessage(undefined, { body })
    },
  }
}
export type ThreadStream = ReturnType<typeof useThreadStream>
