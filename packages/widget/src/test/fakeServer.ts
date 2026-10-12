// SPDX-License-Identifier: MIT
import type { WidgetConfigDto } from '../protocol.js'

export const TOKEN = `wt_${'a1B2c3D4e5'.repeat(4)}xyz`
export const API_URL = 'https://api.example.com'

export const CONFIG: WidgetConfigDto = {
  agentName: 'Support triage',
  greeting: 'Hi! Ask me about orders.',
  conversationStarters: ['Where is my order?', 'How do I get a refund?'],
  theme: 'auto',
  position: 'bottom_right',
  locale: 'en',
  messageMaxLength: 4000,
}

/** An SSE body from `[event, data, id?]` triples, cut into small chunks like a real network. */
export function sse(
  events: [string, unknown, string?][],
  chunkSize = 17,
): ReadableStream<Uint8Array> {
  const text = events
    .map(([event, data, id]) => {
      const idLine = id === undefined ? '' : `id: ${id}\n`
      return `${idLine}event: ${event}\ndata: ${JSON.stringify(data)}\n\n`
    })
    .join('')
  const bytes = new TextEncoder().encode(text)
  let offset = 0
  return new ReadableStream({
    pull(controller) {
      if (offset >= bytes.length) {
        controller.close()
        return
      }
      controller.enqueue(bytes.slice(offset, offset + chunkSize))
      offset += chunkSize
    },
  })
}

export const json = (status: number, body: unknown, headers: Record<string, string> = {}) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json', ...headers },
  })

export const apiError = (status: number, code: string, headers: Record<string, string> = {}) =>
  json(status, { error: { code, message: code, requestId: 'req', details: [] } }, headers)

export const stream = (events: [string, unknown, string?][]) =>
  new Response(sse(events), { status: 200, headers: { 'content-type': 'text/event-stream' } })

export interface Call {
  url: string
  init: RequestInit
}

const urlOf = (input: RequestInfo | URL): string => {
  if (typeof input === 'string') return input
  return input instanceof URL ? input.href : input.url
}

/** The JSON body a call sent. */
export const bodyOf = (call: Call | undefined): unknown =>
  typeof call?.init.body === 'string' ? JSON.parse(call.init.body) : null

/** Silences an expected console warning. */
export const silence = (): void => {
  // The test asserts the warning itself.
}

/** A `fetch` that answers from a queue per path suffix and records every call. */
export function fakeFetch(routes: Record<string, (Response | (() => Response))[]>) {
  const calls: Call[] = []
  const impl = (input: RequestInfo | URL, init: RequestInit = {}) => {
    const url = urlOf(input)
    calls.push({ url, init })
    const key = Object.keys(routes).find((suffix) => new URL(url).pathname.endsWith(suffix))
    const next = key === undefined ? undefined : routes[key]?.shift()
    if (next === undefined) return Promise.reject(new Error(`No fake response for ${url}`))
    return Promise.resolve(typeof next === 'function' ? next() : next)
  }
  return { fetch: impl, calls }
}
