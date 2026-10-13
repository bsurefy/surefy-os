// SPDX-License-Identifier: AGPL-3.0-only
import type { RunSort, RunsRange, STATUS_FILTERS, TRIGGER_FILTERS } from './Runs.constants'

/** The URL state of Insights › Runs. */
export interface RunsFilters {
  q: string
  status: (typeof STATUS_FILTERS)[number] | null
  trigger: (typeof TRIGGER_FILTERS)[number] | null
  agent: string | null
  team: string | null
  model: string | null
  human: boolean
  range: RunsRange
  from: string | null
  to: string | null
  sort: RunSort
}

/** One choice of a filter list. */
export interface FilterOption {
  value: string
  label: string
}
