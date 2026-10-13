// SPDX-License-Identifier: AGPL-3.0-only
import { UnprocessableError } from '@/core/errors/index.js'
import {
  ERROR_CODES,
  PERMISSIONS,
  type InsightsBreakdownDto,
  type InsightsBreakdownQuery,
  type InsightsBreakdownRowDto,
  type InsightsCostDto,
  type InsightsFilters,
  type InsightsOverviewDto,
  type InsightsOverviewQuery,
  type InsightsRunsOverviewDto,
  type InsightsRunsQuery,
  type InsightsRunsTimeseriesDto,
  type InsightsRunsTimeseriesQuery,
  type InsightsTimeseriesDto,
  type InsightsTimeseriesQuery,
  type InsightsTotalsDto,
  type ModelRefDto,
} from '@surefy/contracts'

import { EVENTS_RANGE_MAX_MS, USAGE_WATERMARK_CACHE_KEY } from './usage.constants.js'
import { asPickerSource } from './usage.types.js'
import { isTimeZone, utcDay, utcDayRange } from './usage.utils.js'

import type { RunStatsRange, TotalsRow, UsageRepository, UsageSource } from './usage.repository.js'
import type {
  UsageAgents,
  UsageApprovals,
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
  /** Read when a request needs them: the agents module is built after this one. */
  agents: () => UsageAgents
  approvals: UsageApprovals
  now?: () => Date
}

/**
 * Whose numbers a caller reads: `insights:read` the organization's, `insights:read-own` (Builders)
 * only those of the agents they can edit.
 */
type InsightsScope = { kind: 'organization' } | { kind: 'own'; agentIds: readonly string[] }

interface Range {
  from: string
  to: string
  timeZone: string
}

const DAY_MS = 86_400_000

/** The agents a read keeps: the requested ones, narrowed to the caller's scope. */
function agentIdsOf(
  requested: readonly string[] | undefined,
  scope: InsightsScope,
): string[] | undefined {
  if (scope.kind === 'organization') return requested === undefined ? undefined : [...requested]
  if (requested === undefined) return [...scope.agentIds]
  const own = new Set(scope.agentIds)
  return requested.filter((id) => own.has(id))
}

const filtersOf = (query: InsightsFilters, scope: InsightsScope): InsightsFilters => ({
  teamId: query.teamId,
  userId: query.userId,
  modelKey: query.modelKey,
  sourceModule: query.sourceModule,
  agentId: agentIdsOf(query.agentId, scope),
})

const value = <T>(of: T) => ({ state: 'value' as const, value: of })

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
 * Insights › Overview (design/workspace/insights.md): KPIs, cost by team, person, model and agent,
 * tokens and cost over time, and the V1 run and approval numbers. "Today" and "7d" read the events with exact boundaries in the
 * caller's time zone; longer ranges read the daily rollup, whose days are UTC
 * (usage-budgets-and-audit.md, "Reading"). Private chats contribute numbers only. A Builder's reads
 * are narrowed to the agents they can edit; chat answers come back restricted to them.
 */
export class InsightsService {
  private readonly now: () => Date

  constructor(private readonly deps: InsightsServiceDeps) {
    this.now = deps.now ?? (() => new Date())
  }

  async overview(ctx: UsageContext, query: InsightsOverviewQuery): Promise<InsightsOverviewDto> {
    assertTimeZone(query.timeZone)
    const { repository } = this.deps
    const source = sourceFor(query)
    const today = utcDay(this.now())
    const thisMonth: UsageSource = {
      table: 'daily',
      fromDay: `${today.slice(0, 7)}-01`,
      toDay: utcDay(new Date(Date.parse(today) + DAY_MS)),
    }
    const result = await this.deps.db.tenant(ctx.orgId, async (tx) => {
      const scope = await this.scopeOf(tx, ctx)
      const filters = filtersOf(query, scope)
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
      return { scope, hasUsage, kpis, cost, costThisMonth, unpricedModels }
    })
    return {
      // chat answers are outside any agent, so a Builder never sees them
      messages: result.scope.kind === 'own' ? { state: 'restricted' } : value(result.kpis.messages),
      activePeople: value(result.kpis.activePeople),
      tokens: value(result.kpis.tokens),
      cost: value(result.cost),
      costThisMonth: value(result.costThisMonth),
      hasUsage: result.hasUsage,
      unpricedModels: result.unpricedModels,
      dataThrough: await this.dataThrough(),
    }
  }

