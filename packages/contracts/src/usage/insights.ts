// SPDX-License-Identifier: AGPL-3.0-only
import { z } from 'zod'

import { budgetMeterDtoSchema } from './budgets.js'
import { USAGE_SOURCE_MODULES } from './events.js'
import { multiValueQuery } from '../core/filters.js'
import { modelRefDtoSchema } from '../models/gateway.js'
import { modelKeySchema } from '../models/keys.js'
import { currencySchema, timezoneSchema } from '../organizations/schemas.js'

// Insights › Overview: usage and cost read from the rollups (database/usage-budgets-and-audit.md
// §6–9; design/workspace/insights.md). Routes, under /api/v1/orgs/:orgId:
// GET /insights/overview · GET /insights/breakdown · GET /insights/timeseries (MVP);
// GET /insights/runs-overview · GET /insights/runs-timeseries · GET /insights/budget-meter (V1).
// `insights:read` sees the whole organization. `insights:read-own` (Builders) sees the agents and
// flows they can edit: every read is narrowed to them, and numbers outside them come back
// `restricted`. The Runs tab and run detail are the agentRuns routes (`runs:read`).
// The CSV export is an `exports` row of kind `usage_csv` (dataControl; see ./export.ts).

/** Longest range one request covers. */
export const INSIGHTS_RANGE_MAX_DAYS = 366
/** Most points one time series returns. */
export const INSIGHTS_SERIES_MAX_POINTS = 400

const DAY_MS = 86_400_000

/** The client turns a preset (Today, 7d, 30d, 90d) or a custom pick into from/to in its time zone. */
export const INSIGHTS_RANGE_PRESETS = ['today', '7d', '30d', '90d', 'custom'] as const
export type InsightsRangePreset = (typeof INSIGHTS_RANGE_PRESETS)[number]

/**
 * The filters every Insights read shares. Repeated keys select several values; absent means all.
 * `teamId` is the primary team at event time (primary-team charging), so a person's past cost stays
 * with the team they were charged to. `agentId` (V1) keeps the calls made for those agents.
 */
export const insightsFiltersSchema = z.object({
  teamId: multiValueQuery(z.uuid()),
  userId: multiValueQuery(z.uuid()),
  modelKey: multiValueQuery(modelKeySchema),
  sourceModule: multiValueQuery(z.enum(USAGE_SOURCE_MODULES)),
  agentId: multiValueQuery(z.uuid()),
})
export type InsightsFilters = z.infer<typeof insightsFiltersSchema>

/** `from` inclusive, `to` exclusive, at most `INSIGHTS_RANGE_MAX_DAYS` apart. */
export const insightsRangeSchema = z.object({
  from: z.iso.datetime(),
  to: z.iso.datetime(),
  /** IANA time zone; ranges and buckets are computed in it. The API checks it against its zone list. */
  timeZone: timezoneSchema,
})
export type InsightsRange = z.infer<typeof insightsRangeSchema>

const rangeSpanMs = (range: { from: string; to: string }) =>
  Date.parse(range.to) - Date.parse(range.from)

const checkRange = (range: { from: string; to: string }, ctx: z.RefinementCtx) => {
  const span = rangeSpanMs(range)
  if (span <= 0) ctx.addIssue({ code: 'custom', path: ['to'], message: 'to must be after from' })
  else if (span > INSIGHTS_RANGE_MAX_DAYS * DAY_MS)
    ctx.addIssue({
      code: 'custom',
      path: ['to'],
      message: `The range covers at most ${INSIGHTS_RANGE_MAX_DAYS} days`,
    })
}

/** `GET /insights/overview`. */
export const insightsOverviewQuerySchema = insightsRangeSchema
  .extend(insightsFiltersSchema.shape)
  .superRefine(checkRange)
export type InsightsOverviewQuery = z.infer<typeof insightsOverviewQuerySchema>

/** Money per currency; a range can mix currencies, which are never converted. */
export const insightsCostDtoSchema = z.array(
  z.object({ currency: currencySchema, costMicros: z.number().int().nonnegative() }),
)
export type InsightsCostDto = z.infer<typeof insightsCostDtoSchema>

