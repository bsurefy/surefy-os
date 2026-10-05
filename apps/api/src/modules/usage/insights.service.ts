// SPDX-License-Identifier: AGPL-3.0-only
import { UnprocessableError } from '@/core/errors/index.js'
import {
  ERROR_CODES,
  type InsightsBreakdownDto,
  type InsightsBreakdownQuery,
  type InsightsBreakdownRowDto,
  type InsightsCostDto,
  type InsightsFilters,
  type InsightsOverviewDto,
  type InsightsOverviewQuery,
  type InsightsTimeseriesDto,
  type InsightsTimeseriesQuery,
  type InsightsTotalsDto,
  type ModelRefDto,
} from '@surefy/contracts'

import { EVENTS_RANGE_MAX_MS, USAGE_WATERMARK_CACHE_KEY } from './usage.constants.js'
import { asPickerSource } from './usage.types.js'
import { isTimeZone, utcDay, utcDayRange } from './usage.utils.js'

import type { TotalsRow, UsageRepository, UsageSource } from './usage.repository.js'
import type {
  UsageContext,
  UsageModelRow,
  UsageModels,
  UsageTeams,
  UsageUserRefs,
} from './usage.types.js'
import type { Cache } from '@/core/cache/index.js'
import type { Database, DbExecutor } from '@/core/database/index.js'

export interface InsightsServiceDeps {
  db: Database
  cache: Cache
  repository: UsageRepository
  teams: UsageTeams
  users: UsageUserRefs
  models: UsageModels
  now?: () => Date
}

interface Range {
  from: string
  to: string
  timeZone: string
}

const DAY_MS = 86_400_000

const filtersOf = (query: InsightsFilters): InsightsFilters => ({
  teamId: query.teamId,
  userId: query.userId,
  modelKey: query.modelKey,
  sourceModule: query.sourceModule,
})

const emptyTotals = (): InsightsTotalsDto => ({
  requests: 0,
  inputTokens: 0,
  outputTokens: 0,
  cachedInputTokens: 0,
  cost: [],
})

/** Adds one currency's totals into a group's totals. */
function addTotals(
  into: InsightsTotalsDto,
  row: Omit<TotalsRow, 'currency'> & { currency: string | null },
) {
  into.requests += row.requests
  into.inputTokens += row.inputTokens
  into.outputTokens += row.outputTokens
  into.cachedInputTokens += row.cachedInputTokens
  if (row.currency === null || row.costMicros === 0) return
  const cost = into.cost.find((entry) => entry.currency === row.currency)
  if (cost === undefined) into.cost.push({ currency: row.currency, costMicros: row.costMicros })
  else cost.costMicros += row.costMicros
}

const costTotal = (cost: InsightsCostDto) => cost.reduce((sum, entry) => sum + entry.costMicros, 0)

const refOf = (model: UsageModelRow): ModelRefDto => ({
  modelKey: model.modelKey,
  displayName: model.displayName,
  providerKey: model.providerKey,
  source: asPickerSource(model.source),
})

/**
 * Insights › Overview (design/workspace/insights.md): KPIs, cost by team, person and model, and
 * tokens and cost over time. "Today" and "7d" read the events with exact boundaries in the
 * caller's time zone; longer ranges read the daily rollup, whose days are UTC
 * (usage-budgets-and-audit.md, "Reading"). Private chats contribute numbers only.
 */
export class InsightsService {
  private readonly now: () => Date

  constructor(private readonly deps: InsightsServiceDeps) {
    this.now = deps.now ?? (() => new Date())
  }

  async overview(ctx: UsageContext, query: InsightsOverviewQuery): Promise<InsightsOverviewDto> {
    assertTimeZone(query.timeZone)
    const { repository } = this.deps
    const filters = filtersOf(query)
    const source = sourceFor(query)
    const today = utcDay(this.now())
    const thisMonth: UsageSource = {
      table: 'daily',
      fromDay: `${today.slice(0, 7)}-01`,
      toDay: utcDay(new Date(Date.parse(today) + DAY_MS)),
    }
    const result = await this.deps.db.tenant(ctx.orgId, async (tx) => {
      const [hasUsage, kpis, cost, costThisMonth, modelKeys] = [
        await repository.hasUsage(tx, ctx.orgId),
        await repository.kpis(tx, ctx.orgId, source, filters),
        await repository.cost(tx, ctx.orgId, source, filters),
        await repository.cost(tx, ctx.orgId, thisMonth, filters),
        await repository.providerModelKeys(tx, ctx.orgId, source, filters),
      ]
      const unpricedModels = (await this.deps.models.findByKeys(tx, ctx.orgId, modelKeys))
        .filter(
          (model) =>
            model.source === 'provider' &&
            (model.inputPricePerMtokMicros === null || model.outputPricePerMtokMicros === null),
        )
        .map(refOf)
      return { hasUsage, kpis, cost, costThisMonth, unpricedModels }
    })
    return {
      messages: { state: 'value', value: result.kpis.messages },
      activePeople: { state: 'value', value: result.kpis.activePeople },
      tokens: { state: 'value', value: result.kpis.tokens },
      cost: { state: 'value', value: result.cost },
      costThisMonth: { state: 'value', value: result.costThisMonth },
      hasUsage: result.hasUsage,
      unpricedModels: result.unpricedModels,
      dataThrough: await this.dataThrough(),
    }
  }