  async breakdown(ctx: UsageContext, query: InsightsBreakdownQuery): Promise<InsightsBreakdownDto> {
    assertTimeZone(query.timeZone)
    const source = sourceFor(query)
    const { rows, labels, models } = await this.deps.db.tenant(ctx.orgId, async (tx) => {
      const scope = await this.scopeOf(tx, ctx)
      const groupRows = await this.deps.repository.groups(
        tx,
        ctx.orgId,
        source,
        filtersOf(query, scope),
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
    const rows = await this.deps.db.tenant(ctx.orgId, async (tx) =>
      this.deps.repository.buckets(
        tx,
        ctx.orgId,
        source,
        filtersOf(query, await this.scopeOf(tx, ctx)),
        { from: query.from, to: query.to, timeZone, interval: query.interval },
      ),
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

  /**
   * The V1 KPIs: finished runs, success rate and average duration from `run_stats_daily` (UTC days
   * of the finish), and the approvals of the range.
   */
  async runsOverview(
    ctx: UsageContext,
    query: InsightsRunsQuery,
  ): Promise<InsightsRunsOverviewDto> {
    assertTimeZone(query.timeZone)
    const result = await this.deps.db.tenant(ctx.orgId, async (tx) => {
      const agentIds = agentIdsOf(query.agentId, await this.scopeOf(tx, ctx))
      const narrowed = agentIds === undefined ? {} : { agentIds }
      return {
        hasRuns: await this.deps.repository.hasRuns(tx, ctx.orgId),
        totals: await this.deps.repository.runTotals(tx, ctx.orgId, runRange(query, agentIds)),
        approvals: await this.deps.approvals.insightsStats(tx, ctx.orgId, {
          from: new Date(query.from),
          to: new Date(query.to),
          ...narrowed,
        }),
      }
    })
    const { totals } = result
    // canceled runs say nothing about the agent, so they are left out of the rate
    const rated = totals.runs - totals.canceled
    return {
      runs: value(totals.runs),
      successRateBp: value(rated === 0 ? null : Math.round((totals.succeeded * 10_000) / rated)),
      averageDurationMs: value(
        totals.runs === 0 ? null : Math.round(totals.durationMsSum / totals.runs),
      ),
      approvals: value(result.approvals),
      hasRuns: result.hasRuns,
      dataThrough: await this.dataThrough(),
    }
  }

  /** Runs over time by outcome, in UTC buckets (the rollup's days are UTC). */
  async runsTimeseries(
    ctx: UsageContext,
    query: InsightsRunsTimeseriesQuery,
  ): Promise<InsightsRunsTimeseriesDto> {
    assertTimeZone(query.timeZone)
    const points = await this.deps.db.tenant(ctx.orgId, async (tx) => {
      const agentIds = agentIdsOf(query.agentId, await this.scopeOf(tx, ctx))
      return this.deps.repository.runBuckets(tx, ctx.orgId, {
        ...runRange(query, agentIds),
        from: query.from,
        to: query.to,
        interval: query.interval,
      })
    })
    return { interval: query.interval, points }
  }

  // ── Internals ─────────────────────────────────────────────────────────────────────────────────

  private async scopeOf(tx: DbExecutor, ctx: UsageContext): Promise<InsightsScope> {
    const permissions: readonly string[] = ctx.access.permissions
    if (permissions.includes(PERMISSIONS.INSIGHTS_READ)) return { kind: 'organization' }
    const agentIds = await this.deps.agents().editableIds(tx, ctx.orgId, {
      userId: ctx.userId,
      teamIds: ctx.teamIds,
      all: permissions.includes(PERMISSIONS.AGENTS_MANAGE_ALL),
    })
    return { kind: 'own', agentIds }
  }

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
    } else if (by === 'agent') {
      for (const [id, name] of await this.deps.agents().names(tx, orgId, keys)) labels.set(id, name)
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

/** The UTC days of a run read, and the agents it keeps. */
function runRange(range: Range, agentIds: string[] | undefined): RunStatsRange {
  return { ...utcDayRange(range.from, range.to), ...(agentIds === undefined ? {} : { agentIds }) }
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
