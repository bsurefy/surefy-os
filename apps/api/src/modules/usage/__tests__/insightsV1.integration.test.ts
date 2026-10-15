// SPDX-License-Identifier: AGPL-3.0-only
import { describe, expect, it } from 'vitest'

import { approvals, runStatsDaily } from '@/database/tables/index.js'
import {
  ERROR_CODES,
  insightsBreakdownDtoSchema,
  insightsOverviewDtoSchema,
  insightsRunsOverviewDtoSchema,
  insightsRunsTimeseriesDtoSchema,
  type UsageEvent,
} from '@surefy/contracts'

import { authHeaders } from '../../../../test/helpers/auth.js'
import { expectData, expectError, request } from '../../../../test/helpers/request.js'
import { setupAgents, type AgentsSetup } from '../../agents/__tests__/agentsTestKit.js'
import { utcDay } from '../usage.utils.js'

const MINUTE_MS = 60_000
const DAY_MS = 86_400_000

const ago = (ms: number) => new Date(Date.now() - ms)
const dayAgo = (days: number) => utcDay(ago(days * DAY_MS))

const lastDays = (days: number) => ({
  from: ago(days * DAY_MS).toISOString(),
  to: new Date(Date.now() + MINUTE_MS).toISOString(),
  timeZone: 'UTC',
})

type Who = 'adam' | 'bella' | 'ben' | 'uma'

let seq = 0
const call = (over: Partial<UsageEvent>): UsageEvent => ({
  userId: null,
  teamId: null,
  apiKeyId: null,
  sourceModule: 'chat',
  subjectType: null,
  subjectId: null,
  sourceRefId: null,
  kind: 'generation',
  modelKey: 'openai/gpt-test',
  vaultModelId: null,
  credentialId: null,
  credentialScope: 'organization',
  providerKey: 'openai',
  inputTokens: 100,
  outputTokens: 50,
  cachedInputTokens: 0,
  reasoningTokens: 0,
  units: 0,
  costMicros: 1000,
  currency: 'USD',
  billedVia: 'provider_direct',
  latencyMs: 300,
  outcome: 'success',
  errorCode: null,
  routed: false,
  fallbackFromModelKey: null,
  piiMasked: false,
  dataLocation: 'provider',
  dedupeKey: `insights-v1:${++seq}`,
  requestId: null,
  occurredAt: ago(MINUTE_MS * 30).toISOString(),
  ...over,
})

/**
 * Bella's and Ben's agents (Builders of A) with run stats, metered calls and approvals; B has
 * stats of its own that A never sees.
 */