/**
 * A number the caller may or may not see. `restricted` shows "—" with "Restricted", never 0
 * (numbers outside the person's scope, such as organization totals for a Builder).
 */
export const insightsMetricSchema = <T extends z.ZodType>(value: T) =>
  z.discriminatedUnion('state', [
    z.object({ state: z.literal('value'), value }),
    z.object({ state: z.literal('restricted') }),
  ])

const countSchema = z.number().int().nonnegative()

/** The MVP KPIs for the range and filters. */
export const insightsOverviewDtoSchema = z.object({
  /** Chat answers generated (generation calls made for chat). */
  messages: insightsMetricSchema(countSchema),
  /** Distinct people with at least one call. */
  activePeople: insightsMetricSchema(countSchema),
  /** Input plus output tokens. */
  tokens: insightsMetricSchema(countSchema),
  cost: insightsMetricSchema(insightsCostDtoSchema),
  /** The current UTC calendar month, whatever the range (`usage_monthly`); the filters still apply. */
  costThisMonth: insightsMetricSchema(insightsCostDtoSchema),
  /** False until the organization's first metered call: "Usage appears after the first chat". */
  hasUsage: z.boolean(),
  /**
   * Models used in the range without a known price: their calls are counted at 0, so the cost is
   * flagged as incomplete. Local models are never listed here (they cost $0 "on your hardware").
   */
  unpricedModels: z.array(modelRefDtoSchema),
  /** Rollups are complete up to this instant; newer calls appear after the next rollup. */
  dataThrough: z.iso.datetime().nullable(),
})
export type InsightsOverviewDto = z.infer<typeof insightsOverviewDtoSchema>

/** Cost by team, by person, by model or (V1) by agent. */
export const INSIGHTS_BREAKDOWN_DIMENSIONS = ['team', 'person', 'model', 'agent'] as const
export type InsightsBreakdownDimension = (typeof INSIGHTS_BREAKDOWN_DIMENSIONS)[number]

export const INSIGHTS_BREAKDOWN_SORTS = ['cost', 'tokens', 'requests'] as const
export type InsightsBreakdownSort = (typeof INSIGHTS_BREAKDOWN_SORTS)[number]

export const INSIGHTS_BREAKDOWN_LIMIT = { default: 10, max: 100 } as const

/** `GET /insights/breakdown`: the top groups, largest first, and one "others" total for the rest. */
export const insightsBreakdownQuerySchema = insightsRangeSchema
  .extend(insightsFiltersSchema.shape)
  .extend({
    by: z.enum(INSIGHTS_BREAKDOWN_DIMENSIONS),
    sort: z.enum(INSIGHTS_BREAKDOWN_SORTS).default('cost'),
    limit: z.coerce
      .number()
      .int()
      .min(1)
      .max(INSIGHTS_BREAKDOWN_LIMIT.max)
      .default(INSIGHTS_BREAKDOWN_LIMIT.default),
  })
  .superRefine(checkRange)
export type InsightsBreakdownQuery = z.infer<typeof insightsBreakdownQuerySchema>

/** Totals of one group, of the "others" group, or of the whole range. */
export const insightsTotalsDtoSchema = z.object({
  requests: countSchema,
  inputTokens: countSchema,
  outputTokens: countSchema,
  cachedInputTokens: countSchema,
  cost: insightsCostDtoSchema,
})
export type InsightsTotalsDto = z.infer<typeof insightsTotalsDtoSchema>

/**
 * One group. `key` is the team id, the user id, the model key or the agent id, and is what the
 * drill-down and the filters take; it is null for calls without a primary team ("No team"), without
 * a person (API keys and channels) or outside any agent (chat, knowledge). `label` is resolved at
 * read time and is null when the key is null or no longer resolves (a removed member, a deleted
 * team, a model no longer in the Vault, a purged agent).
 */
