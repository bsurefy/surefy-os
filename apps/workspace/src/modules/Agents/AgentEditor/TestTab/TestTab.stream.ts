// SPDX-License-Identifier: AGPL-3.0-only
'use no memo'

import { Chat, useChat } from '@ai-sdk/react'
import { DefaultChatTransport } from 'ai'
import { useState } from 'react'

import { runEventsPath, testRunStreamPath } from '@/api/agentRuns'
import { API_PREFIX } from '@surefy/web-core/http'

import { EMPTY_TRACE } from './TestTab.constants'
import { applyRunEvent, getActivity, startedTrace, toRunMessages } from './TestTab.utils'

import type { RunDataChunk, RunTrace, TestUiMessage } from './TestTab.types'

/** The run the stream follows; read when the transport reconnects, which happens outside of rendering. */
class RunIdBox {
  private runId: string | null = null

  get() {
    return this.runId
  }

  set(runId: string | null) {
    this.runId = runId
  }
}

/**
 * The sandbox conversation: `useChat` over the test-run stream (services-api.md §7). Each message
 * starts a run of the saved draft with the whole conversation; the run's data chunks build the
 * step trace. Closing the stream never cancels the run, so a run that waits for an approval, or one
 * started again by "Retry step", is followed by reconnecting to its event stream.
 */
export function useTestRunStream(orgId: string, agentId: string) {
  const [trace, setTrace] = useState<RunTrace>(EMPTY_TRACE)
  const [runId] = useState(() => new RunIdBox())

  const [session] = useState(
    () =>
      new Chat<TestUiMessage>({
        id: `agent-test-${agentId}`,
        transport: new DefaultChatTransport<TestUiMessage>({
          api: `${API_PREFIX}${testRunStreamPath(orgId, agentId)}`,
          credentials: 'include',
          prepareSendMessagesRequest: ({ messages }) => ({
            body: { messages: toRunMessages(messages) },
          }),
          prepareReconnectToStreamRequest: () => ({
            api: `${API_PREFIX}${runEventsPath(orgId, runId.get() ?? '')}`,
            credentials: 'include',
          }),
        }),
        onData: (part) => {
          const chunk = part as RunDataChunk
          if (chunk.type === 'data-run') {
            runId.set((chunk.data as { runId?: string }).runId ?? runId.get())
          }
          setTrace((current) => applyRunEvent(current, chunk))
        },
      }),
  )
  const chat = useChat<TestUiMessage>({ chat: session })

  const follow = (id: string) => {
    runId.set(id)
    setTrace(startedTrace(id))
    // the run answers again from its first step: the last answer, if any, is replaced
    if (chat.messages.at(-1)?.role === 'assistant') chat.setMessages(chat.messages.slice(0, -1))
    void chat.resumeStream()
  }

  return {
    messages: chat.messages,
    trace,
    activity: getActivity(chat.status),
    hasFailed: chat.status === 'error',
    send: (text: string) => {
      runId.set(null)
      setTrace(startedTrace())
      void chat.sendMessage({ text })
    },
    /** Follows a run that was started elsewhere (a retry), or the same run again after its stream ended. */
    follow,
    reconnect: () => {
      void chat.resumeStream()
    },
    stop: () => {
      void chat.stop()
    },
    clear: () => {
      runId.set(null)
      void chat.stop()
      chat.setMessages([])
      setTrace(EMPTY_TRACE)
    },
  }
}
export type TestRunStream = ReturnType<typeof useTestRunStream>
