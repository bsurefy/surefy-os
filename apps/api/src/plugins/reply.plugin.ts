// SPDX-License-Identifier: AGPL-3.0-only
import { createUIMessageStreamResponse, type UIMessageChunk } from 'ai'
import fp from 'fastify-plugin'

import '@/types/fastify.js'

const STREAM_HEADERS = { 'cache-control': 'no-cache, no-transform' }

/**
 * The three success envelopes (api.md, §4). Controllers reply only through these; the error
 * envelope is built by the error handler.
 */
export const replyPlugin = fp(
  (app) => {
    app.decorateReply('ok', function ok(data: unknown) {
      return this.status(200).send({ data })
    })
    app.decorateReply('created', function created(data: unknown) {
      return this.status(201).send({ data })
    })
    app.decorateReply('page', function page(items: readonly unknown[], nextCursor: string | null) {
      return this.status(200).send({ data: items, meta: { nextCursor } })
    })
    app.decorateReply('noContent', function noContent() {
      return this.status(204).send()
    })
    // streaming handlers (controllers.md, §4): the AI SDK UI message stream as a web Response.
    // `no-transform` keeps proxies on the way (a dev server's rewrite, a reverse proxy) from
    // compressing the stream, which buffers it until the answer ends.
    app.decorateReply(
      'uiMessageStream',
      function uiMessageStream(stream: ReadableStream<UIMessageChunk>) {
        return this.send(createUIMessageStreamResponse({ stream, headers: STREAM_HEADERS }))
      },
    )
  },
  { name: 'reply' },
)
