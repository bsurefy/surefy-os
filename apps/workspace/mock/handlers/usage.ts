// SPDX-License-Identifier: AGPL-3.0-only
import type {
  InsightsBreakdownDimension,
  InsightsBreakdownDto,
  InsightsBreakdownRowDto,
  InsightsCostDto,
  InsightsInterval,
  InsightsOverviewDto,
  InsightsTotalsDto,
  ModelRefDto,
  UsageSourceModule,
} from '@surefy/contracts'
import {
  insightsBreakdownDtoSchema,
  insightsOverviewDtoSchema,
  insightsTimeseriesDtoSchema,
  localModelKey,
  okResponse,
  ERROR_CODES,
} from '@surefy/contracts'
import {
  defineMockDomain,
  defineMockHandler,
  mockError,
  mockOk,
} from '@surefy/web-core/testing/mock'

import { MAYA, OMAR } from './shell.fixtures'
import { ANA, SALES_TEAM_ID, SUPPORT_TEAM_ID } from './teams'
import { OLLAMA_SERVER_ID } from './vault'

const HOUR_MS = 3_600_000
const DAY_MS = 24 * HOUR_MS
/** Calls are spread over three times of the (UTC) day. */
const SLOT_HOURS = [9, 13, 17] as const
const DEFAULT_LIMIT = 10

const TEAMS: Record<string, string> = { [SUPPORT_TEAM_ID]: 'Support', [SALES_TEAM_ID]: 'Sales' }
const PEOPLE: Record<string, string> = {
  [MAYA.id]: MAYA.name,
  [OMAR.id]: OMAR.name,
  [ANA.id]: ANA.name,
}

const GPT: ModelRefDto = {
  modelKey: 'openai/gpt-4.1',
  displayName: 'GPT-4.1',
  providerKey: 'openai',
  source: 'provider',
}
const GPT_MINI: ModelRefDto = {
  modelKey: 'openai/gpt-4.1-mini',
  displayName: 'GPT-4.1 mini',
  providerKey: 'openai',
  source: 'provider',
}
const CLAUDE: ModelRefDto = {
  modelKey: 'anthropic/claude-sonnet-4',
  displayName: 'Claude Sonnet 4',
  providerKey: 'anthropic',
  source: 'provider',
}
const LLAMA: ModelRefDto = {
  modelKey: localModelKey(OLLAMA_SERVER_ID, 'llama3.1:70b'),
  displayName: 'llama3.1:70b',
  providerKey: 'ollama',
  source: 'local',
}
const MODELS = [GPT, GPT_MINI, CLAUDE, LLAMA]

/** Who calls which model, and what one request costs (micros of USD; local models are free). */
interface Stream {
  userId: string | null
  teamId: string | null
  model: ModelRefDto
  sourceModule: UsageSourceModule
  costPerRequest: number
}

const STREAMS: readonly Stream[] = [
  {
    userId: MAYA.id,
    teamId: SUPPORT_TEAM_ID,
    model: GPT,
    sourceModule: 'chat',
    costPerRequest: 4200,
  },
  {
    userId: MAYA.id,
    teamId: SUPPORT_TEAM_ID,
    model: CLAUDE,
    sourceModule: 'chat',
    costPerRequest: 6100,
  },
  {
    userId: OMAR.id,
    teamId: SALES_TEAM_ID,
    model: GPT_MINI,
    sourceModule: 'chat',
    costPerRequest: 900,
  },
  {
    userId: ANA.id,
    teamId: SUPPORT_TEAM_ID,
    model: LLAMA,
    sourceModule: 'chat',
    costPerRequest: 0,
  },
  // an API key: no person, no team
  { userId: null, teamId: null, model: GPT_MINI, sourceModule: 'agent', costPerRequest: 900 },
]

interface UsageRow extends Stream {
  at: number
  requests: number
  inputTokens: number
  outputTokens: number
  cachedInputTokens: number
  costMicros: number
}

/** The same numbers for the same instant, whatever range is asked for. */
function rowsBetween(from: number, to: number): UsageRow[] {
  const rows: UsageRow[] = []
  for (let day = Math.floor(from / DAY_MS); day * DAY_MS < to; day += 1) {
    for (const [slot, hour] of SLOT_HOURS.entries()) {
      const at = day * DAY_MS + hour * HOUR_MS
      if (at < from || at >= to) continue
      for (const [index, stream] of STREAMS.entries()) {
        const requests = 1 + ((day * 31 + index * 17 + slot * 7) % 6)
        rows.push({
          ...stream,
          at,
          requests,
          inputTokens: requests * 900,
          outputTokens: requests * 350,
          cachedInputTokens: stream.model.providerKey === 'openai' ? requests * 100 : 0,
          costMicros: requests * stream.costPerRequest,
        })
      }
    }
  }
  return rows
}

