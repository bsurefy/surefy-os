// SPDX-License-Identifier: AGPL-3.0-only
import { defaultInsightsInterval, INSIGHTS_RANGE_MAX_DAYS } from '@surefy/contracts'
import type {
  ExportParams,
  InsightsBreakdownDto,
  InsightsCostDto,
  InsightsInterval,
  InsightsRunsInterval,
  InsightsRunsTimeseriesDto,
  InsightsTimeseriesDto,
} from '@surefy/contracts'
import type { ChartDatum } from '@surefy/ui/components/DataDisplay'

import {
  BASIS_POINTS,
  MICROS_PER_UNIT,
  MS_PER_MINUTE,
  MS_PER_SECOND,
  RANGE_DAYS,
  RUNS_DAILY_MAX_DAYS,
  RUNS_INTERVALS,
} from './InsightsOverview.constants'

import type { CostGroup, InsightsOverviewFilters } from './InsightsOverview.types'
import type { InsightsBudgetMeterQuery, InsightsQuery, InsightsRunsQuery } from '@/api/usage'

const DAY_MS = 86_400_000
const DAY_PATTERN = /^\d{4}-\d{2}-\d{2}$/

/** The calendar day (`2026-10-05`) of an instant in a time zone. */
export function dayIn(at: Date, timeZone: string): string {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(at)
}

export const addDays = (day: string, days: number): string =>
  new Date(Date.parse(`${day}T00:00:00Z`) + days * DAY_MS).toISOString().slice(0, 10)

/** How far a time zone's wall clock is ahead of UTC at an instant, in ms. */
function offsetAt(at: number, timeZone: string): number {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone,
    hourCycle: 'h23',
    year: 'numeric',
    month: 'numeric',
    day: 'numeric',
    hour: 'numeric',
    minute: 'numeric',
    second: 'numeric',
  }).formatToParts(new Date(at))
  const part = (type: string) => Number(parts.find((p) => p.type === type)?.value ?? 0)
  const wall = Date.UTC(
    part('year'),
    part('month') - 1,
    part('day'),
    part('hour'),
    part('minute'),
    part('second'),
  )
  return wall - Math.floor(at / 1000) * 1000
}

/** Midnight at the start of a calendar day in a time zone, as an ISO instant. */
export function startOfDay(day: string, timeZone: string): string {
  const wall = Date.parse(`${day}T00:00:00Z`)
  let at = wall - offsetAt(wall, timeZone)
  at = wall - offsetAt(at, timeZone) // once more, in case the first guess crossed a DST change
  return new Date(at).toISOString()
}

/** The first and last calendar day the range covers; an invalid custom range falls back to 30d. */
export function getRangeDays(
  filters: Pick<InsightsOverviewFilters, 'range' | 'from' | 'to'>,
  now: Date,
  timeZone: string,
): { first: string; last: string } {
  const today = dayIn(now, timeZone)
  if (filters.range === 'custom' && isValidCustomRange(filters.from, filters.to)) {
    return { first: filters.from, last: filters.to ?? filters.from }
  }
  const days = filters.range === 'custom' ? RANGE_DAYS['30d'] : RANGE_DAYS[filters.range]
  return { first: addDays(today, 1 - days), last: today }
}

/** Both days set, in order, and at most a year apart. */
export function isValidCustomRange(from: string | null, to: string | null): from is string {
  if (from === null || to === null || !DAY_PATTERN.test(from) || !DAY_PATTERN.test(to)) {
    return false
  }
  const span = (Date.parse(to) - Date.parse(from)) / DAY_MS + 1
  return span >= 1 && span <= INSIGHTS_RANGE_MAX_DAYS
}

/** The range and filters as the Insights endpoints take them. */
export function toInsightsQuery(
  filters: InsightsOverviewFilters,
  now: Date,
  timeZone: string,
): InsightsQuery {
  const { first, last } = getRangeDays(filters, now, timeZone)
  return {
    from: startOfDay(first, timeZone),
    to: startOfDay(addDays(last, 1), timeZone),
    timeZone,
    ...(filters.team ? { teamId: filters.team } : {}),
    ...(filters.person ? { userId: filters.person } : {}),
    ...(filters.model ? { modelKey: filters.model } : {}),
    ...(filters.agent ? { agentId: filters.agent } : {}),
  }
}

/** The run reads: run rollups have no team, person or model, so only the agent filter applies. */
export function toRunsQuery(query: InsightsQuery): InsightsRunsQuery {
  return {
    from: query.from,
    to: query.to,
    timeZone: query.timeZone,
    ...(query.agentId ? { agentId: query.agentId } : {}),
  }
}