async function seed(setup: AgentsSetup) {
  const support = await setup.create('bella', { name: 'Support agent' })
  const billing = await setup.create('ben', { name: 'Billing agent' })
  const { a, b, db, container } = setup
  const stat = (orgId: string, subjectId: string, day: string, over = {}) => ({
    organizationId: orgId,
    day,
    subjectType: 'agent' as const,
    subjectId,
    currency: 'USD',
    ...over,
  })
  await db.tenant(a.id, async (tx) => {
    await tx.insert(runStatsDaily).values([
      // Support: 6 runs today (4 succeeded, 1 failed, 1 canceled), 2 two days ago (1 timed out)
      stat(a.id, support.id, dayAgo(0), {
        runsTotal: 6,
        runsSucceeded: 4,
        runsFailed: 1,
        runsCanceled: 1,
        runsNeededHuman: 2,
        durationMsSum: 60_000,
      }),
      stat(a.id, support.id, dayAgo(2), {
        runsTotal: 2,
        runsSucceeded: 1,
        runsTimedOut: 1,
        durationMsSum: 20_000,
      }),
      // Billing: 2 runs today, both succeeded; one more 20 days ago, outside a week
      stat(a.id, billing.id, dayAgo(0), {
        runsTotal: 2,
        runsSucceeded: 2,
        durationMsSum: 4_000,
      }),
      stat(a.id, billing.id, dayAgo(20), { runsTotal: 1, runsSucceeded: 1 }),
    ])
    const base = {
      organizationId: a.id,
      kind: 'ai_action' as const,
      title: 'Refund $340',
      payload: {
        version: 1 as const,
        kind: 'ai_action' as const,
        action: { name: 'payments.refund', input: {} },
        reasoning: [],
        sources: [],
        stepRef: { seq: 1 },
      },
    }
    await tx.insert(approvals).values([
      // Support: approved after 10 minutes, rejected after 30, one still pending
      {
        ...base,
        agentId: support.id,
        status: 'approved',
        resolvedBy: 'user',
        createdAt: ago(60 * MINUTE_MS),
        decidedAt: ago(50 * MINUTE_MS),
      },
      {
        ...base,
        agentId: support.id,
        status: 'rejected',
        resolvedBy: 'user',
        decisionReason: 'wrong_amount',
        createdAt: ago(60 * MINUTE_MS),
        decidedAt: ago(30 * MINUTE_MS),
      },
      { ...base, agentId: support.id, createdAt: ago(5 * MINUTE_MS) },
      // Billing: expired by its timeout
      {
        ...base,
        agentId: billing.id,
        status: 'expired',
        resolvedBy: 'timeout',
        createdAt: ago(120 * MINUTE_MS),
        decidedAt: ago(60 * MINUTE_MS),
      },
    ])
  })
  await db.tenant(b.id, (tx) =>
    tx.insert(runStatsDaily).values(stat(b.id, support.id, dayAgo(0), { runsTotal: 50 })),
  )
  const { bella, ben } = setup.builders
  const usage = [
    call({ userId: bella.id, sourceModule: 'agent', subjectType: 'agent', subjectId: support.id }),
    call({
      userId: ben.id,
      sourceModule: 'agent',
      subjectType: 'agent',
      subjectId: billing.id,
      costMicros: 3000,
    }),
    call({ userId: a.members.uma.id, costMicros: 500 }),
  ]
  for (const item of usage) {
    await db.tenant(a.id, (tx) => container.modules.usage.meter.recordInTx(tx, a.id, item))
  }
  return { support, billing }
}

async function reader(setup: AgentsSetup) {
  const headers: Record<Who, Awaited<ReturnType<typeof authHeaders>>> = {
    adam: setup.sessionOf(setup.a.members.adam),
    uma: setup.sessionOf(setup.a.members.uma),
    bella: await authHeaders(setup.app, setup.builders.bella),
    ben: await authHeaders(setup.app, setup.builders.ben),
  }
  return (who: Who, path: string, params: Record<string, string | string[]>) => {
    const query = new URLSearchParams()
    for (const [key, value] of Object.entries(params)) {
      for (const item of [value].flat()) query.append(key, item)
    }
    return request(
      setup.app,
      'GET',
      `/api/v1/orgs/${setup.a.id}/insights/${path}?${query.toString()}`,
      { headers: headers[who] },
    )
  }
}