function filtered(params: URLSearchParams): UsageRow[] {
  const from = Date.parse(params.get('from') ?? '')
  const to = Date.parse(params.get('to') ?? '')
  const team = params.getAll('teamId')
  const user = params.getAll('userId')
  const model = params.getAll('modelKey')
  const source = params.getAll('sourceModule')
  return rowsBetween(from, to).filter(
    (row) =>
      (team.length === 0 || (row.teamId !== null && team.includes(row.teamId))) &&
      (user.length === 0 || (row.userId !== null && user.includes(row.userId))) &&
      (model.length === 0 || model.includes(row.model.modelKey)) &&
      (source.length === 0 || source.includes(row.sourceModule)),
  )
}

const emptyTotals = (): InsightsTotalsDto => ({
  requests: 0,
  inputTokens: 0,
  outputTokens: 0,
  cachedInputTokens: 0,
  cost: [],
})

function add(
  into: InsightsTotalsDto,
  row: Pick<
    UsageRow,
    'requests' | 'inputTokens' | 'outputTokens' | 'cachedInputTokens' | 'costMicros'
  >,
) {
  into.requests += row.requests
  into.inputTokens += row.inputTokens
  into.outputTokens += row.outputTokens
  into.cachedInputTokens += row.cachedInputTokens
  if (row.costMicros === 0) return
  const usd = into.cost[0]
  if (usd) usd.costMicros += row.costMicros
  else into.cost.push({ currency: 'USD', costMicros: row.costMicros })
}

const costOf = (rows: readonly UsageRow[]): InsightsCostDto => {
  const total = rows.reduce((sum, row) => sum + row.costMicros, 0)
  return total === 0 ? [] : [{ currency: 'USD', costMicros: total }]
}

function overview(params: URLSearchParams, now = new Date()): InsightsOverviewDto {
  const rows = filtered(params)
  const monthStart = Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1)
  const month = new URLSearchParams(params)
  month.set('from', new Date(monthStart).toISOString())
  month.set('to', now.toISOString())
  return {
    messages: {
      state: 'value',
      value: rows
        .filter((row) => row.sourceModule === 'chat')
        .reduce((sum, row) => sum + row.requests, 0),
    },
    activePeople: {
      state: 'value',
      value: new Set(rows.map((row) => row.userId).filter((id) => id !== null)).size,
    },
    tokens: {
      state: 'value',
      value: rows.reduce((sum, row) => sum + row.inputTokens + row.outputTokens, 0),
    },
    cost: { state: 'value', value: costOf(rows) },
    costThisMonth: { state: 'value', value: costOf(filtered(month)) },
    hasUsage: true,
    unpricedModels: [],
    dataThrough: new Date(Math.floor(now.getTime() / HOUR_MS) * HOUR_MS).toISOString(),
  }
}

const KEY_OF: Record<InsightsBreakdownDimension, (row: UsageRow) => string | null> = {
  team: (row) => row.teamId,
  person: (row) => row.userId,
  model: (row) => row.model.modelKey,
}

function labelOf(by: InsightsBreakdownDimension, key: string): string | null {
  if (by === 'team') return TEAMS[key] ?? null
  if (by === 'person') return PEOPLE[key] ?? null
  return MODELS.find((model) => model.modelKey === key)?.displayName ?? null
}

function breakdown(params: URLSearchParams): InsightsBreakdownDto {
  const by = (params.get('by') ?? 'team') as InsightsBreakdownDimension
  const limit = Number(params.get('limit') ?? DEFAULT_LIMIT)
  const sort = params.get('sort') ?? 'cost'
  const groups = new Map<string | null, InsightsBreakdownRowDto>()
  const total = emptyTotals()
  for (const row of filtered(params)) {
    const key = KEY_OF[by](row)
    let group = groups.get(key)
    if (!group) {
      group = {
        ...emptyTotals(),
        key,
        label: key === null ? null : labelOf(by, key),
        model: by === 'model' ? row.model : null,
        isLocal: true,
      }
      groups.set(key, group)
    }
    group.isLocal &&= row.model.source === 'local'
    add(group, row)
    add(total, row)
  }
  const measure = (group: InsightsBreakdownRowDto) => {
    if (sort === 'tokens') return group.inputTokens + group.outputTokens
    if (sort === 'requests') return group.requests
    return group.cost[0]?.costMicros ?? 0
  }
  const ranked = [...groups.values()].sort((a, b) => measure(b) - measure(a))
  const rest = ranked.slice(limit)
  const others = emptyTotals()
  for (const group of rest) {
    add(others, { ...group, costMicros: group.cost[0]?.costMicros ?? 0 })
  }
  return {
    by,
    rows: ranked.slice(0, limit),
    others: rest.length > 0 ? { ...others, groupCount: rest.length } : null,
    total,
  }
}

