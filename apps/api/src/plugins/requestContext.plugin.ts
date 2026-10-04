// SPDX-License-Identifier: AGPL-3.0-only
import fp from 'fastify-plugin'

import { ulid } from '@/lib/ulid.js'

export const REQUEST_ID_HEADER = 'x-request-id'

// A forwarded request ID is kept only when it is a plain token, so a client cannot inject log
// content or an oversized value.
const INCOMING_ID_PATTERN = /^[A-Za-z0-9_-]{8,64}$/

/** Fastify `genReqId`: a valid incoming `x-request-id` (from the reverse proxy), or a ULID. */
export function generateRequestId(headers: Record<string, string | string[] | undefined>): string {
  const incoming = headers[REQUEST_ID_HEADER]
  const value = Array.isArray(incoming) ? incoming[0] : incoming
  return value !== undefined && INCOMING_ID_PATTERN.test(value) ? value : ulid()
}

/**
 * Request correlation: the request ID goes back in the `x-request-id` header, and one line is
 * logged per request with `method`, `route`, `statusCode` and `durationMs`. Routes with
 * `logLevel: 'silent'` (health probes) log nothing.
 */
export const requestContextPlugin = fp(
  (app) => {
    app.addHook('onRequest', (request, reply, done) => {
      void reply.header(REQUEST_ID_HEADER, request.id)
      done()
    })

    app.addHook('onResponse', (request, reply, done) => {
      request.log.info(
        {
          method: request.method,
          route: request.routeOptions.url ?? request.url,
          statusCode: reply.statusCode,
          durationMs: Math.round(reply.elapsedTime),
        },
        'request completed',
      )
      done()
    })
  },
  { name: 'requestContext' },
)