/** Days for up to four months, weeks for longer ranges. */
export const runsIntervalFor = (query: InsightsRunsQuery): InsightsRunsInterval =>
  (Date.parse(query.to) - Date.parse(query.from)) / DAY_MS > RUNS_DAILY_MAX_DAYS
    ? RUNS_INTERVALS.long
    : RUNS_INTERVALS.short

/** The budget of the person filter, else of the team filter, else the organization's. */
export function toBudgetMeterQuery(
  filters: Pick<InsightsOverviewFilters, 'team' | 'person'>,
): InsightsBudgetMeterQuery {
  if (filters.person) return { userId: filters.person }
  if (filters.team) return { teamId: filters.team }
  return {}
}

/** Filters the run numbers ignore. */
export const hasUsageOnlyFilters = (filters: InsightsOverviewFilters): boolean =>
  Boolean(filters.team ?? filters.person ?? filters.model)

/** Hours for a single day, days for anything longer. */
export const intervalFor = (query: InsightsQuery): InsightsInterval =>
  defaultInsightsInterval(query)

export const hasActiveFilters = (filters: InsightsOverviewFilters): boolean =>
  Boolean(filters.team ?? filters.person ?? filters.model ?? filters.agent)

/** Micros across currencies; ranges almost always hold one currency. */
export const costMicrosOf = (cost: InsightsCostDto): number =>
  cost.reduce((sum, entry) => sum + entry.costMicros, 0)

export const microsToUnits = (micros: number): number => micros / MICROS_PER_UNIT

/** The breakdown's groups in order, then "Others" when more groups exist. */
export function toCostGroups(
  breakdown: InsightsBreakdownDto,
  labelOf: (row: InsightsBreakdownDto['rows'][number]) => string,
  othersLabel: (count: number) => string,
): CostGroup[] {
  const groups: CostGroup[] = breakdown.rows.map((row) => ({
    key: row.key,
    label: labelOf(row),
    costMicros: costMicrosOf(row.cost),
    tokens: row.inputTokens + row.outputTokens,
    requests: row.requests,
    isLocal: row.isLocal,
    isOthers: false,
  }))
  if (breakdown.others) {
    groups.push({
      key: null,
      label: othersLabel(breakdown.others.groupCount),
      costMicros: costMicrosOf(breakdown.others.cost),
      tokens: breakdown.others.inputTokens + breakdown.others.outputTokens,
      requests: breakdown.others.requests,
      isLocal: false,
      isOthers: true,
    })
  }
  return groups
}

/** Cost per group for the bar chart, in currency units. */
export const toCostData = (groups: readonly CostGroup[]): ChartDatum[] =>
  groups.map((group) => ({ group: group.label, cost: microsToUnits(group.costMicros) }))

/** Input and output tokens per bucket for the line chart. */
export const toTokenData = (series: InsightsTimeseriesDto): ChartDatum[] =>
  series.points.map((point) => ({
    start: point.start,
    input: point.inputTokens,
    output: point.outputTokens,
  }))

/** Runs per bucket by outcome; "needed a person" overlaps the other two, so bars sit side by side. */
export const toRunsData = (series: InsightsRunsTimeseriesDto): ChartDatum[] =>
  series.points.map((point) => ({
    start: point.start,
    succeeded: point.succeeded,
    neededHuman: point.neededHuman,
    failed: point.failed,
  }))

export const basisPointsToShare = (bp: number): number => bp / BASIS_POINTS

/** A duration as a number and its unit: 420 ms, 6.4 s, 2.5 min. */
export function splitDuration(ms: number): { unit: 'ms' | 's' | 'min'; value: number } {
  if (ms < MS_PER_SECOND) return { unit: 'ms', value: Math.round(ms) }
  if (ms < MS_PER_MINUTE) return { unit: 's', value: ms / MS_PER_SECOND }
  return { unit: 'min', value: ms / MS_PER_MINUTE }
}

/** The `usage_csv` export of what is on screen: the range, the time zone and the filters. */
export function toExportParams(query: InsightsQuery): ExportParams {
  const filters: Record<string, string[]> = {}
  if (query.teamId) filters.teamId = [query.teamId]
  if (query.userId) filters.userId = [query.userId]
  if (query.modelKey) filters.modelKey = [query.modelKey]
  if (query.agentId) filters.agentId = [query.agentId]
  return {
    version: 1,
    format: 'csv',
    dateRange: { from: query.from, to: query.to, timeZone: query.timeZone },
    filters,
  }
}
