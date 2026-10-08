// SPDX-License-Identifier: AGPL-3.0-only
import type { AgentDto } from '@surefy/contracts'
import type { StatusTone } from '@surefy/ui/components/DataDisplay'

/** The status filter: every agent that is not archived, one status, "Needs attention", or Archived. */
export const AGENT_FILTERS = ['all', 'active', 'draft', 'paused', 'attention', 'archived'] as const
export type AgentFilter = (typeof AGENT_FILTERS)[number]

/** The owner filter: everyone's agents, or only the ones the person owns. */
export const AGENT_OWNERS = ['anyone', 'me'] as const
export type AgentOwner = (typeof AGENT_OWNERS)[number]

/** Sort by the last run (newest first), the name, or the runs this week (most first). */
export const AGENT_SORTS = ['lastRun', 'name', 'runs'] as const
export type AgentSort = (typeof AGENT_SORTS)[number]

/** The list as cards, or as a table. */
export const AGENT_VIEWS = ['cards', 'table'] as const
export type AgentView = (typeof AGENT_VIEWS)[number]

/** What the API sorts by for each choice; a leading `-` is descending. */
export const AGENT_SORT_PARAMS: Record<AgentSort, string> = {
  lastRun: '-lastRunAt',
  name: 'name',
  runs: '-runsThisWeek',
}

/** Wait after the last keystroke before searching. */
export const SEARCH_DEBOUNCE_MS = 300

/** Teams named in "Shared with" before "+N" (the API sends at most this many). */
export const SHARED_TEAMS_SHOWN = 3

/** The name of an agent made with "Create agent"; the editor renames it. */
export const NEW_AGENT_NAME_KEY = 'newAgentName'

export const AGENT_STATUS_TONE = {
  active: 'success',
  draft: 'neutral',
  paused: 'warning',
  archived: 'neutral',
} as const satisfies Record<string, StatusTone>

export type AgentLastRunStatus = NonNullable<AgentDto['lastRun']>['status']

export const LAST_RUN_TONE: Record<AgentLastRunStatus, StatusTone> = {
  queued: 'neutral',
  running: 'info',
  waiting_approval: 'warning',
  succeeded: 'success',
  failed: 'destructive',
  canceled: 'neutral',
  timed_out: 'destructive',
}
