// SPDX-License-Identifier: AGPL-3.0-only
import { describe, expect, it } from 'vitest'

import { usageEventSchema } from '@surefy/contracts'

import { daysBetween, isTimeZone, microsToAmount, monthOf, utcDayRange } from '../usage.utils.js'
import { eventOfCall } from '../usageMeter.js'

import type { ModelCallRecord } from '@/modules/modelGateway/index.js'

const record = (over: Partial<ModelCallRecord> = {}): ModelCallRecord => ({
  ctx: {
    orgId: '0190a5c4-0000-7000-8000-000000000001',
    userId: '0190a5c4-0000-7000-8000-000000000002',
    teamIds: [],
    primaryTeamId: '0190a5c4-0000-7000-8000-000000000003',
    allowedModelIds: 'all',
    caller: 'chat',
    meter: { key: 'chat:0190a5c4-0000-7000-8000-000000000004' },
  },
  result: {
    model: {
      modelKey: 'openai/gpt-test',
      displayName: 'GPT test',
      providerKey: 'openai',
      source: 'provider',
    },
    credentialScope: 'organization',
    outcome: 'success',
    routed: false,
    fallback: null,
    usage: {
      inputTokens: 10,
      outputTokens: 5,
      cachedInputTokens: 0,
      costMicros: 42,
      currency: 'USD',
      firstTokenMs: 100,
      latencyMs: 300,
    },
  },
  kind: 'generation',
  attempt: 1,
  startedAt: new Date('2026-10-05T09:00:00.000Z'),
  credentialId: null,
  vaultModelId: null,
  outcome: 'success',
  errorCode: null,
  ...over,
})

describe('eventOfCall', () => {
  it('turns a gateway call into a valid usage row keyed by its attempt', () => {
    const event = eventOfCall(record())
    expect(usageEventSchema.safeParse(event).success).toBe(true)
    expect(event.dedupeKey).toBe('chat:0190a5c4-0000-7000-8000-000000000004:1')
    expect(event.teamId).toBe('0190a5c4-0000-7000-8000-000000000003')
    expect(event.billedVia).toBe('provider_direct')
    expect(event.occurredAt).toBe('2026-10-05T09:00:00.000Z')
  })

  it('meters local models at zero, on the local data location', () => {
    const base = record()
    const event = eventOfCall({ ...base, result: { ...base.result, credentialScope: 'local' } })
    expect(event).toMatchObject({ billedVia: 'local', dataLocation: 'local', costMicros: 0 })
  })

  it('gives calls without a meter key a unique one and system calls the routing module', () => {
    const base = record()
    const event = eventOfCall({ ...base, ctx: { ...base.ctx, caller: 'system', meter: undefined } })
    expect(event.dedupeKey).toMatch(/^call:[0-9a-f-]{36}:1$/)
    expect(event.sourceModule).toBe('routing')
  })
})

describe('usage utils', () => {
  it('lists UTC days and months', () => {
    expect(daysBetween('2026-09-29', '2026-10-02')).toEqual([
      '2026-09-29',
      '2026-09-30',
      '2026-10-01',
      '2026-10-02',
    ])
    expect(monthOf('2026-09-29')).toBe('2026-09-01')
  })

  it('covers every UTC day a range touches', () => {
    expect(utcDayRange('2026-09-01T22:00:00.000Z', '2026-09-03T00:00:00.000Z')).toEqual({
      fromDay: '2026-09-01',
      toDay: '2026-09-03',
    })
    expect(utcDayRange('2026-09-01T00:00:00.000Z', '2026-09-03T00:00:01.000Z').toDay).toBe(
      '2026-09-04',
    )
  })

  it('checks time zones and formats micros', () => {
    expect(isTimeZone('Europe/Berlin')).toBe(true)
    expect(isTimeZone('Mars/Olympus')).toBe(false)
    expect(microsToAmount(1_250_000)).toBe('1.250000')
  })
})
