// SPDX-License-Identifier: AGPL-3.0-only
import { describe, expect, it } from 'vitest'

import { getLeadName, indexNamesByUserId, needsConnectionsDecision } from './TeamsSettings.utils'
import { memberFactory } from '../../../../mock/handlers/members'
import { teamFactory } from '../../../../mock/handlers/teams'

describe('getLeadName', () => {
  const member = memberFactory()
  const names = indexNamesByUserId([member])

  it('names the lead', () => {
    expect(getLeadName(teamFactory({ leadUserId: member.user.id }), names)).toBe(member.user.name)
  })

  it('is null for a team without a lead or an unknown one', () => {
    expect(getLeadName(teamFactory({ leadUserId: null }), names)).toBeNull()
    expect(
      getLeadName(teamFactory({ leadUserId: '0191a000-0000-7000-8000-0000000000ff' }), names),
    ).toBeNull()
  })
})

describe('needsConnectionsDecision', () => {
  it('asks only when the team has connections', () => {
    const base = { memberCount: 2, primaryMemberCount: 1, dependents: [] }
    expect(needsConnectionsDecision({ ...base, connectionCount: 3 })).toBe(true)
    expect(needsConnectionsDecision({ ...base, connectionCount: 0 })).toBe(false)
    expect(needsConnectionsDecision(undefined)).toBe(false)
  })
})
