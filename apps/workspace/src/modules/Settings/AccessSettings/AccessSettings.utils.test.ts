// SPDX-License-Identifier: AGPL-3.0-only
import { describe, expect, it } from 'vitest'

import {
  buildCapabilityMatrix,
  findModuleReason,
  getReasonTarget,
  parseReasonKey,
  toLimitDisplayValue,
} from './AccessSettings.utils'

describe('buildCapabilityMatrix', () => {
  const definitions = [
    { key: 'chat:use', module: 'chat' as const, minimumRole: 'user' as const },
    { key: 'members:invite', module: null, minimumRole: 'admin' as const },
    { key: 'members:manage-admins', module: null, minimumRole: 'owner' as const },
  ]

  it('groups permissions by resource and marks the roles that hold them', () => {
    const matrix = buildCapabilityMatrix(definitions)
    expect(matrix.map((group) => group.group)).toEqual(['chat', 'members'])
    const [, members] = matrix
    expect(members?.rows[0]?.allowedByRole).toEqual({
      user: false,
      builder: false,
      admin: true,
      owner: true,
    })
    expect(members?.rows[1]?.allowedByRole.admin).toBe(false)
  })

  it('covers every permission of the contracts', () => {
    const rows = buildCapabilityMatrix().flatMap((group) => group.rows)
    expect(rows.length).toBeGreaterThan(10)
    expect(rows.every((row) => row.allowedByRole.owner)).toBe(true)
  })
})

describe('parseReasonKey', () => {
  it('splits the type from the name, which may hold colons', () => {
    expect(parseReasonKey('module:train')).toEqual({ type: 'module', name: 'train' })
    expect(parseReasonKey('permission:agents:publish')).toEqual({
      type: 'permission',
      name: 'agents:publish',
    })
  })
})

describe('reasons', () => {
  it('finds the reason a module is off', () => {
    const reasons = [{ key: 'module:train', source: 'team' as const }]
    expect(findModuleReason(reasons, 'train')?.source).toBe('team')
    expect(findModuleReason(reasons, 'chat')).toBeUndefined()
  })

  it('links a role to Members and a team to its detail, and nothing else', () => {
    expect(getReasonTarget({ key: 'a', source: 'role' })).toEqual({ section: 'members' })
    expect(getReasonTarget({ key: 'a', source: 'team', teamId: 't1' })).toEqual({
      section: 'teams',
      teamId: 't1',
    })
    expect(getReasonTarget({ key: 'a', source: 'plan' })).toBeNull()
    expect(getReasonTarget({ key: 'a', source: 'team' })).toBeNull()
  })
})

describe('toLimitDisplayValue', () => {
  it('shows money in whole units and storage in megabytes', () => {
    expect(toLimitDisplayValue('monthlySpendMicros', 50_000_000)).toBe(50)
    expect(toLimitDisplayValue('maxStorageBytes', 2_500_000_000)).toBe(2500)
    expect(toLimitDisplayValue('maxAgents', 20)).toBe(20)
  })
})
