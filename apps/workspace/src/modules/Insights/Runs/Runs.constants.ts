// SPDX-License-Identifier: AGPL-3.0-only
import { INSIGHTS_RANGE_PRESETS } from '@surefy/contracts'
import type { AGENT_RUN_SORT_FIELDS, AgentRunStatus, AgentRunTrigger } from '@surefy/contracts'
import type { StatusTone } from '@surefy/ui/components/DataDisplay'

/** Any time (the default: the log reads newest first), the Overview's presets, or Custom. */
export const RUNS_RANGES = ['any', ...INSIGHTS_RANGE_PRESETS] as const
export type RunsRange = (typeof RUNS_RANGES)[number]

/** The sortable columns, each either way; `-` sorts descending. */
export const RUN_SORTS = [
  '-startedAt',
  'startedAt',
  '-durationMs',
  'durationMs',
  '-costMicros',
  'costMicros',
] as const satisfies readonly (
  (typeof AGENT_RUN_SORT_FIELDS)[number] | `-${(typeof AGENT_RUN_SORT_FIELDS)[number]}`
)[]
export type RunSort = (typeof RUN_SORTS)[number]

/** The "any" choice of a single-value filter; never sent to the API. */
export const ANY = 'any'

export const SEARCH_DEBOUNCE_MS = 300

/** Filter lists load this many teams, models and agents. */
export const FILTER_OPTIONS_LIMIT = 100

export const STATUS_TONE: Record<AgentRunStatus, StatusTone> = {
  queued: 'neutral',
  running: 'info',
  waiting_approval: 'warning',
  succeeded: 'success',
  failed: 'destructive',
  canceled: 'neutral',
  timed_out: 'destructive',
}

/** The statuses the filter offers, in the order of a run's life. */
export const STATUS_FILTERS = [
  'queued',
  'running',
  'waiting_approval',
  'succeeded',
  'failed',
  'canceled',
  'timed_out',
] as const satisfies readonly AgentRunStatus[]

/** What started the runs the list shows; test runs live in the agent editor. */
export const TRIGGER_FILTERS = [
  'chat',
  'api',
  'widget',
  'slack',
  'whatsapp',
  'flow',
] as const satisfies readonly AgentRunTrigger[]

/** The Guard thresholds until the organization's load, as on the Guard defaults page. */
export const DEFAULT_CONFIDENCE_THRESHOLDS = { low: 0.6, high: 0.9 } as const
