// SPDX-License-Identifier: AGPL-3.0-only
import { describe, expect, it } from 'vitest'

import {
  createExportInputSchema,
  defaultInsightsInterval,
  FILTER_VALUES_MAX,
  INSIGHTS_BREAKDOWN_LIMIT,
  insightsBreakdownDtoSchema,
  insightsBreakdownQuerySchema,
  insightsOverviewDtoSchema,
  insightsOverviewQuerySchema,
  insightsTimeseriesQuerySchema,
  usageCsvColumnsSchema,
  usageEventSchema,
  usageExportContainsPersonalData,
  usageExportFiltersSchema,
} from '../index.js'

const id = '0190a5c4-0000-7000-8000-000000000001'
const id2 = '0190a5c4-0000-7000-8000-000000000002'
const range = {
  from: '2026-09-01T00:00:00.000Z',
  to: '2026-10-01T00:00:00.000Z',
  timeZone: 'Europe/Berlin',
}

const event = {
  userId: id,
  teamId: id2,
  apiKeyId: null,
  sourceModule: 'chat',
  subjectType: null,
  subjectId: null,
  sourceRefId: id,
  kind: 'generation',
  modelKey: 'openai/gpt-5',
  vaultModelId: id2,
  credentialId: id,
  credentialScope: 'organization',
  providerKey: 'openai',
  inputTokens: 1200,
  outputTokens: 300,
  cachedInputTokens: 0,
  reasoningTokens: 0,
  units: 0,
  costMicros: 4500,
  currency: 'USD',
  billedVia: 'provider_direct',
  latencyMs: 820,
  outcome: 'success',
  errorCode: null,
  routed: false,
  fallbackFromModelKey: null,
  piiMasked: false,
  dataLocation: 'provider',
  dedupeKey: `chat:${id}:0`,
  requestId: 'req-1',
  occurredAt: '2026-10-05T09:00:00.000Z',
} as const

const totals = {
  requests: 3,
  inputTokens: 10,
  outputTokens: 5,
  cachedInputTokens: 0,
  cost: [{ currency: 'USD', costMicros: 120 }],
}

describe('usage events', () => {
  it('accepts a metered chat call', () => {
    expect(usageEventSchema.safeParse(event).success).toBe(true)
  })

  it('needs the subject type and id together', () => {
    expect(usageEventSchema.safeParse({ ...event, subjectType: 'agent' }).success).toBe(false)
    expect(
      usageEventSchema.safeParse({ ...event, subjectType: 'agent', subjectId: id2 }).success,
    ).toBe(true)
  })

  it('ties local and platform billing to their credential scopes', () => {
    expect(usageEventSchema.safeParse({ ...event, billedVia: 'local' }).success).toBe(false)
    expect(
      usageEventSchema.safeParse({
        ...event,
        billedVia: 'local',
        credentialScope: 'local',
        costMicros: 0,
      }).success,
    ).toBe(true)
    expect(usageEventSchema.safeParse({ ...event, credentialScope: 'platform' }).success).toBe(
      false,
    )
  })

  it('rejects negative counts and uppercases currencies', () => {
    expect(usageEventSchema.safeParse({ ...event, inputTokens: -1 }).success).toBe(false)
    expect(usageEventSchema.safeParse({ ...event, currency: 'usd' }).success).toBe(true)
    expect(usageEventSchema.parse({ ...event, currency: 'usd' }).currency).toBe('USD')
    expect(usageEventSchema.safeParse({ ...event, currency: 'US' }).success).toBe(false)
  })
})

