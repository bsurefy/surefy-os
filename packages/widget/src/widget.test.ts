// SPDX-License-Identifier: MIT
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import {
  apiError,
  API_URL,
  bodyOf,
  CONFIG,
  fakeFetch,
  json,
  silence,
  stream,
  TOKEN,
} from './test/fakeServer.js'
import { SurefyWidget, type WidgetOptions } from './widget.js'

let widget: SurefyWidget | null = null

const mount = (fetchImpl: typeof fetch, options: Partial<WidgetOptions> = {}) => {
  widget = new SurefyWidget({
    token: TOKEN,
    apiUrl: API_URL,
    fetch: fetchImpl,
    storage: sessionStorage,
    ...options,
  })
  widget.start()
  return widget
}

const shadow = () => {
  const host = document.querySelector<HTMLElement>('[data-surefy-widget]')
  if (!host?.shadowRoot) throw new Error('The widget is not mounted')
  return host.shadowRoot
}
const $ = (selector: string) => {
  const node = shadow().querySelector<HTMLElement>(selector)
  if (!node) throw new Error(`Missing ${selector}`)
  return node
}
const button = (selector: string) => $(selector) as HTMLButtonElement
const messagesText = () => $('.messages').textContent
const launcher = () => $('.launcher') as HTMLButtonElement

beforeEach(() => {
  sessionStorage.clear()
  Object.defineProperty(navigator, 'onLine', { value: true, configurable: true })
})

afterEach(() => {
  widget?.destroy()
  widget = null
  vi.restoreAllMocks()
  vi.useRealTimers()
})

