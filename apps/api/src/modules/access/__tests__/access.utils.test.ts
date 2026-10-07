// SPDX-License-Identifier: AGPL-3.0-only
import { describe, expect, it } from 'vitest'

import { COMMUNITY_ENTITLEMENTS, PERMISSIONS, ROLE_PERMISSIONS } from '@surefy/contracts'

import {
  entitlementLevel,
  exceedsParent,
  filterPermissions,
  narrow,
  policyChanges,
  unionAcrossTeams,
} from '../access.utils.js'

const TEAM_A = '01900000-0000-7000-8000-00000000000a'
const TEAM_B = '01900000-0000-7000-8000-00000000000b'

const community = entitlementLevel(
  { ...COMMUNITY_ENTITLEMENTS, license: null, readOnly: false },
  'community',
)

describe('the access chain', () => {
  it('starts from the entitlement source and explains every missing feature', () => {
    expect(community.modules).toContain('train')
    expect(community.features).toEqual([])
    expect(community.reasons).toContainEqual({ key: 'feature:sso', source: 'community' })
  })

  it('narrows down the chain: allow-lists intersect, limits take the minimum, booleans AND', () => {
    const organization = narrow(
      community,
      { version: 1, modules: ['chat', 'agents'], limits: { maxAgents: 10 } },
      { source: 'organization' },
    )
    const team = narrow(
      organization,
      { version: 1, modules: ['chat', 'train'], limits: { maxAgents: 20 }, tools: { mcp: false } },
      { source: 'team', teamId: TEAM_A },
    )
    expect(organization.modules).toEqual(['chat', 'agents'])
    expect(organization.reasons).toContainEqual({ key: 'module:train', source: 'organization' })
    expect(team.modules).toEqual(['chat'])
    expect(team.limits.maxAgents).toBe(10)
    expect(team.tools.mcp).toBe(false)
    expect(team.reasons).toContainEqual({ key: 'module:agents', source: 'team', teamId: TEAM_A })
  })

  it('unites across teams: something stays off only when every team turns it off', () => {
    const a = narrow(
      community,
      { version: 1, modules: ['chat'] },
      { source: 'team', teamId: TEAM_A },
    )
    const b = narrow(
      community,
      { version: 1, modules: ['chat', 'knowledge'], tools: { webSearch: false } },
      { source: 'team', teamId: TEAM_B },
    )
    const union = unionAcrossTeams(community, [a, b])
    expect(union.modules).toEqual(['chat', 'knowledge'])
    expect(union.tools.webSearch).toBe(true)
    expect(union.reasons.some((r) => r.key === 'module:knowledge')).toBe(false)
    expect(union.reasons).toContainEqual({ key: 'module:agents', source: 'team', teamId: TEAM_A })
  })

  it('keeps the permissions whose module is on', () => {
    const permissions = filterPermissions(ROLE_PERMISSIONS.owner, ['chat'], [])
    expect(permissions).toContain(PERMISSIONS.CHAT_USE)
    expect(permissions).not.toContain(PERMISSIONS.AUDIT_READ) // the guard module is off
    expect(permissions).toContain(PERMISSIONS.MEMBERS_READ) // always on
  })

  it('refuses a policy that allows more than its parent', () => {
    const organization = narrow(
      community,
      { version: 1, modules: ['chat'], limits: { maxFlows: 5 }, tools: { mcp: false } },
      { source: 'organization' },
    )
    const details = exceedsParent(
      organization,
      { version: 1, modules: ['chat', 'guard'], limits: { maxFlows: 6 }, tools: { mcp: true } },
      'organization',
    )
    expect(details.map((d) => d.field)).toEqual(['modules', 'tools.mcp', 'limits.maxFlows'])
    expect(exceedsParent(organization, { version: 1, modules: ['chat'] }, 'organization')).toEqual(
      [],
    )
  })

  it('lists the changed fields of a policy', () => {
    expect(
      policyChanges({ version: 1, modules: ['chat'] }, { version: 1, tools: { mcp: false } }),
    ).toEqual([
      { field: 'modules', from: ['chat'], to: null },
      { field: 'tools', from: null, to: { mcp: false } },
    ])
  })
})