export const insightsBreakdownRowDtoSchema = insightsTotalsDtoSchema.extend({
  key: z.string().min(1).nullable(),
  label: z.string().nullable(),
  /** Model rows: the model as the picker shows it; null for other dimensions or a removed model. */
  model: modelRefDtoSchema.nullable(),
  /** Every call in the group ran on a local model: "$0 · on your hardware". */
  isLocal: z.boolean(),
})
export type InsightsBreakdownRowDto = z.infer<typeof insightsBreakdownRowDtoSchema>

export const insightsBreakdownDtoSchema = z.object({
  by: z.enum(INSIGHTS_BREAKDOWN_DIMENSIONS),
  rows: z.array(insightsBreakdownRowDtoSchema),
  /** The groups past `limit`, summed; null when every group is in `rows`. */
  others: insightsTotalsDtoSchema.extend({ groupCount: z.number().int().positive() }).nullable(),
  total: insightsTotalsDtoSchema,
})
export type InsightsBreakdownDto = z.infer<typeof insightsBreakdownDtoSchema>

export const INSIGHTS_INTERVALS = ['hour', 'day', 'week', 'month'] as const
export type InsightsInterval = (typeof INSIGHTS_INTERVALS)[number]

const INTERVAL_MS: Record<InsightsInterval, number> = {
  hour: 3_600_000,
  day: DAY_MS,
  week: 7 * DAY_MS,
  month: 28 * DAY_MS,
}

/** The interval a range gets unless the person picks another: hours for a day, else days. */
export const defaultInsightsInterval = (range: { from: string; to: string }): InsightsInterval =>
  rangeSpanMs(range) <= 2 * DAY_MS ? 'hour' : 'day'

/** `GET /insights/timeseries`: tokens and cost over time, at most `INSIGHTS_SERIES_MAX_POINTS` points. */
export const insightsTimeseriesQuerySchema = insightsRangeSchema
  .extend(insightsFiltersSchema.shape)
  .extend({ interval: z.enum(INSIGHTS_INTERVALS) })
  .superRefine((query, ctx) => {
    checkRange(query, ctx)
    if (rangeSpanMs(query) / INTERVAL_MS[query.interval] > INSIGHTS_SERIES_MAX_POINTS)
      ctx.addIssue({
        code: 'custom',
        path: ['interval'],
        message: `Pick a longer interval: a series has at most ${INSIGHTS_SERIES_MAX_POINTS} points`,
      })
  })
export type InsightsTimeseriesQuery = z.infer<typeof insightsTimeseriesQuerySchema>

/** One bucket; `start` is the bucket's start in the query's time zone, as an instant. */
export const insightsSeriesPointDtoSchema = insightsTotalsDtoSchema.extend({
  start: z.iso.datetime(),
})
export type InsightsSeriesPointDto = z.infer<typeof insightsSeriesPointDtoSchema>

/** Every bucket of the range in order, empty ones included with zeros. */
export const insightsTimeseriesDtoSchema = z.object({
  interval: z.enum(INSIGHTS_INTERVALS),
  points: z.array(insightsSeriesPointDtoSchema),
})
export type InsightsTimeseriesDto = z.infer<typeof insightsTimeseriesDtoSchema>

// ── V1: runs, approvals and the budget meter ────────────────────────────────────────────────────

/**
 * The query of the run reads. Runs come from `run_stats_daily` (UTC days of the run's finish; test
 * runs left out), which has no team, person or model, so only the agent filter applies to them.
 */
export const insightsRunsQuerySchema = insightsRangeSchema
  .extend({ agentId: multiValueQuery(z.uuid()) })
  .superRefine(checkRange)
export type InsightsRunsQuery = z.infer<typeof insightsRunsQuerySchema>

/** Approvals of agents and flows in the range; request kinds (bridge, channel publish) are left out. */
export const insightsApprovalsDtoSchema = z.object({
  /** Requested in the range. */
  requested: countSchema,
  /** "Approvals by people": approved or rejected by a person in the range. */
  decidedByPeople: countSchema,
  approved: countSchema,
  rejected: countSchema,
  /** The timeout took its action. */
  expired: countSchema,
  /** Median time from request to a person's decision; null when nobody decided. */
  medianMinutesToDecide: z.number().nonnegative().nullable(),
})
export type InsightsApprovalsDto = z.infer<typeof insightsApprovalsDtoSchema>

