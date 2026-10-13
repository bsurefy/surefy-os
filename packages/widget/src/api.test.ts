// SPDX-License-Identifier: MIT
import { describe, expect, it } from 'vitest'

import { NETWORK_ERROR, WidgetApi, WidgetApiError } from './api.js'
import {
  API_URL,
  apiError,
  bodyOf,
  CONFIG,
  fakeFetch,
  json,
  silence,
  stream,
  TOKEN,
} from './test/fakeServer.js'

import type { WidgetStreamEvent } from './protocol.js'

const conversationId = '0190a5c4-0000-7000-8000-000000000001'

describe('WidgetApi', () => {
  it('sends the token, never cookies, to the widget endpoint of the API address', async () => {
    const server = fakeFetch({ '/config': [json(200, { data: CONFIG })] })
    const api = new WidgetApi(`${API_URL}//`, TOKEN, server.fetch)
    expect(await api.getConfig()).toEqual(CONFIG)
    const [call] = server.calls
    expect(call?.url).toBe(`${API_URL}/api/v1/widget/config`)
    expect(call?.init.credentials).toBe('omit')
    expect((call?.init.headers as Record<string, string>)['x-surefy-widget-token']).toBe(TOKEN)
  })

  it('streams the events of an answer', async () => {
    const server = fakeFetch({
      '/messages': [
        stream([
          ['run', { runId: conversationId }, '1'],
          ['text-delta', { delta: 'Hello' }, '2'],
          ['done', { status: 'succeeded', errorCode: null }, '3'],
          ['step', { ignored: true }],
        ]),
      ],
    })
    const events: WidgetStreamEvent[] = []
    await new WidgetApi(API_URL, TOKEN, server.fetch).send(
      { conversationId, messages: [{ role: 'user', text: 'Hi' }] },
      (event) => events.push(event),
    )
    expect(events.map((event) => [event.event, event.id])).toEqual([
      ['run', '1'],
      ['text-delta', '2'],
      ['done', '3'],
    ])
    expect(bodyOf(server.calls[0])).toEqual({
      conversationId,
      messages: [{ role: 'user', text: 'Hi' }],
    })
  })

  it('reattaches with the conversation and the last event id', async () => {
    const server = fakeFetch({ '/events': [stream([])] })
    await new WidgetApi(API_URL, TOKEN, server.fetch).reattach('run-1', conversationId, '7', () => {
      throw new Error('no events expected')
    })
    const headers = server.calls[0]?.init.headers as Record<string, string>
    expect(server.calls[0]?.url).toBe(`${API_URL}/api/v1/widget/runs/run-1/events`)
    expect(headers['x-surefy-widget-conversation']).toBe(conversationId)
    expect(headers['last-event-id']).toBe('7')
  })

  it('turns the error envelope and Retry-After into a WidgetApiError', async () => {
    const server = fakeFetch({
      '/messages': [apiError(429, 'RATE_LIMITED', { 'retry-after': '12' })],
      '/config': [new Response('<html>Bad gateway</html>', { status: 502 })],
    })
    const api = new WidgetApi(API_URL, TOKEN, server.fetch)
    const limited = await api
      .send({ conversationId, messages: [{ role: 'user', text: 'Hi' }] }, silence)
      .catch((error: unknown) => error)
    expect(limited).toBeInstanceOf(WidgetApiError)
    expect(limited).toMatchObject({ code: 'RATE_LIMITED', status: 429, retryAfterSeconds: 12 })
    expect(await api.getConfig().catch((error: unknown) => error)).toMatchObject({
      code: 'HTTP_502',
    })
  })

  it('reports a request that never reached the API as a network error', async () => {
    const failing = (() => Promise.reject(new TypeError('Failed to fetch'))) as typeof fetch
    expect(
      await new WidgetApi(API_URL, TOKEN, failing).getConfig().catch((error: unknown) => error),
    ).toMatchObject({ code: NETWORK_ERROR, status: 0 })
  })
})
