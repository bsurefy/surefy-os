// SPDX-License-Identifier: AGPL-3.0-only
import { sql } from 'drizzle-orm'
import { describe, expect, it } from 'vitest'

import {
  ERROR_CODES,
  insightsBreakdownDtoSchema,
  insightsOverviewDtoSchema,
  insightsTimeseriesDtoSchema,
  teamDtoSchema,
  type UsageEvent,
} from '@surefy/contracts'

import { setupTwoOrgs, type TwoOrgSetup } from '../../../../test/helpers/orgSetup.js'
import { expectData, expectError, request } from '../../../../test/helpers/request.js'
import { USAGE_WATERMARK_CACHE_KEY } from '../usage.constants.js'
import { utcDay } from '../usage.utils.js'

const HOUR_MS = 3_600_000
const DAY_MS = 86_400_000

const ago = (ms: number) => new Date(Date.now() - ms).toISOString()

let seq = 0
const event = (over: Partial<UsageEvent>): UsageEvent => ({
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
  dedupeKey: `chat:test-${++seq}:0`,
  requestId: null,
  occurredAt: ago(HOUR_MS),
  ...over,
})

async function meter(setup: TwoOrgSetup, orgId: string, events: UsageEvent[]) {
  const { container } = setup
  const inserted: boolean[] = []
  for (const item of events) {
    inserted.push(
      await container.db.tenant(orgId, (tx) =>
        container.modules.usage.meter.recordInTx(tx, orgId, item),
      ),
    )
  }
  return inserted
}

async function createTeam(setup: TwoOrgSetup, name: string, memberUserIds: string[]) {
  return expectData(
    await request(setup.app, 'POST', `/api/v1/orgs/${setup.a.id}/teams`, {
      headers: setup.sessionOf(setup.a.members.olivia),
      payload: { name, memberUserIds },
    }),
    201,
    teamDtoSchema,
  )
}

function insights(
  setup: TwoOrgSetup,
  path: 'overview' | 'breakdown' | 'timeseries',
  params: Record<string, string | string[]>,
  member = setup.a.members.adam,
) {
  const query = new URLSearchParams()
  for (const [key, value] of Object.entries(params)) {
    for (const item of [value].flat()) query.append(key, item)
  }
  return request(
    setup.app,
    'GET',
    `/api/v1/orgs/${setup.a.id}/insights/${path}?${query.toString()}`,
    {
      headers: setup.sessionOf(member),
    },
  )
}

const lastDays = (days: number, timeZone = 'UTC') => ({
  from: ago(days * DAY_MS),
  to: new Date(Date.now() + 60_000).toISOString(),
  timeZone,
})

const count = async (setup: TwoOrgSetup, query: ReturnType<typeof sql>) =>
  setup.container.db.system('test', async (tx) => {
    const result = await tx.execute<{ n: string }>(query)
    return Number(result.rows[0]?.n ?? 0)
  })

/** Two people in A (adam in Finance, uma without a team) and one call in B. */
async function seedUsage(setup: TwoOrgSetup) {
  const { adam, uma } = setup.a.members
  const finance = await createTeam(setup, 'Finance', [adam.id])
  await meter(setup, setup.a.id, [
    event({ userId: adam.id, teamId: finance.id, occurredAt: ago(HOUR_MS) }),
    event({ userId: adam.id, teamId: finance.id, occurredAt: ago(2 * DAY_MS), costMicros: 2000 }),
    event({ userId: uma.id, modelKey: 'anthropic/claude-test', providerKey: 'anthropic' }),
    event({
      userId: uma.id,
      modelKey: 'ollama/llama',
      providerKey: 'ollama',
      credentialScope: 'local',
      billedVia: 'local',
      dataLocation: 'local',
      costMicros: 0,
    }),
    event({ userId: uma.id, kind: 'embedding', sourceModule: 'knowledge', outputTokens: 0 }),
    event({ userId: adam.id, teamId: finance.id, occurredAt: ago(20 * DAY_MS), costMicros: 5000 }),
  ])
  await meter(setup, setup.b.id, [event({ userId: setup.b.members.bea.id, costMicros: 9999 })])
  return { finance }
}

describe('usage meter', () => {
  it('records each call once per dedupe key', async () => {
    const setup = await setupTwoOrgs()
    const call = event({ userId: setup.a.members.adam.id })
    expect(await meter(setup, setup.a.id, [call, call])).toEqual([true, false])
    expect(await count(setup, sql`select count(*) as n from usage_events`)).toBe(1)
  })

  it('rejects a row whose billing does not match its credential', async () => {
    const setup = await setupTwoOrgs()
    expect(await meter(setup, setup.a.id, [event({ billedVia: 'local' })])).toEqual([false])
    expect(await count(setup, sql`select count(*) as n from usage_events`)).toBe(0)
  })

  it('keeps usage events append-only for the app', async () => {
    const setup = await setupTwoOrgs()
    await meter(setup, setup.a.id, [event({})])
    await expect(
      setup.container.db.tenant(setup.a.id, (tx) =>
        tx.execute(sql`update usage_events set cost_micros = 0`),
      ),
    ).rejects.toThrow()
  })
})