/** `GET /insights/runs-overview`: the V1 KPIs next to the MVP ones. */
export const insightsRunsOverviewDtoSchema = z.object({
  /** Finished runs (succeeded, failed, timed out or canceled). */
  runs: insightsMetricSchema(countSchema),
  /** Succeeded runs over finished runs that were not canceled, in basis points; null without runs. */
  successRateBp: insightsMetricSchema(z.number().int().min(0).max(10_000).nullable()),
  /** Waiting for approvals included; null without runs. */
  averageDurationMs: insightsMetricSchema(countSchema.nullable()),
  approvals: insightsMetricSchema(insightsApprovalsDtoSchema),
  /** False until the organization's first finished run: "Create an agent". */
  hasRuns: z.boolean(),
  /** Run rollups are complete up to this instant. */
  dataThrough: z.iso.datetime().nullable(),
})
export type InsightsRunsOverviewDto = z.infer<typeof insightsRunsOverviewDtoSchema>

/** Run buckets are built from whole days, so the shortest interval is a day. */
export const INSIGHTS_RUNS_INTERVALS = [
  'day',
  'week',
  'month',
] as const satisfies readonly InsightsInterval[]
export type InsightsRunsInterval = (typeof INSIGHTS_RUNS_INTERVALS)[number]

/** `GET /insights/runs-timeseries`: runs over time. */
export const insightsRunsTimeseriesQuerySchema = insightsRangeSchema
  .extend({
    agentId: multiValueQuery(z.uuid()),
    interval: z.enum(INSIGHTS_RUNS_INTERVALS).default('day'),
  })
  .superRefine((query, ctx) => {
    checkRange(query, ctx)
    if (rangeSpanMs(query) / INTERVAL_MS[query.interval] > INSIGHTS_SERIES_MAX_POINTS)
      ctx.addIssue({
        code: 'custom',
        path: ['interval'],
        message: `Pick a longer interval: a series has at most ${INSIGHTS_SERIES_MAX_POINTS} points`,
      })
  })
export type InsightsRunsTimeseriesQuery = z.infer<typeof insightsRunsTimeseriesQuerySchema>

/**
 * One bucket of finished runs by outcome. `failed` includes timed-out runs. `neededHuman` counts
 * runs that waited for a person whatever their outcome, so it overlaps the other three.
 */
export const insightsRunsPointDtoSchema = z.object({
  start: z.iso.datetime(),
  succeeded: countSchema,
  failed: countSchema,
  canceled: countSchema,
  neededHuman: countSchema,
})
export type InsightsRunsPointDto = z.infer<typeof insightsRunsPointDtoSchema>

/** Every bucket of the range in order, empty ones included with zeros. */
export const insightsRunsTimeseriesDtoSchema = z.object({
  interval: z.enum(INSIGHTS_RUNS_INTERVALS),
  points: z.array(insightsRunsPointDtoSchema),
})
export type InsightsRunsTimeseriesDto = z.infer<typeof insightsRunsTimeseriesDtoSchema>

/**
 * `GET /insights/budget-meter`: cost this month against a budget. One team or one person picks
 * their budget, nothing picks the organization budget.
 */
export const insightsBudgetMeterQuerySchema = z
  .object({ teamId: z.uuid().optional(), userId: z.uuid().optional() })
  .refine((query) => !(query.teamId && query.userId), {
    message: 'Pick a team or a person, not both',
    path: ['userId'],
  })
export type InsightsBudgetMeterQuery = z.infer<typeof insightsBudgetMeterQuerySchema>

/** `meter` is null when that scope has no enabled budget: "No budget · Set one in Settings". */
export const insightsBudgetMeterDtoSchema = z.object({
  meter: insightsMetricSchema(budgetMeterDtoSchema.nullable()),
})
export type InsightsBudgetMeterDto = z.infer<typeof insightsBudgetMeterDtoSchema>
