// SPDX-License-Identifier: AGPL-3.0-only
import type { RunsTabFilters } from './RunsTab.types'
import type { AgentRunListFilters } from '@/api/agentRuns'

/** The URL's filters as the API's query; empty values are left out. */
export function toRunQuery(filters: RunsTabFilters): AgentRunListFilters {
  return {
    q: filters.q || undefined,
    status: filters.status ?? undefined,
    neededHuman: filters.human || undefined,
    isTest: filters.test || undefined,
  }
}

export const hasActiveFilters = (filters: RunsTabFilters): boolean =>
  filters.q !== '' || filters.status !== null || filters.human || filters.test

/** The last eight characters of the run id, which is how a run is named on screen (the first ones are the time). */
export const shortRunId = (runId: string): string => runId.slice(-8)