  async breakdown(ctx: UsageContext, query: InsightsBreakdownQuery): Promise<InsightsBreakdownDto> {
    assertTimeZone(query.timeZone)
    const source = sourceFor(query)
    const { rows, labels, models } = await this.deps.db.tenant(ctx.orgId, async (tx) => {
      const groupRows = await this.deps.repository.groups(
        tx,
        ctx.orgId,
        source,
        filtersOf(query),
        query.by,
      )
      const keys = [...new Set(groupRows.map((row) => row.key).filter((key) => key !== null))]
      return { rows: groupRows, ...(await this.labelsOf(tx, ctx.orgId, query.by, keys)) }
    })

    const groups = new Map<string | null, InsightsBreakdownRowDto>()
    const total = emptyTotals()
    for (const row of rows) {
      let group = groups.get(row.key)
      if (group === undefined) {
        const model = row.key === null ? null : (models.get(row.key) ?? null)
        group = {
          ...emptyTotals(),
          key: row.key,
          label: row.key === null ? null : (labels.get(row.key) ?? null),
          model,
          isLocal: row.isLocal,
        }
        groups.set(row.key, group)
      }
      group.isLocal &&= row.isLocal
      addTotals(group, row)
      addTotals(total, row)
    }

    const ranked = [...groups.values()].sort(rankBy(query.sort))
    const shown = ranked.slice(0, query.limit)
    const rest = ranked.slice(query.limit)
    let others: InsightsBreakdownDto['others'] = null
    if (rest.length > 0) {
      const sum = emptyTotals()
      for (const group of rest) {
        sum.requests += group.requests
        sum.inputTokens += group.inputTokens
        sum.outputTokens += group.outputTokens
        sum.cachedInputTokens += group.cachedInputTokens
        for (const cost of group.cost) addTotals(sum, { ...noCounts, ...cost })
      }
      others = { ...sum, groupCount: rest.length }
    }
    return { by: query.by, rows: shown, others, total }
  }

  async timeseries(
    ctx: UsageContext,
    query: InsightsTimeseriesQuery,
  ): Promise<InsightsTimeseriesDto> {
    assertTimeZone(query.timeZone)
    const source = sourceFor(query, query.interval === 'hour')
    // the daily rollup only knows UTC days, so its buckets are UTC too
    const timeZone = source.table === 'events' ? query.timeZone : 'UTC'
    const rows = await this.deps.db.tenant(ctx.orgId, (tx) =>
      this.deps.repository.buckets(tx, ctx.orgId, source, filtersOf(query), {
        from: query.from,
        to: query.to,
        timeZone,
        interval: query.interval,
      }),
    )
    const points = new Map<string, InsightsTotalsDto & { start: string }>()
    for (const row of rows) {
      let point = points.get(row.start)
      if (point === undefined) {
        point = { ...emptyTotals(), start: row.start }
        points.set(row.start, point)
      }
      addTotals(point, row)
    }
    return { interval: query.interval, points: [...points.values()] }
  }

  // ── Internals ─────────────────────────────────────────────────────────────────────────────────

  /** Display labels per group key, and the model refs for the model dimension. */
  private async labelsOf(
    tx: DbExecutor,
    orgId: string,
    by: InsightsBreakdownQuery['by'],
    keys: string[],
  ): Promise<{ labels: Map<string, string>; models: Map<string, ModelRefDto> }> {
    const labels = new Map<string, string>()
    const models = new Map<string, ModelRefDto>()
    if (keys.length === 0) return { labels, models }
    if (by === 'team') {
      for (const team of await this.deps.teams.findRefsInTx(tx, orgId, keys)) {
        labels.set(team.id, team.name)
      }
    } else if (by === 'person') {
      for (const [id, user] of await this.deps.users.findUserRefs(keys)) labels.set(id, user.name)
    } else {
      for (const model of await this.deps.models.findByKeys(tx, orgId, keys)) {
        labels.set(model.modelKey, model.displayName)
        models.set(model.modelKey, refOf(model))
      }
    }
    return { labels, models }
  }

  /** The instant the rollups are complete to, published by the last hourly run. */
  private async dataThrough(): Promise<string | null> {
    const value = await this.deps.cache.get<string>(USAGE_WATERMARK_CACHE_KEY)
    return typeof value === 'string' ? value : null
  }
}

const noCounts = { requests: 0, inputTokens: 0, outputTokens: 0, cachedInputTokens: 0 }

/** Largest first by the chosen measure, then by cost, then by key for a stable order. */
function rankBy(sort: InsightsBreakdownQuery['sort']) {
  const measure = (group: InsightsBreakdownRowDto) => {
    if (sort === 'cost') return costTotal(group.cost)
    if (sort === 'tokens') return group.inputTokens + group.outputTokens
    return group.requests
  }
  return (a: InsightsBreakdownRowDto, b: InsightsBreakdownRowDto) =>
    measure(b) - measure(a) ||
    costTotal(b.cost) - costTotal(a.cost) ||
    (a.key ?? '').localeCompare(b.key ?? '')
}

/** Events for short ranges (and hourly series), the daily rollup for longer ones. */
function sourceFor(range: Range, forceEvents = false): UsageSource {
  const span = Date.parse(range.to) - Date.parse(range.from)
  if (forceEvents || span <= EVENTS_RANGE_MAX_MS) {
    return { table: 'events', from: range.from, to: range.to }
  }
  return { table: 'daily', ...utcDayRange(range.from, range.to) }
}

function assertTimeZone(timeZone: string): void {
  if (isTimeZone(timeZone)) return
  throw new UnprocessableError(ERROR_CODES.VALIDATION_FAILED, 'Unknown time zone', {
    details: [{ path: 'timeZone', code: 'invalid_time_zone', message: 'Unknown time zone' }],
  })
}