describe('Insights V1: runs and approvals', () => {
  it('sums the runs and approvals of the organization for an Admin', async () => {
    const setup = await setupAgents()
    await seed(setup)
    const read = await reader(setup)

    const overview = expectData(
      await read('adam', 'runs-overview', lastDays(7)),
      200,
      insightsRunsOverviewDtoSchema,
    )
    // 10 runs in the week, 1 canceled: 7 succeeded of 9
    expect(overview).toMatchObject({
      runs: { state: 'value', value: 10 },
      successRateBp: { state: 'value', value: 7778 },
      averageDurationMs: { state: 'value', value: 8400 },
      hasRuns: true,
    })
    expect(overview.approvals).toEqual({
      state: 'value',
      value: {
        requested: 4,
        decidedByPeople: 2,
        approved: 1,
        rejected: 1,
        expired: 1,
        medianMinutesToDecide: 20,
      },
    })

    const month = expectData(
      await read('adam', 'runs-overview', lastDays(30)),
      200,
      insightsRunsOverviewDtoSchema,
    )
    expect(month.runs).toEqual({ state: 'value', value: 11 })
  })

  it('narrows a Builder to the agents they can edit', async () => {
    const setup = await setupAgents()
    const { support, billing } = await seed(setup)
    const read = await reader(setup)

    const bella = expectData(
      await read('bella', 'runs-overview', lastDays(7)),
      200,
      insightsRunsOverviewDtoSchema,
    )
    expect(bella.runs).toEqual({ state: 'value', value: 8 })
    expect(bella.approvals).toMatchObject({
      value: { requested: 3, decidedByPeople: 2, expired: 0 },
    })

    // asking for someone else's agent gives nothing, never their numbers
    const other = expectData(
      await read('bella', 'runs-overview', { ...lastDays(7), agentId: billing.id }),
      200,
      insightsRunsOverviewDtoSchema,
    )
    expect(other.runs).toEqual({ state: 'value', value: 0 })
    expect(other.successRateBp).toEqual({ state: 'value', value: null })

    // usage: only the calls of her agent; chat answers are restricted
    const usage = expectData(
      await read('bella', 'overview', lastDays(7)),
      200,
      insightsOverviewDtoSchema,
    )
    expect(usage.messages).toEqual({ state: 'restricted' })
    expect(usage.cost).toEqual({ state: 'value', value: [{ currency: 'USD', costMicros: 1000 }] })
    expect(usage.activePeople).toEqual({ state: 'value', value: 1 })

    const byAgent = expectData(
      await read('ben', 'breakdown', { ...lastDays(7), by: 'agent' }),
      200,
      insightsBreakdownDtoSchema,
    )
    expect(byAgent.rows).toEqual([
      expect.objectContaining({ key: billing.id, label: 'Billing agent', requests: 1 }),
    ])
    expect(byAgent.rows.some((row) => row.key === support.id)).toBe(false)
  })

  it('breaks cost down by agent and filters by agent for an Admin', async () => {
    const setup = await setupAgents()
    const { support, billing } = await seed(setup)
    const read = await reader(setup)

    const byAgent = expectData(
      await read('adam', 'breakdown', { ...lastDays(7), by: 'agent' }),
      200,
      insightsBreakdownDtoSchema,
    )
    expect(byAgent.rows.map((row) => [row.key, row.label, row.model])).toEqual([
      [billing.id, 'Billing agent', null],
      [support.id, 'Support agent', null],
      // the chat call is outside any agent
      [null, null, null],
    ])

    const filtered = expectData(
      await read('adam', 'overview', { ...lastDays(7), agentId: support.id }),
      200,
      insightsOverviewDtoSchema,
    )
    expect(filtered.cost).toEqual({
      state: 'value',
      value: [{ currency: 'USD', costMicros: 1000 }],
    })
    expect(filtered.messages).toEqual({ state: 'value', value: 0 })
  })

  it('returns runs over time by outcome, every day included', async () => {
    const setup = await setupAgents()
    const { support } = await seed(setup)
    const read = await reader(setup)

    const series = expectData(
      await read('adam', 'runs-timeseries', { ...lastDays(3), agentId: support.id }),
      200,
      insightsRunsTimeseriesDtoSchema,
    )
    expect(series.interval).toBe('day')
    expect(series.points.map((point) => point.start.slice(0, 10))).toEqual([
      dayAgo(3),
      dayAgo(2),
      dayAgo(1),
      dayAgo(0),
    ])
    expect(series.points.map(({ start: _, ...counts }) => counts)).toEqual([
      { succeeded: 0, failed: 0, canceled: 0, neededHuman: 0 },
      // a timed-out run counts as failed
      { succeeded: 1, failed: 1, canceled: 0, neededHuman: 0 },
      { succeeded: 0, failed: 0, canceled: 0, neededHuman: 0 },
      { succeeded: 4, failed: 1, canceled: 1, neededHuman: 2 },
    ])
  })

  it('says when nothing has run yet, and refuses people without Insights', async () => {
    const setup = await setupAgents()
    const read = await reader(setup)

    const empty = expectData(
      await read('adam', 'runs-overview', lastDays(7)),
      200,
      insightsRunsOverviewDtoSchema,
    )
    expect(empty).toMatchObject({
      runs: { state: 'value', value: 0 },
      successRateBp: { state: 'value', value: null },
      averageDurationMs: { state: 'value', value: null },
      hasRuns: false,
    })
    expectError(await read('uma', 'runs-overview', lastDays(7)), 403, ERROR_CODES.ACCESS_FORBIDDEN)
    expectError(
      await read('uma', 'runs-timeseries', lastDays(7)),
      403,
      ERROR_CODES.ACCESS_FORBIDDEN,
    )
    expectError(
      await read('adam', 'runs-timeseries', { ...lastDays(7), interval: 'hour' }),
      422,
      ERROR_CODES.VALIDATION_FAILED,
    )
  })
})
