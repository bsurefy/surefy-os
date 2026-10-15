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

/** What a finished request tells; the AI SDK passes more, this is what the thread reads. */
interface FinishInfo {
  isError: boolean
  isAbort: boolean
  messages: ThreadUiMessage[]
}

/** The state of a message sent with Compare on: answer B starts once the server knows the message. */
interface CompareRun {
  /** Answer B's model and web search flag, until its request was sent. */
  pending: { modelKey: string; webSearch: boolean } | null
  /** Answer B's request is open. */
  isRunning: boolean
  /** Answer A ended first: its finish waits for answer B so the chat moves and reloads once. */
  deferred: FinishInfo | null
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
  /** The composer's web search toggle: asked for with every answer while on. */
  webSearch: boolean
  /** Answer B's model while Compare is on; null sends a plain message. */
  compareModelKey: string | null
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
  webSearch,
  compareModelKey,
}: ThreadStreamArgs) {
  const queryClient = useQueryClient()
  const router = useRouter()
  const [failureCode, setFailureCode] = useState<string | null>(null)
  const [compareFailureCode, setCompareFailureCode] = useState<string | null>(null)
  const [stoppedId, setStoppedId] = useState<string | null>(null)
  const [switchedFrom, setSwitchedFrom] = useState<{ from: string; to: string } | null>(null)

  // One chat instance per mounted thread: `useChat` would otherwise share the state of a chat id
  // across mounts, and coming back to a chat would show what an earlier visit left behind. A
  // second instance holds answer B of a comparison, so both answers can stream at once.
  const [session] = useState(() => {
    const failure = new FailureBox()
    const compareFailure = new FailureBox()
    const run: CompareRun = { pending: null, isRunning: false, deferred: null }
    const makeTransport = (box: FailureBox, onCode: (code: string | null) => void) =>
      new DefaultChatTransport<ThreadUiMessage>({
        // relative: same origin through the `/api` rewrite, and nothing to read while rendering on the server
        api: `${API_PREFIX}${chatStreamPath(orgId, chatId)}`,
        credentials: 'include',
        // the body is built per call, from the trigger (submit, regenerate, edit, continue, compare)
        prepareSendMessagesRequest: ({ body }) => ({ body: body ?? {} }),
        fetch: async (input, init) => {
          box.clear()
          onCode(null)
          const response = await fetch(input, init)
          if (!response.ok) {
            const body = (await response
              .clone()
              .json()
              .catch(() => null)) as { error?: { code?: string } } | null
            box.record()
            onCode(body?.error?.code ?? null)
          }
          return response
        },
      })
    const instance = new Chat<ThreadUiMessage>({
      id: chatId,
      messages: history.map(toUiMessage),
      transport: makeTransport(failure, setFailureCode),
      onData: (part) => {
        // the server knows the message now: answer B can ask for it
        if (part.type === 'data-message' && run.pending && part.data.userMessageId) {
          const { modelKey: compareKey, webSearch: wantsSearch } = run.pending
          run.pending = null
          run.isRunning = true
          comparison.messages = []
          void comparison.sendMessage(undefined, {
            body: {
              trigger: 'compare',
              messageId: part.data.userMessageId,
              modelKey: compareKey,
              ...(wantsSearch ? { webSearch: true } : {}),
            },
          })
        }
      },
      onFinish: (info) => {
        run.pending = null
        if (run.isRunning) {
          run.deferred = info
          return
        }
        finish(info)
      },
    })
    const comparison = new Chat<ThreadUiMessage>({
      id: `${chatId}-compare`,
      transport: makeTransport(compareFailure, setCompareFailureCode),
      onFinish: () => {
        run.isRunning = false
        if (run.deferred) {
          const deferred = run.deferred
          run.deferred = null
          finish(deferred)
        }
      },
    })
    function finish({ isError, isAbort, messages }: FinishInfo) {
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
          comparison.messages = []
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
    }
    return {
      instance,
      comparison,
      /** Answer B is asked for once the server knows the message that is sent next. */
      armCompare: (pending: CompareRun['pending']) => {
        run.pending = pending
      },
      /** Replaces the live messages with what the server stored. */
      load: (stored: readonly ChatMessageDto[]) => {
        instance.messages = stored.map(toUiMessage)
      },
    }
  })

  const chat = useChat<ThreadUiMessage>({ chat: session.instance })
  const compareChat = useChat<ThreadUiMessage>({ chat: session.comparison })

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
      ...(webSearch ? { webSearch: true } : {}),
      ...(isNew ? { newChat } : {}),
    }
    session.armCompare(compareModelKey ? { modelKey: compareModelKey, webSearch } : null)
    void chat.sendMessage({ text, metadata: { attachments: chips } }, { body })
  }

  const answerB = compareChat.messages.findLast((message) => message.role === 'assistant')
  const isCompareBusy = compareChat.status === 'submitted' || compareChat.status === 'streaming'
  const activities = [chat.status, compareChat.status].map((status) => ACTIVITY_OF_STATUS[status])
  let activity: ThreadActivity = 'idle'
  if (activities.includes('streaming')) activity = 'streaming'
  else if (activities.includes('submitted')) activity = 'submitted'

  return {
    live: chat.messages,
    /** The main request is open (answer B may still be streaming after it ends). */
    isLiveBusy: ACTIVITY_OF_STATUS[chat.status] !== 'idle',
    stoppedId,
    activity,
    /** Answer B of the comparison in flight, once it started. */
    comparison: {
      message: answerB,
      isStreaming: isCompareBusy,
      errorCode:
        compareChat.status === 'error'
          ? (compareFailureCode ?? getErrorCode(compareChat.error))
          : null,
    },
    errorCode: chat.status === 'error' ? (failureCode ?? getErrorCode(chat.error)) : null,
    switchedFrom,
    send,
    /** Loads the stored messages again, for example after one answer of a comparison was chosen. */
    syncHistory: async () => {
      const stored = await refetchHistory()
      if (stored) session.load(stored)
    },
    stop: () => {
      void chat.stop()
      void compareChat.stop()
    },
    edit: (messageId: string, text: string) => {
      markSwitch(modelKey)
      const body: SendBody = {
        trigger: 'edit',
        messageId,
        text,
        attachmentIds: [],
        ...(modelKey ? { modelKey } : {}),
        ...(webSearch ? { webSearch: true } : {}),
      }
      void chat.sendMessage({ text, messageId }, { body })
    },
    regenerate: (messageId: string) => {
      const body: SendBody = {
        trigger: 'regenerate',
        messageId,
        ...(modelKey ? { modelKey } : {}),
        ...(webSearch ? { webSearch: true } : {}),
      }
      void chat.regenerate({ messageId, body })
    },
    continueAnswer: (messageId: string) => {
      const body: SendBody = { trigger: 'continue', messageId }
      void chat.sendMessage(undefined, { body })
    },
  }
}
export type ThreadStream = ReturnType<typeof useThreadStream>
