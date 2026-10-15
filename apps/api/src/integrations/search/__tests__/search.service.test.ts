// SPDX-License-Identifier: AGPL-3.0-only
/* eslint-disable sonarjs/no-clear-text-protocols -- SearXNG runs on the customer's own network, over http */
import { pino } from 'pino'
import { describe, expect, it, vi } from 'vitest'

import type { UsageEvent } from '@surefy/contracts'

import {
  createSearchProviders,
  WebSearchService,
  type Fetch,
  type ResolvedSearchProvider,
  type SearchPii,
  type WebSearchRequest,
} from '../index.js'

const BRAVE: ResolvedSearchProvider = {
  providerKey: 'brave',
  credentials: { apiKey: 'test-brave-key' },
  credentialId: '0190a5c4-0000-7000-8000-000000000001',
  source: 'vault',
}

const request = (overrides: Partial<WebSearchRequest> = {}): WebSearchRequest => ({
  orgId: 'org-1',
  query: 'surefyos release notes',
  teamIds: ['team-1'],
  requestId: 'req-1',
  caller: { userId: 'user-1', teamId: 'team-1' },
  meter: { key: 'chat:message-1', sourceRefId: 'message-1' },
  ...overrides,
})

function setup(
  options: {
    resolved?: ResolvedSearchProvider | null
    pii?: SearchPii['filter']
    status?: number
  } = {},
) {
  const sent: URL[] = []
  const fetchFn: Fetch = (input) => {
    sent.push(new URL(input instanceof Request ? input.url : input.toString()))
    return Promise.resolve(
      options.status === undefined || options.status === 200
        ? new Response(
            JSON.stringify({
              web: {
                results: [{ title: 'Notes', url: 'https://example.com/n', description: 'Hello' }],
              },
            }),
            { status: 200 },
          )
        : new Response('{}', { status: options.status }),
    )
  }
  const events: UsageEvent[] = []
  const health: unknown[] = []
  const pii = vi.fn<SearchPii['filter']>(
    options.pii ?? ((input) => Promise.resolve({ text: input.text, masked: false })),
  )
  const service = new WebSearchService({
    providers: createSearchProviders({ fetch: fetchFn }),
    resolver: {
      resolve: () => Promise.resolve(options.resolved === undefined ? BRAVE : options.resolved),
      recordHealth: (...args) => {
        health.push(args)
        return Promise.resolve()
      },
    },
    pii: { filter: pii },
    usage: {
      record: (_orgId, event) => {
        events.push(event)
        return Promise.resolve()
      },
    },
    logger: pino({ level: 'silent' }),
    now: () => new Date('2026-10-15T09:00:00.000Z'),
  })
  return { service, sent, events, health, pii }
}

describe('web search', () => {
  it('searches with the organization provider and meters one search', async () => {
    const { service, sent, events, health } = setup()
    const outcome = await service.search(request({ limit: 3, freshness: 'week' }))
    expect(outcome).toMatchObject({
      ok: true,
      provider: 'brave',
      query: 'surefyos release notes',
      piiMasked: false,
      results: [{ title: 'Notes', url: 'https://example.com/n', snippet: 'Hello' }],
    })
    expect(sent[0]?.searchParams.get('count')).toBe('3')
    expect(sent[0]?.searchParams.get('freshness')).toBe('pw')
    expect(events).toHaveLength(1)
    expect(events[0]).toMatchObject({
      userId: 'user-1',
      teamId: 'team-1',
      sourceModule: 'search',
      kind: 'web_search',
      modelKey: 'search/brave',
      providerKey: 'brave',
      credentialId: BRAVE.credentialId,
      units: 1,
      costMicros: 0,
      outcome: 'success',
      errorCode: null,
      piiMasked: false,
      dataLocation: 'provider',
      dedupeKey: 'chat:message-1:search',
      occurredAt: '2026-10-15T09:00:00.000Z',
    })
    expect(health).toEqual([['org-1', BRAVE.credentialId, { ok: true }]])
  })

  it('sends the filtered query, never the original', async () => {
    const { service, sent, events } = setup({
      pii: (input) =>
        Promise.resolve({ text: input.text.replace('Jane Doe', '[PERSON]'), masked: true }),
    })
    const outcome = await service.search(request({ query: 'news about Jane Doe' }))
    expect(outcome).toMatchObject({ ok: true, query: 'news about [PERSON]', piiMasked: true })
    expect(sent[0]?.searchParams.get('q')).toBe('news about [PERSON]')
    expect(events[0]?.piiMasked).toBe(true)
  })

  it('hands the filter the people whose rules apply and cuts a long query', async () => {
    const { service, pii } = setup()
    await service.search(request({ agentId: 'agent-1', query: 'x'.repeat(1000), locale: 'de' }))
    expect(pii).toHaveBeenCalledWith({
      orgId: 'org-1',
      text: 'x'.repeat(400),
      teamIds: ['team-1'],
      agentId: 'agent-1',
      requestId: 'req-1',
      locale: 'de',
    })
  })

  it('sends nothing when a blocked type is found, or when the filter cannot look', async () => {
    const blocked = setup({ pii: () => Promise.resolve({ blocked: true }) })
    expect(await blocked.service.search(request())).toEqual({
      ok: false,
      reason: 'pii_blocked',
      provider: 'brave',
      code: null,
    })
    expect(blocked.sent).toHaveLength(0)
    expect(blocked.events).toHaveLength(0)

    const unchecked = setup({ pii: () => Promise.reject(new Error('ml is down')) })
    expect(await unchecked.service.search(request())).toMatchObject({
      ok: false,
      reason: 'provider_error',
    })
    expect(unchecked.sent).toHaveLength(0)
  })

  it('says so when no provider is set up', async () => {
    const { service, sent, pii } = setup({ resolved: null })
    expect(await service.search(request())).toEqual({
      ok: false,
      reason: 'not_configured',
      provider: null,
      code: null,
    })
    expect(await service.isConfigured('org-1')).toBe(false)
    expect(sent).toHaveLength(0)
    expect(pii).not.toHaveBeenCalled()
  })

  it('turns a provider failure into an outcome, meters it and records the health', async () => {
    const { service, events, health } = setup({ status: 429 })
    expect(await service.search(request())).toEqual({
      ok: false,
      reason: 'provider_error',
      provider: 'brave',
      code: 'VAULT_QUOTA_EXCEEDED',
    })
    expect(events[0]).toMatchObject({ outcome: 'error', errorCode: 'VAULT_QUOTA_EXCEEDED' })
    expect(health).toEqual([
      ['org-1', BRAVE.credentialId, { ok: false, reasonCode: 'VAULT_QUOTA_EXCEEDED' }],
    ])
  })

  it('searches the install SearXNG address without a stored provider', async () => {
    const { service, events, health } = setup({
      resolved: {
        providerKey: 'searxng',
        credentials: { baseUrl: 'http://searxng:8080' },
        credentialId: null,
        source: 'install',
      },
    })
    // the fake answers in Brave's format, so only the metering is checked here
    await service.search(
      request({ meter: { key: 'agent_run:r1:4', subject: { type: 'agent', id: 'a1' } } }),
    )
    expect(events[0]).toMatchObject({
      providerKey: 'searxng',
      credentialId: null,
      dataLocation: 'local',
      subjectType: 'agent',
      subjectId: 'a1',
    })
    expect(health).toEqual([])
  })
})
