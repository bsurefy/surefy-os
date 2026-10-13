// SPDX-License-Identifier: AGPL-3.0-only
import type { AgentAudienceSummaryDto, AgentDto } from '@surefy/contracts'

import { AGENT_SORT_PARAMS } from './AgentsList.constants'

import type { AgentFilter, AgentOwner, AgentSort } from './AgentsList.constants'
import type { AgentRowAction, SharedWithSummary, TrustDisplay } from './AgentsList.types'
import type { AgentListFilters } from '@/api/agents'

interface ListParams {
  q: string
  filter: AgentFilter
  owner: AgentOwner
  sort: AgentSort
}

/**
 * The API query for the toolbar. "All" leaves out archived agents (the API lists them only when
 * asked for), "Needs attention" is its own flag and the other filters are one status.
 */
export function toAgentListFilters({ q, filter, owner, sort }: ListParams): AgentListFilters {
  const status = filter === 'all' || filter === 'attention' ? undefined : filter
  return {
    q: q || undefined,
    status,
    needsAttention: filter === 'attention' ? true : undefined,
    mine: owner === 'me' ? true : undefined,
    sort: AGENT_SORT_PARAMS[sort],
  }
}

/** True when the toolbar narrows the list, so an empty list is "No results" rather than "first time". */
export function hasListFilters({ q, filter, owner }: Omit<ListParams, 'sort'>): boolean {
  return q !== '' || filter !== 'all' || owner !== 'anyone'
}

/**
 * The tier an archive needs: a published agent answers on its channels, so archiving it affects
 * other people (T2); a draft is archived at once with Undo (T1).
 */
export function getArchiveTier(agent: AgentDto): 'T1' | 'T2' {
  return agent.liveVersion === null ? 'T1' : 'T2'
}

/**
 * The menu of one agent. Duplicate needs the right to create; the rest follow what the person may
 * do with this agent (`canEdit`, `canDelete`) and the status it is in. Archived agents can only be
 * restored, duplicated or deleted.
 */
export function getRowActions(agent: AgentDto, canCreate: boolean): AgentRowAction[] {
  const actions: AgentRowAction[] = []
  if (canCreate) actions.push('duplicate')
  if (agent.canEdit) {
    if (agent.status === 'active') actions.push('pause')
    if (agent.status === 'paused') actions.push('resume')
    actions.push(agent.status === 'archived' ? 'restore' : 'archive')
  }
  if (agent.canDelete) actions.push('delete')
  return actions
}

/** The trust score, or "Not enough runs yet" (the API sends no score below 20 runs). */
export function getTrustDisplay(agent: AgentDto): TrustDisplay {
  return agent.trust.score === null
    ? { kind: 'notEnough' }
    : { kind: 'score', value: agent.trust.score }
}

export function summarizeSharedWith(shared: AgentAudienceSummaryDto): SharedWithSummary {
  if (shared.everyone) return { kind: 'everyone' }
  if (shared.teamCount === 0 && shared.userCount === 0) return { kind: 'none' }
  return {
    kind: 'some',
    teamNames: shared.teams.map((team) => team.name),
    moreTeams: Math.max(0, shared.teamCount - shared.teams.length),
    people: shared.userCount,
  }
}