describe('usage rollups', () => {
  it('builds daily and monthly totals and moves the watermark', async () => {
    const setup = await setupTwoOrgs()
    const { finance } = await seedUsage(setup)
    const { usage } = setup.container.modules

    const first = await usage.rollup.aggregate('hourly')
    expect(first.days).toBeGreaterThanOrEqual(21)
    const daily = await count(setup, sql`select count(*) as n from usage_daily`)
    const total = await count(setup, sql`select sum(requests) as n from usage_daily`)
    expect(total).toBe(7)
    expect(
      await count(
        setup,
        sql`select sum(cost_micros) as n from usage_monthly
            where scope = 'team' and scope_id = ${finance.id}`,
      ),
    ).toBe(8000)
    expect(
      await count(
        setup,
        sql`select sum(cost_micros) as n from usage_monthly
            where scope = 'organization' and organization_id = ${setup.b.id}`,
      ),
    ).toBe(9999)

    // a second run rebuilds the same days without doubling them
    const second = await usage.rollup.aggregate('hourly')
    expect(second.days).toBeLessThanOrEqual(4)
    expect(await count(setup, sql`select count(*) as n from usage_daily`)).toBe(daily)
    expect(await count(setup, sql`select sum(requests) as n from usage_daily`)).toBe(7)
    expect(await setup.container.cache.get(USAGE_WATERMARK_CACHE_KEY)).toEqual(expect.any(String))
  })

  it('picks up late events in the nightly run', async () => {
    const setup = await setupTwoOrgs()
    const { usage } = setup.container.modules
    await meter(setup, setup.a.id, [event({ occurredAt: ago(HOUR_MS) })])
    await usage.rollup.aggregate('hourly')
    // written now with an event time five days back: past the hourly window, inside the nightly one
    await meter(setup, setup.a.id, [event({ occurredAt: ago(5 * DAY_MS) })])
    await usage.rollup.aggregate('hourly')
    expect(await count(setup, sql`select sum(requests) as n from usage_daily`)).toBe(1)
    await usage.rollup.aggregate('nightly')
    expect(await count(setup, sql`select sum(requests) as n from usage_daily`)).toBe(2)
  })
})

describe('Insights endpoints', () => {
  it('answers short ranges from the events, in the caller time zone', async () => {
    const setup = await setupTwoOrgs()
    await seedUsage(setup)
    const overview = expectData(
      await insights(setup, 'overview', lastDays(7, 'Europe/Berlin')),
      200,
      insightsOverviewDtoSchema,
    )
    expect(overview.hasUsage).toBe(true)
    // chat answers: adam twice, uma twice (the embedding is knowledge)
    expect(overview.messages).toEqual({ state: 'value', value: 4 })
    expect(overview.activePeople).toEqual({ state: 'value', value: 2 })
    expect(overview.tokens).toEqual({ state: 'value', value: 4 * 150 + 100 })
    expect(overview.cost).toEqual({
      state: 'value',
      value: [{ currency: 'USD', costMicros: 1000 + 2000 + 1000 + 1000 }],
    })
    // B's usage never shows up in A's numbers
    expect(JSON.stringify(overview)).not.toContain('9999')
  })

  it('answers long ranges from the rollups and filters by team', async () => {
    const setup = await setupTwoOrgs()
    const { finance } = await seedUsage(setup)
    const before = expectData(
      await insights(setup, 'overview', lastDays(30)),
      200,
      insightsOverviewDtoSchema,
    )
    expect(before.messages).toEqual({ state: 'value', value: 0 })

    await setup.container.modules.usage.rollup.aggregate('hourly')
    const after = expectData(
      await insights(setup, 'overview', { ...lastDays(30), teamId: finance.id }),
      200,
      insightsOverviewDtoSchema,
    )
    expect(after.messages).toEqual({ state: 'value', value: 3 })
    expect(after.cost).toEqual({ state: 'value', value: [{ currency: 'USD', costMicros: 8000 }] })
    expect(after.dataThrough).toEqual(expect.any(String))

    const sameMonth = (at: number) => utcDay(new Date(Date.now() - at)).slice(0, 7)
    const thisMonth = utcDay(new Date()).slice(0, 7)
    const expected = [HOUR_MS, 2 * DAY_MS, 20 * DAY_MS]
      .map((at, index) => (sameMonth(at) === thisMonth ? ([1000, 2000, 5000][index] ?? 0) : 0))
      .reduce((sum, value) => sum + value, 0)
    // the current hour may not be rolled up yet when the hour turned during the test
    const month = after.costThisMonth.state === 'value' ? after.costThisMonth.value : []
    expect(month.reduce((sum, entry) => sum + entry.costMicros, 0)).toBeLessThanOrEqual(expected)
  })

  it('breaks cost down by team, person and model', async () => {
    const setup = await setupTwoOrgs()
    const { finance } = await seedUsage(setup)
    const byTeam = expectData(
      await insights(setup, 'breakdown', { ...lastDays(7), by: 'team' }),
      200,
      insightsBreakdownDtoSchema,
    )
    // largest cost first: Finance 3000 (adam), then no team 2000 (uma)
    expect(byTeam.rows.map((row) => [row.key, row.label])).toEqual([
      [finance.id, 'Finance'],
      [null, null],
    ])
    expect(byTeam.total.requests).toBe(5)
    expect(byTeam.others).toBeNull()

    const byPerson = expectData(
      await insights(setup, 'breakdown', { ...lastDays(7), by: 'person', limit: '1' }),
      200,
      insightsBreakdownDtoSchema,
    )
    expect(byPerson.rows).toHaveLength(1)
    expect(byPerson.rows[0]?.label).toBe(setup.a.members.adam.name)
    expect(byPerson.others?.groupCount).toBe(1)
    expect(byPerson.others?.requests).toBe(3)

    const byModel = expectData(
      await insights(setup, 'breakdown', { ...lastDays(7), by: 'model', sort: 'requests' }),
      200,
      insightsBreakdownDtoSchema,
    )
    const local = byModel.rows.find((row) => row.key === 'ollama/llama')
    expect(local?.isLocal).toBe(true)
    expect(local?.cost).toEqual([])
    expect(byModel.rows[0]?.key).toBe('openai/gpt-test')
  })

  it('returns every bucket of a series, empty ones included', async () => {
    const setup = await setupTwoOrgs()
    await seedUsage(setup)
    const daily = expectData(
      await insights(setup, 'timeseries', { ...lastDays(7), interval: 'day' }),
      200,
      insightsTimeseriesDtoSchema,
    )
    expect(daily.points.length).toBeGreaterThanOrEqual(8)
    expect(daily.points.reduce((sum, point) => sum + point.requests, 0)).toBe(5)
    expect(daily.points.some((point) => point.requests === 0)).toBe(true)

    const hourly = expectData(
      await insights(setup, 'timeseries', { ...lastDays(1), interval: 'hour' }),
      200,
      insightsTimeseriesDtoSchema,
    )
    expect(hourly.points.length).toBeGreaterThanOrEqual(24)
    expect(hourly.points.reduce((sum, point) => sum + point.requests, 0)).toBe(4)
  })

  it('refuses people without insights:read and unknown time zones', async () => {
    const setup = await setupTwoOrgs()
    expectError(
      await insights(setup, 'overview', lastDays(7), setup.a.members.uma),
      403,
      ERROR_CODES.ACCESS_FORBIDDEN,
    )
    expectError(
      await insights(setup, 'overview', lastDays(7, 'Mars/Olympus')),
      422,
      ERROR_CODES.VALIDATION_FAILED,
    )
    const empty = expectData(
      await insights(setup, 'overview', lastDays(7)),
      200,
      insightsOverviewDtoSchema,
    )
    expect(empty.hasUsage).toBe(false)
  })
})