describe('SurefyWidget', () => {
  it('shows a launcher named after the agent, with the configured look', async () => {
    mount(
      fakeFetch({
        '/config': [json(200, { data: { ...CONFIG, position: 'bottom_left', theme: 'dark' } })],
      }).fetch,
    )
    await vi.waitFor(() => {
      expect(launcher().getAttribute('aria-label')).toBe('Open chat with Support triage')
    })
    expect(document.querySelector<HTMLElement>('[data-surefy-widget]')?.dataset.theme).toBe('dark')
    expect($('.root').dataset.position).toBe('bottom_left')
    expect(launcher().getAttribute('aria-expanded')).toBe('false')
  })

  it('opens on the greeting and starters, and closes with Escape back to the launcher', async () => {
    mount(fakeFetch({ '/config': [json(200, { data: CONFIG })] }).fetch)
    await vi.waitFor(() => {
      expect(launcher().getAttribute('aria-label')).toContain('Support triage')
    })
    launcher().click()
    expect($('.panel').hidden).toBe(false)
    expect($('.panel').getAttribute('role')).toBe('dialog')
    expect(launcher().getAttribute('aria-expanded')).toBe('true')
    expect(shadow().activeElement).toBe($('textarea'))
    expect(messagesText()).toContain('Hi! Ask me about orders.')
    expect([...shadow().querySelectorAll('.starter')].map((chip) => chip.textContent)).toEqual(
      CONFIG.conversationStarters,
    )
    $('.panel').dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }))
    expect($('.panel').hidden).toBe(true)
    expect(shadow().activeElement).toBe(launcher())
  })

  it('streams an answer with its sources and keeps the conversation for the next page', async () => {
    const server = fakeFetch({
      '/config': [json(200, { data: CONFIG }), json(200, { data: CONFIG })],
      '/messages': [
        stream([
          ['run', { runId: '0190a5c4-0000-7000-8000-0000000000aa' }, '1'],
          ['text-delta', { delta: 'Your order ships ' }, '2'],
          ['text-delta', { delta: 'tomorrow.' }, '3'],
          ['source', { index: 1, title: 'Shipping policy', page: 2, url: null }, '4'],
          ['done', { status: 'succeeded', errorCode: null }, '5'],
        ]),
      ],
    })
    mount(server.fetch, { open: true })
    await vi.waitFor(() => {
      expect(shadow().querySelectorAll('.starter')).toHaveLength(2)
    })
    button('.starter').click()
    await vi.waitFor(() => {
      expect(messagesText()).toContain('Your order ships tomorrow.')
    })
    expect(messagesText()).toContain('1. Shipping policy (page 2)')
    expect($('.visually-hidden').textContent).toContain('Your order ships tomorrow.')
    expect((bodyOf(server.calls[1]) as { messages: unknown[] }).messages).toEqual([
      { role: 'user', text: 'Where is my order?' },
    ])

    widget?.destroy()
    mount(server.fetch, { open: true })
    await vi.waitFor(() => {
      expect(messagesText()).toContain('Where is my order?')
    })
    expect(messagesText()).toContain('Your order ships tomorrow.')
  })

  it('waits for a person, then reattaches from the last event and shows the answer', async () => {
    const server = fakeFetch({
      '/config': [json(200, { data: CONFIG })],
      '/messages': [
        stream([
          ['run', { runId: '0190a5c4-0000-7000-8000-0000000000bb' }, '1'],
          ['waiting-approval', {}, '2'],
        ]),
      ],
      '/events': [
        stream([
          ['text-delta', { delta: 'Refund approved.' }, '3'],
          ['done', { status: 'succeeded', errorCode: null }, '4'],
        ]),
      ],
    })
    mount(server.fetch, { open: true })
    await vi.waitFor(() => {
      expect(shadow().querySelectorAll('.starter')).toHaveLength(2)
    })
    widget?.sendText('Refund order 42')
    await vi.waitFor(() => {
      expect(messagesText()).toContain('A person needs to check this')
    })
    await vi.waitFor(
      () => {
        expect(messagesText()).toContain('Refund approved.')
      },
      { timeout: 4000 },
    )
    const reattach = server.calls.find((call) => call.url.endsWith('/events'))
    expect((reattach?.init.headers as Record<string, string>)['last-event-id']).toBe('2')
    expect(messagesText()).not.toContain('A person needs to check this')
  })

  it('offers Retry on a failed answer, and Retry sends again', async () => {
    const server = fakeFetch({
      '/config': [json(200, { data: CONFIG })],
      '/messages': [
        stream([['error', { code: 'MODEL_PROVIDER_UNAVAILABLE' }]]),
        stream([
          ['text-delta', { delta: 'Back again.' }],
          ['done', { status: 'succeeded', errorCode: null }],
        ]),
      ],
    })
    mount(server.fetch, { open: true })
    await vi.waitFor(() => {
      expect(shadow().querySelectorAll('.starter')).toHaveLength(2)
    })
    widget?.sendText('Hello')
    await vi.waitFor(() => {
      expect(messagesText()).toContain('Something went wrong. Try again.')
    })
    button('.retry').click()
    await vi.waitFor(() => {
      expect(messagesText()).toContain('Back again.')
    })
    expect(messagesText()).not.toContain('Something went wrong')
  })

  it('counts down when messages come too quickly and keeps Send disabled', async () => {
    mount(
      fakeFetch({
        '/config': [json(200, { data: CONFIG })],
        '/messages': [apiError(429, 'RATE_LIMITED', { 'retry-after': '20' })],
      }).fetch,
      { open: true },
    )
    await vi.waitFor(() => {
      expect(shadow().querySelectorAll('.starter')).toHaveLength(2)
    })
    widget?.sendText('Hello')
    await vi.waitFor(() => {
      expect(messagesText()).toMatch(/Try again in (19|20) seconds/)
    })
    const input = $('textarea') as HTMLTextAreaElement
    input.value = 'Another one'
    input.dispatchEvent(new Event('input'))
    expect(button('.send').disabled).toBe(true)
  })

  it('stays hidden and tells the site owner when the page is not an allowed origin', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(silence)
    mount(fakeFetch({ '/config': [apiError(403, 'AGENT_WIDGET_ORIGIN_NOT_ALLOWED')] }).fetch)
    await vi.waitFor(() => {
      expect(document.querySelector('[data-surefy-widget]')).toBeNull()
    })
    expect(warn).toHaveBeenCalledWith(expect.stringContaining('not an allowed origin'))
  })

  it('says the chat is unavailable while the agent is paused, without a composer', async () => {
    mount(fakeFetch({ '/config': [apiError(409, 'AGENT_PAUSED')] }).fetch, { open: true })
    await vi.waitFor(() => {
      expect(messagesText()).toContain("This chat isn't available right now.")
    })
    expect($('.composer').hidden).toBe(true)
  })

  it('starts a new conversation', async () => {
    mount(
      fakeFetch({
        '/config': [json(200, { data: CONFIG })],
        '/messages': [stream([['done', { status: 'failed', errorCode: 'AGENT_RUN_TURN_LIMIT' }]])],
      }).fetch,
      { open: true },
    )
    await vi.waitFor(() => {
      expect(shadow().querySelectorAll('.starter')).toHaveLength(2)
    })
    widget?.sendText('Hello')
    await vi.waitFor(() => {
      expect(messagesText()).toContain('Something went wrong')
    })
    button('[aria-label="New chat"]').click()
    expect(messagesText()).toContain('Hi! Ask me about orders.')
    expect(messagesText()).not.toContain('Hello')
  })
})
