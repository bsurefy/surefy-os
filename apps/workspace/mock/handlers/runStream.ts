// SPDX-License-Identifier: AGPL-3.0-only

/** One chunk of the AI SDK UI message stream. */
export type StreamChunk = Record<string, unknown>

const encoder = new TextEncoder()

export const sleep = (ms: number) =>
  new Promise<void>((resolve) => {
    setTimeout(resolve, ms)
  })

const sseHeaders = {
  'content-type': 'text/event-stream',
  'cache-control': 'no-cache',
  'x-vercel-ai-ui-message-stream': 'v1',
}

/**
 * A run's event stream in the AI SDK UI message stream format. `produce` writes chunks and stops
 * when `isAborted()` turns true (the reader closed the stream); it answers whether the stream ended
 * normally. An `error` chunk ends the stream without `[DONE]`.
 */
export function sseResponse(
  signal: AbortSignal,
  produce: (write: (chunk: StreamChunk) => void, isAborted: () => boolean) => Promise<boolean>,
): Response {
  let isAborted = false
  signal.addEventListener('abort', () => {
    isAborted = true
  })
  const stream = new ReadableStream<Uint8Array>({
    async start(controller) {
      const write = (chunk: StreamChunk) => {
        if (isAborted) return
        try {
          controller.enqueue(encoder.encode(`data: ${JSON.stringify(chunk)}\n\n`))
        } catch {
          // the reader closed the stream first: the rest is not sent
          isAborted = true
        }
      }
      try {
        const isFinished = await produce(write, () => isAborted)
        // an `error` chunk ends the stream: the reader stops there and nothing more is sent
        if (!isAborted && isFinished) {
          controller.enqueue(encoder.encode('data: [DONE]\n\n'))
          controller.close()
        }
      } catch {
        // the reader went away while the stream was ending: nothing is left to tell
      }
    },
    cancel() {
      isAborted = true
    },
  })
  return new Response(stream, { headers: sseHeaders })
}