describe('usage for Vault and exports', () => {
  it('sums spend and people per key this month', async () => {
    const setup = await setupTwoOrgs()
    const credentialId = '0190a5c4-0000-7000-8000-00000000c0de'
    await meter(setup, setup.a.id, [
      event({ userId: setup.a.members.adam.id, credentialId, occurredAt: ago(60_000) }),
      event({ userId: setup.a.members.uma.id, credentialId, occurredAt: ago(60_000) }),
    ])
    const { usage } = setup.container.modules
    await usage.rollup.aggregate('hourly')
    const { spend, people } = await setup.container.db.tenant(setup.a.id, async (tx) => ({
      spend: await usage.vaultUsage.spendThisMonth(tx, setup.a.id, [credentialId]),
      people: await usage.vaultUsage.usersThisMonth(tx, setup.a.id, credentialId),
    }))
    // a minute ago can be last month only in the first minute of a month
    if (utcDay(new Date(Date.now() - 60_000)).slice(0, 7) === utcDay(new Date()).slice(0, 7)) {
      expect(spend.get(credentialId)).toEqual([{ currency: 'USD', costMicros: 2000 }])
      expect(people).toBe(2)
    }
  })

  it('produces the usage CSV with the chosen columns and filters', async () => {
    const setup = await setupTwoOrgs()
    const { finance } = await seedUsage(setup)
    const { usage } = setup.container.modules
    await usage.rollup.aggregate('hourly')
    const [producer] = usage.exportProducers
    if (producer === undefined) throw new Error('the usage module has a producer')
    const table = await setup.container.db.tenant(setup.a.id, (tx) =>
      producer.produce(tx, {
        orgId: setup.a.id,
        params: {
          version: 1,
          format: 'csv',
          filters: { teamId: [finance.id] },
          columns: ['team', 'person', 'requests', 'cost', 'currency'],
        },
      }),
    )
    expect(table.columns).toEqual(['team', 'person', 'requests', 'cost', 'currency'])
    expect(table.rows.map((row) => row[0])).toEqual(table.rows.map(() => 'Finance'))
    expect(table.rows.reduce((sum, row) => sum + Number(row[2]), 0)).toBe(3)
    expect(table.rows.map((row) => row[3])).toContain('0.005000')
  })
})