describe('insights queries', () => {
  it('turns repeated filters into arrays', () => {
    const parsed = insightsOverviewQuerySchema.parse({ ...range, teamId: id, userId: [id, id2] })
    expect(parsed.teamId).toEqual([id])
    expect(parsed.userId).toEqual([id, id2])
    expect(parsed.modelKey).toBeUndefined()
  })

  it('caps multi-value filters', () => {
    const many = Array.from({ length: FILTER_VALUES_MAX + 1 }, () => 'openai/gpt-5')
    expect(insightsOverviewQuerySchema.safeParse({ ...range, modelKey: many }).success).toBe(false)
  })

  it('needs `to` after `from` and at most a year between them', () => {
    expect(insightsOverviewQuerySchema.safeParse({ ...range, to: range.from }).success).toBe(false)
    expect(
      insightsOverviewQuerySchema.safeParse({ ...range, from: '2025-09-01T00:00:00.000Z' }).success,
    ).toBe(false)
    expect(
      insightsOverviewQuerySchema.safeParse({ ...range, from: '2025-10-01T00:00:00.000Z' }).success,
    ).toBe(true)
  })

  it('defaults the breakdown to the top ten by cost', () => {
    const parsed = insightsBreakdownQuerySchema.parse({ ...range, by: 'team' })
    expect(parsed.sort).toBe('cost')
    expect(parsed.limit).toBe(INSIGHTS_BREAKDOWN_LIMIT.default)
    expect(insightsBreakdownQuerySchema.parse({ ...range, by: 'model', limit: '50' }).limit).toBe(
      50,
    )
    expect(insightsBreakdownQuerySchema.safeParse({ ...range, by: 'agent' }).success).toBe(false)
  })

  it('limits a time series to its maximum number of points', () => {
    expect(insightsTimeseriesQuerySchema.safeParse({ ...range, interval: 'hour' }).success).toBe(
      false,
    )
    expect(insightsTimeseriesQuerySchema.safeParse({ ...range, interval: 'day' }).success).toBe(
      true,
    )
  })

  it('picks hours for a day and days for longer ranges', () => {
    expect(defaultInsightsInterval({ from: range.from, to: '2026-09-02T00:00:00.000Z' })).toBe(
      'hour',
    )
    expect(defaultInsightsInterval(range)).toBe('day')
  })
})

describe('insights responses', () => {
  const overview = {
    messages: { state: 'value', value: 42 },
    activePeople: { state: 'value', value: 7 },
    tokens: { state: 'restricted' },
    cost: { state: 'value', value: [{ currency: 'USD', costMicros: 1_250_000 }] },
    costThisMonth: { state: 'value', value: [] },
    hasUsage: true,
    unpricedModels: [
      {
        modelKey: 'openai/new-model',
        displayName: 'New model',
        providerKey: 'openai',
        source: 'provider',
      },
    ],
    dataThrough: '2026-10-05T08:55:00.000Z',
  }

  it('shows restricted numbers without a value', () => {
    expect(insightsOverviewDtoSchema.safeParse(overview).success).toBe(true)
    expect(
      insightsOverviewDtoSchema.safeParse({
        ...overview,
        tokens: { state: 'restricted', value: 0 },
      }).data?.tokens,
    ).toEqual({ state: 'restricted' })
    expect(
      insightsOverviewDtoSchema.safeParse({ ...overview, messages: { state: 'value' } }).success,
    ).toBe(false)
  })

  it('groups calls without a team under a null key', () => {
    const breakdown = {
      by: 'team',
      rows: [
        { ...totals, key: id, label: 'Finance', model: null, isLocal: false },
        { ...totals, key: null, label: null, model: null, isLocal: false },
      ],
      others: { ...totals, groupCount: 4 },
      total: totals,
    }
    expect(insightsBreakdownDtoSchema.safeParse(breakdown).success).toBe(true)
    expect(
      insightsBreakdownDtoSchema.safeParse({ ...breakdown, others: { ...totals, groupCount: 0 } })
        .success,
    ).toBe(false)
  })
})

describe('usage export', () => {
  it('validates the stored filters and columns', () => {
    expect(usageExportFiltersSchema.parse({ teamId: id }).teamId).toEqual([id])
    expect(usageCsvColumnsSchema.safeParse(['day', 'cost']).success).toBe(true)
    expect(usageCsvColumnsSchema.safeParse(['day', 'prompt']).success).toBe(false)
  })

  it('flags exports that name people', () => {
    expect(usageExportContainsPersonalData({})).toBe(true)
    expect(usageExportContainsPersonalData({ columns: ['day', 'team', 'cost'] })).toBe(false)
    expect(usageExportContainsPersonalData({ columns: ['day', 'email'] })).toBe(true)
  })

  it('is requested as a usage_csv export', () => {
    const input = createExportInputSchema.parse({
      kind: 'usage_csv',
      params: {
        version: 1,
        format: 'csv',
        dateRange: range,
        filters: { teamId: [id] },
        columns: ['day', 'team', 'cost', 'currency'],
      },
    })
    expect(usageExportFiltersSchema.safeParse(input.params.filters).success).toBe(true)
    expect(usageCsvColumnsSchema.safeParse(input.params.columns).success).toBe(true)
  })
})
