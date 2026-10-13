// SPDX-License-Identifier: AGPL-3.0-only
import type { DataTableSort } from '@surefy/ui/components/DataDisplay'

import { RUN_SORTS } from './Runs.constants'
import {
  addDays,
  getRangeDays,
  isValidCustomRange,
  startOfDay,
} from '../InsightsOverview/InsightsOverview.utils'

import type { RunSort } from './Runs.constants'
import type { RunsFilters } from './Runs.types'
import type { RunListFilters } from '@/api/agentRuns'

/** The instants the range covers in the person's time zone; none for Any time or a broken custom range. */
export function toRunRange(
  filters: Pick<RunsFilters, 'range' | 'from' | 'to'>,
  now: Date,
  timeZone: string,
): { from?: string; to?: string } {
  const { range } = filters
  if (range === 'any') return {}
  if (range === 'custom' && !isValidCustomRange(filters.from, filters.to)) return {}
  const { first, last } = getRangeDays({ range, from: filters.from, to: filters.to }, now, timeZone)
  return { from: startOfDay(first, timeZone), to: startOfDay(addDays(last, 1), timeZone) }
}

/** The URL's filters as the API's query; empty values are left out. */
export function toRunListQuery(filters: RunsFilters, now: Date, timeZone: string): RunListFilters {
  return {
    q: filters.q || undefined,
    status: filters.status ?? undefined,
    trigger: filters.trigger ?? undefined,
    agentId: filters.agent ?? undefined,
    teamId: filters.team ?? undefined,
    modelKey: filters.model ?? undefined,
    neededHuman: filters.human || undefined,
    ...toRunRange(filters, now, timeZone),
    sort: filters.sort,
  }
}

export const hasActiveFilters = (filters: RunsFilters): boolean =>
  filters.q !== '' ||
  filters.status !== null ||
  filters.trigger !== null ||
  filters.agent !== null ||
  filters.team !== null ||
  filters.model !== null ||
  filters.human ||
  filters.range !== 'any'

/** `-startedAt` as the table's sort, and back. */
export const toTableSort = (sort: RunSort): DataTableSort => ({
  id: sort.replace(/^-/, ''),
  desc: sort.startsWith('-'),
})

export function fromTableSort(sort: DataTableSort): RunSort {
  const wanted = `${sort.desc ? '-' : ''}${sort.id}`
  return RUN_SORTS.find((candidate) => candidate === wanted) ?? '-startedAt'
}

/** The last eight characters of the run id, which is how a run is named on screen (the first ones are the time). */
export const shortRunId = (runId: string): string => runId.slice(-8)
