// SPDX-License-Identifier: AGPL-3.0-only
import { describe, expect, it } from 'vitest'

import { effectiveLevel, visibilityOf } from '../knowledgeAccess.utils.js'
import { summarizeSources } from '../knowledgeViews.js'

import type { GrantRow } from '../knowledge.repository.js'

const ME = '0190a5c4-0000-7000-8000-00000000000a'
const TEAM = '0190a5c4-0000-7000-8000-0000000000e1'
const OTHER_TEAM = '0190a5c4-0000-7000-8000-0000000000e2'

const team = (teamId: string, level: GrantRow['level']): GrantRow => ({
  baseId: 'b',
  subjectType: 'team',
  teamId,
  userId: null,
  level,
})
const person = (userId: string, level: GrantRow['level']): GrantRow => ({
  baseId: 'b',
  subjectType: 'user',
  teamId: null,
  userId,
  level,
})

describe('effectiveLevel', () => {
  const user = { userId: ME, role: 'user' as const, teamIds: [TEAM] }
  const builder = { userId: ME, role: 'builder' as const, teamIds: [TEAM] }

  it('lets Admins and Owners manage every base without a grant', () => {
    expect(effectiveLevel({ ...user, role: 'admin' }, [])).toBe('manage')
    expect(effectiveLevel({ ...user, role: 'owner' }, [])).toBe('manage')
  })

  it('has no access without a grant that applies', () => {
    expect(effectiveLevel(builder, [])).toBeNull()
    expect(
      effectiveLevel(builder, [team(OTHER_TEAM, 'manage'), person('someone-else', 'manage')]),
    ).toBeNull()
  })

  it('applies a team Can manage only to Builders and above', () => {
    expect(effectiveLevel(builder, [team(TEAM, 'manage')])).toBe('manage')
    expect(effectiveLevel(user, [team(TEAM, 'manage')])).toBe('search')
    expect(effectiveLevel(user, [team(TEAM, 'search')])).toBe('search')
  })

  it('takes the highest of the person and their teams', () => {
    expect(effectiveLevel(user, [team(TEAM, 'search'), person(ME, 'manage')])).toBe('manage')
    expect(effectiveLevel(builder, [person(ME, 'search'), team(TEAM, 'manage')])).toBe('manage')
  })

  it('has no person for a team search (the people exceptions do not apply)', () => {
    const asTeam = { userId: null, role: 'user' as const, teamIds: [TEAM] }
    expect(effectiveLevel(asTeam, [person(ME, 'manage'), team(TEAM, 'search')])).toBe('search')
  })
})

describe('visibilityOf', () => {
  it('shows everything to Admins and grants only to the rest', () => {
    expect(visibilityOf({ userId: ME, role: 'owner', teamIds: [] })).toEqual({ kind: 'all' })
    expect(visibilityOf({ userId: ME, role: 'user', teamIds: [TEAM] })).toEqual({
      kind: 'member',
      userId: ME,
      teamIds: [TEAM],
      teamsManage: false,
    })
    expect(visibilityOf({ userId: ME, role: 'builder', teamIds: [] })).toMatchObject({
      teamsManage: true,
    })
  })
})

describe('summarizeSources', () => {
  it('counts types, states and the average progress of what is in progress', () => {
    const row = (type: 'file' | 'link', status: string, sources: number, progressSum: number) => ({
      baseId: 'b',
      type,
      status: status as 'ready',
      sources,
      progressSum,
    })
    expect(
      summarizeSources([
        row('file', 'ready', 3, 300),
        row('file', 'processing', 2, 90),
        row('link', 'queued', 1, 0),
        row('link', 'failed', 1, 0),
        row('file', 'partially_failed', 1, 100),
      ]),
    ).toEqual({
      sourcesByType: { file: 6, link: 2, connector: 0 },
      processing: { ready: 3, inProgress: 3, needsAttention: 2, progressPercent: 30 },
    })
    expect(summarizeSources([]).processing).toEqual({
      ready: 0,
      inProgress: 0,
      needsAttention: 0,
      progressPercent: 0,
    })
  })
})