function bucketStart(at: number, interval: InsightsInterval): number {
  const date = new Date(at)
  if (interval === 'hour') return Math.floor(at / HOUR_MS) * HOUR_MS
  if (interval === 'day') return Math.floor(at / DAY_MS) * DAY_MS
  if (interval === 'month') return Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), 1)
  const day = Math.floor(at / DAY_MS) * DAY_MS
  return day - ((date.getUTCDay() + 6) % 7) * DAY_MS // weeks start on Monday
}

function nextBucket(start: number, interval: InsightsInterval): number {
  if (interval === 'hour') return start + HOUR_MS
  if (interval === 'day') return start + DAY_MS
  if (interval === 'week') return start + 7 * DAY_MS
  const date = new Date(start)
  return Date.UTC(date.getUTCFullYear(), date.getUTCMonth() + 1, 1)
}

function timeseries(params: URLSearchParams) {
  const interval = (params.get('interval') ?? 'day') as InsightsInterval
  const from = Date.parse(params.get('from') ?? '')
  const to = Date.parse(params.get('to') ?? '')
  const points = new Map<number, InsightsTotalsDto & { start: string }>()
  for (let start = bucketStart(from, interval); start < to; start = nextBucket(start, interval)) {
    points.set(start, { ...emptyTotals(), start: new Date(start).toISOString() })
  }
  for (const row of filtered(params)) {
    const point = points.get(bucketStart(row.at, interval))
    if (point) add(point, row)
  }
  return { interval, points: [...points.values()] }
}

const HTTP_UNAVAILABLE = 503
const chartError = () =>
  mockError(HTTP_UNAVAILABLE, ERROR_CODES.SERVICE_UNAVAILABLE, 'Usage is unavailable')

const searchOf = (request: Request) => new URL(request.url).searchParams
const path = '/orgs/:orgId/insights'

/**
 * Insights › Overview on synthetic usage: three people in two teams and an API key, on three cloud
 * models and a local one, three times a day; the same instant always has the same numbers.
 * Scenarios: `empty` is an organization without usage; `restricted` hides the cost KPIs;
 * `unpriced` flags a model without a known price; `chart-error` fails both charts while the KPIs
 * load (a partial failure). Live on the real API (B3-04's routes, I4-06); the handlers stay for
 * component tests and for `MOCK_DOMAINS=usage`, to look at the states.
 */
export const usageDomain = defineMockDomain(
  'usage',
  [
    defineMockHandler({
      method: 'get',
      path: `${path}/overview`,
      response: okResponse(insightsOverviewDtoSchema),
      scenarios: {
        default: ({ request }) => mockOk(overview(searchOf(request))),
        empty: () =>
          mockOk({
            messages: { state: 'value', value: 0 },
            activePeople: { state: 'value', value: 0 },
            tokens: { state: 'value', value: 0 },
            cost: { state: 'value', value: [] },
            costThisMonth: { state: 'value', value: [] },
            hasUsage: false,
            unpricedModels: [],
            dataThrough: null,
          } satisfies InsightsOverviewDto),
        restricted: ({ request }) =>
          mockOk({
            ...overview(searchOf(request)),
            cost: { state: 'restricted' },
            costThisMonth: { state: 'restricted' },
          } satisfies InsightsOverviewDto),
        unpriced: ({ request }) =>
          mockOk({
            ...overview(searchOf(request)),
            unpricedModels: [CLAUDE],
          } satisfies InsightsOverviewDto),
      },
    }),
    defineMockHandler({
      method: 'get',
      path: `${path}/breakdown`,
      response: okResponse(insightsBreakdownDtoSchema),
      scenarios: {
        default: ({ request }) => mockOk(breakdown(searchOf(request))),
        empty: ({ request }) =>
          mockOk({
            by: (searchOf(request).get('by') ?? 'team') as InsightsBreakdownDimension,
            rows: [],
            others: null,
            total: emptyTotals(),
          } satisfies InsightsBreakdownDto),
        'chart-error': chartError,
      },
    }),
    defineMockHandler({
      method: 'get',
      path: `${path}/timeseries`,
      response: okResponse(insightsTimeseriesDtoSchema),
      scenarios: {
        default: ({ request }) => mockOk(timeseries(searchOf(request))),
        'chart-error': chartError,
      },
    }),
  ],
  { isLive: true },
)
