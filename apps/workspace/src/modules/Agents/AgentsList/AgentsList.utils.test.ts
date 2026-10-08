// SPDX-License-Identifier: AGPL-3.0-only
import { describe, expect, it } from 'vitest'

import type { AgentDto } from '@surefy/contracts'

import { getImpactLines } from './AgentActionDialog/AgentActionDialog.utils'
import {
  getArchiveTier,
  getRowActions,
  getTrustDisplay,
  hasListFilters,
  summarizeSharedWith,
  toAgentListFilters,
} from './AgentsList.utils'
import { agentDetailFactory } from '../../../../mock/handlers/agents'

const agent = (overrides: Partial<AgentDto> = {}): AgentDto => agentDetailFactory(overrides)
const toolbar = { q: '', filter: 'all', owner: 'anyone', sort: 'lastRun' } as const

describe('toAgentListFilters', () => {
  it('asks for every agent but the archived ones by default, newest run first', () => {
    expect(toAgentListFilters(toolbar)).toEqual({
      q: undefined,
      status: undefined,
      needsAttention: undefined,
      mine: undefined,
      sort: '-lastRunAt',
    })
  })

  it('maps one status, Needs attention, the owner and the sort', () => {
    expect(toAgentListFilters({ ...toolbar, filter: 'paused' }).status).toBe('paused')
    expect(toAgentListFilters({ ...toolbar, filter: 'archived' }).status).toBe('archived')
    const attention = toAgentListFilters({ ...toolbar, filter: 'attention' })
    expect(attention.needsAttention).toBe(true)
    expect(attention.status).toBeUndefined()
    expect(toAgentListFilters({ ...toolbar, owner: 'me', q: 'hr' })).toMatchObject({
      mine: true,
      q: 'hr',
    })
    expect(toAgentListFilters({ ...toolbar, sort: 'runs' }).sort).toBe('-runsThisWeek')
    expect(toAgentListFilters({ ...toolbar, sort: 'name' }).sort).toBe('name')
  })
})

describe('hasListFilters', () => {
  it('is false for the untouched toolbar and true once anything narrows the list', () => {
    expect(hasListFilters(toolbar)).toBe(false)
    expect(hasListFilters({ ...toolbar, q: 'a' })).toBe(true)
    expect(hasListFilters({ ...toolbar, filter: 'draft' })).toBe(true)
    expect(hasListFilters({ ...toolbar, owner: 'me' })).toBe(true)
  })
})

describe('getArchiveTier', () => {
  it('archives a draft at once (T1) and asks about a published agent (T2)', () => {
    expect(getArchiveTier(agent({ liveVersion: null }))).toBe('T1')
    expect(getArchiveTier(agent({ liveVersion: 2 }))).toBe('T2')
  })
})

describe('getRowActions', () => {
  it('offers everything on an active agent the person owns', () => {
    expect(getRowActions(agent({ status: 'active' }), true)).toEqual([
      'duplicate',
      'pause',
      'archive',
      'delete',
    ])
  })

  it('offers Resume on a paused agent and Restore on an archived one', () => {
    expect(getRowActions(agent({ status: 'paused' }), true)).toContain('resume')
    const archived = getRowActions(agent({ status: 'archived' }), true)
    expect(archived).toContain('restore')
    expect(archived).not.toContain('archive')
    expect(archived).not.toContain('pause')
  })

  it('leaves out what the person may not do', () => {
    expect(getRowActions(agent({ canEdit: false, canDelete: false }), true)).toEqual(['duplicate'])
    expect(getRowActions(agent({ canEdit: false, canDelete: false }), false)).toEqual([])
    expect(getRowActions(agent({ status: 'draft' }), false)).toEqual(['archive', 'delete'])
  })
})

describe('getTrustDisplay', () => {
  it('shows the score, or "not enough runs" when the API sends none', () => {
    expect(getTrustDisplay(agent({ trust: { score: 0.91, runs: 40 } }))).toEqual({
      kind: 'score',
      value: 0.91,
    })
    expect(getTrustDisplay(agent({ trust: { score: null, runs: 8 } }))).toEqual({
      kind: 'notEnough',
    })
  })
})

describe('summarizeSharedWith', () => {
  it('says everyone, nobody, or the teams and people', () => {
    expect(summarizeSharedWith({ everyone: true, teams: [], teamCount: 0, userCount: 0 })).toEqual({
      kind: 'everyone',
    })
    expect(summarizeSharedWith({ everyone: false, teams: [], teamCount: 0, userCount: 0 })).toEqual(
      { kind: 'none' },
    )
    expect(
      summarizeSharedWith({
        everyone: false,
        teams: [{ id: 't1', name: 'Support' }],
        teamCount: 4,
        userCount: 2,
      }),
    ).toEqual({ kind: 'some', teamNames: ['Support'], moreTeams: 3, people: 2 })
  })
})

describe('getImpactLines', () => {
  const impact = {
    sharedWith: { everyone: false, teams: [], teamCount: 3, userCount: 0 },
    activeChannels: [{ id: 'c1', type: 'api' as const }],
    runCount: 10,
    pendingApprovals: 2,
    deleteRequiresConfirmation: true,
  }

  it('names the audience, the live channels and the waiting approvals', () => {
    expect(getImpactLines(impact)).toEqual([
      { key: 'teams', count: 3 },
      { key: 'channels', count: 1 },
      { key: 'approvals', count: 2 },
    ])
  })

  it('leaves out what is empty, and says everyone instead of teams', () => {
    expect(
      getImpactLines({
        ...impact,
        sharedWith: { everyone: true, teams: [], teamCount: 0, userCount: 0 },
        activeChannels: [],
        pendingApprovals: 0,
      }),
    ).toEqual([{ key: 'everyone', count: 0 }])
  })
})
