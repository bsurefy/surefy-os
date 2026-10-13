// SPDX-License-Identifier: AGPL-3.0-only
import { AGENT_RUN_TERMINAL_STATUSES, ERROR_CODES } from '@surefy/contracts'
import type { AgentRunStatus, WidgetStreamEvent } from '@surefy/contracts'

import type { RunEventChunk } from '@/modules/agentRuns/index.js'

type WidgetFrame = { [E in WidgetStreamEvent as E['event']]: E['data'] }

const encoder = new TextEncoder()

const frame = <Name extends keyof WidgetFrame>(
  event: Name,
  id: string | null,
  data: WidgetFrame[Name],
): Uint8Array =>
  encoder.encode(
    'event: ' +
      event +
      '\n' +
      (id === null ? '' : 'id: ' + id + '\n') +
      'data: ' +
      JSON.stringify(data) +
      '\n\n',
  )

const KEEP_ALIVE = encoder.encode(': keep-alive\n\n')

const isTerminal = (status: string): status is AgentRunStatus =>
  (AGENT_RUN_TERMINAL_STATUSES as readonly string[]).includes(status)

/** A web result links to its page; a knowledge document's address is the workspace's own. */
const publicUrl = (url: unknown): string | null => {
  if (typeof url !== 'string') return null
  try {
    const parsed = new URL(url)
    return parsed.protocol === 'https:' || parsed.protocol === 'http:' ? parsed.href : null
  } catch {
    return null
  }
}

/** One parsed frame of the run stream: its Redis id, and the chunk or `[DONE]`. */
interface RunFrame {
  id: string | null
  data: string | null
  comment: boolean
}

const parseFrame = (text: string): RunFrame => {
  let id: string | null = null
  let data: string | null = null
  let comment = false
  for (const line of text.split('\n')) {
    if (line.startsWith(':')) comment = true
    else if (line.startsWith('id: ')) id = line.slice(4)
    else if (line.startsWith('data: ')) data = line.slice(6)
  }
  return { id, data, comment }
}

/**
 * The run event stream as the widget's smaller stream (contracts `agents/widget.ts`): `run`
 * first, the answer's text, the cited sources, `waiting-approval`, and `done` with the final
 * status. Steps, tool calls, Guard checks and approval details never reach a visitor. The Redis
 * ids are kept as event ids, so the widget can reattach with `Last-Event-ID`.
 */
export function widgetStream(
  runId: string,
  source: ReadableStream<Uint8Array>,
): ReadableStream<Uint8Array> {
  const reader = source.getReader()
  const decoder = new TextDecoder()
  const sources = new Map<string, number>()
  let buffer = ''
  let done = false

  const map = (id: string | null, chunk: RunEventChunk): Uint8Array | undefined => {
    switch (chunk.type) {
      case 'text-delta':
        return typeof chunk.delta === 'string' && chunk.delta !== ''
          ? frame('text-delta', id, { delta: chunk.delta })
          : undefined
      case 'source-url': {
        const key = typeof chunk.sourceId === 'string' ? chunk.sourceId : String(sources.size)
        if (sources.has(key)) return undefined
        sources.set(key, sources.size + 1)
        return frame('source', id, {
          index: sources.size,
          title: typeof chunk.title === 'string' ? chunk.title : '',
          page: null,
          url: publicUrl(chunk.url),
        })
      }
      case 'data-run': {
        const data = chunk.data as { status?: string; errorCode?: string | null } | undefined
        const status = data?.status
        if (status === 'waiting_approval') return frame('waiting-approval', id, {})
        if (status === undefined || !isTerminal(status) || done) return undefined
        done = true
        return frame('done', id, { status, errorCode: data?.errorCode ?? null })
      }
      default:
        return undefined
    }
  }

  /**
   * The widget frames of the complete run frames in the buffer, and whether the run stream said
   * `[DONE]`.
   */
  const drain = (): { out: Uint8Array[]; finished: boolean } => {
    const out: Uint8Array[] = []
    for (;;) {
      const end = buffer.indexOf('\n\n')
      if (end < 0) return { out, finished: false }
      const parsed = parseFrame(buffer.slice(0, end))
      buffer = buffer.slice(end + 2)
      if (parsed.data === '[DONE]') return { out, finished: true }
      if (parsed.data === null) {
        if (parsed.comment) out.push(KEEP_ALIVE)
        continue
      }
      let chunk: RunEventChunk
      try {
        chunk = JSON.parse(parsed.data) as RunEventChunk
      } catch {
        continue
      }
      const mapped = map(parsed.id, chunk)
      if (mapped !== undefined) out.push(mapped)
    }
  }

  return new ReadableStream<Uint8Array>({
    start(controller) {
      controller.enqueue(frame('run', null, { runId }))
    },
    // A pull that enqueues nothing is not repeated: read until there is something to send.
    async pull(controller) {
      try {
        for (;;) {
          const { value, done: ended } = await reader.read()
          if (!ended) buffer += decoder.decode(value, { stream: true })
          const { out, finished } = drain()
          for (const bytes of out) controller.enqueue(bytes)
          if (finished || ended) {
            await reader.cancel().catch(() => null)
            controller.close()
            return
          }
          if (out.length > 0) return
        }
      } catch {
        controller.enqueue(frame('error', null, { code: ERROR_CODES.INTERNAL_ERROR }))
        controller.close()
      }
    },
    async cancel() {
      await reader.cancel()
    },
  })
}
