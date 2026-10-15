// SPDX-License-Identifier: AGPL-3.0-only
import type { UIMessageChunk } from 'ai'

const encoder = new TextEncoder()

const frame = (chunk: UIMessageChunk): Uint8Array =>
  encoder.encode('data: ' + JSON.stringify(chunk) + '\n\n')

/** The run's own `start` chunk names the run; the chat stream's names the assistant message. */
function isStart(event: string): boolean {
  const data = event.split('\n').find((line) => line.startsWith('data: '))
  if (data === undefined) return false
  try {
    return (JSON.parse(data.slice('data: '.length)) as { type?: unknown }).type === 'start'
  } catch {
    return false
  }
}

/**
 * An agent chat's answer (contracts chat/stream.ts): the run's event stream, opened by the chat
 * stream's `start` (the assistant message id) and its `data-message`, `data-model` and
 * `data-title` chunks. Every other event passes through with its id, so a client that reconnects
 * to `GET …/runs/:runId/events` with `Last-Event-ID` continues where it stopped.
 */
export function chatRunResponse(
  run: Response,
  head: { assistantMessageId: string; chunks: readonly UIMessageChunk[] },
): Response {
  const decoder = new TextDecoder()
  let buffer = ''
  const rewrite = new TransformStream<Uint8Array, Uint8Array>({
    start: (controller) => {
      controller.enqueue(frame({ type: 'start', messageId: head.assistantMessageId }))
      for (const chunk of head.chunks) controller.enqueue(frame(chunk))
    },
    transform: (bytes, controller) => {
      buffer += decoder.decode(bytes, { stream: true })
      let end = buffer.indexOf('\n\n')
      while (end >= 0) {
        const event = buffer.slice(0, end + 2)
        buffer = buffer.slice(end + 2)
        if (!isStart(event)) controller.enqueue(encoder.encode(event))
        end = buffer.indexOf('\n\n')
      }
    },
    flush: (controller) => {
      buffer += decoder.decode()
      if (buffer !== '') controller.enqueue(encoder.encode(buffer))
    },
  })
  return new Response(run.body === null ? null : run.body.pipeThrough(rewrite), {
    status: run.status,
    headers: run.headers,
  })
}
