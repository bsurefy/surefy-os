// SPDX-License-Identifier: AGPL-3.0-only
import { describe, expect, it } from 'vitest'

import type { FallbackEntryDto, ModelAccessRuleDto, UsableModelDto } from '@surefy/contracts'

import {
  fromAccessValues,
  getChipStatus,
  getDaysUntil,
  getExpiringDays,
  getFallbackChain,
  getMaskedValue,
  getProviderName,
  getStatusTone,
  getVaultTab,
  groupModels,
  grantsTeam,
  moveItem,
  toAccessValues,
} from './Vault.utils'

const NOW = new Date('2026-10-05T09:00:00.000Z').getTime()
const TEAM = { id: '0190a5c4-0000-7000-8000-000000000030', name: 'Support' }
const USER = {
  id: '0190a5c4-0000-7000-8000-000000000001',
  name: 'Maya',
  email: 'maya@acme.test',
  imageUrl: null,
}

describe('getVaultTab', () => {
  it('falls back to the first tab for an unknown or missing tab', () => {
    expect(getVaultTab('fallback')).toBe('fallback')
    expect(getVaultTab('routing')).toBe('providers')
    expect(getVaultTab(undefined)).toBe('providers')
  })
})

describe('providers and statuses', () => {
  it('names known providers and keeps unknown keys as they are', () => {
    expect(getProviderName('openai')).toBe('OpenAI')
    expect(getProviderName('my_proxy')).toBe('my_proxy')
  })

  it('maps card statuses to the provider chip', () => {
    expect(getChipStatus('rate_limited')).toBe('rate-limited')
    expect(getChipStatus('not_connected')).toBe('not-connected')
    expect(getChipStatus('connected')).toBe('connected')
  })

  it('tones key statuses', () => {
    expect(getStatusTone('active')).toBe('success')
    expect(getStatusTone('error')).toBe('destructive')
    expect(getStatusTone('expired')).toBe('warning')
    expect(getStatusTone('revoked')).toBe('neutral')
  })

  it('masks a secret to its last four characters', () => {
    expect(getMaskedValue('a1B2')).toBe('••••a1B2')
    expect(getMaskedValue(null)).toBe('—')
  })
})

describe('expiry', () => {
  it('counts whole days, rounded up', () => {
    expect(getDaysUntil('2026-10-10T09:00:00.000Z', NOW)).toBe(5)
    expect(getDaysUntil('2026-10-10T10:00:00.000Z', NOW)).toBe(6)
    expect(getDaysUntil('2026-10-04T09:00:00.000Z', NOW)).toBe(-1)
  })

  it('warns only for active keys inside the warning window', () => {
    const soon = { status: 'active', expiresAt: '2026-10-12T09:00:00.000Z' } as const
    expect(getExpiringDays(soon, NOW)).toBe(7)
    expect(getExpiringDays({ ...soon, expiresAt: '2027-01-01T00:00:00.000Z' }, NOW)).toBeNull()
    expect(getExpiringDays({ ...soon, status: 'revoked' }, NOW)).toBeNull()
    expect(getExpiringDays({ status: 'active', expiresAt: null }, NOW)).toBeNull()
  })
})

describe('moveItem', () => {
  it('moves an item and leaves the list alone for out-of-range moves', () => {
    expect(moveItem(['a', 'b', 'c'], 2, 0)).toEqual(['c', 'a', 'b'])
    expect(moveItem(['a', 'b', 'c'], 0, 1)).toEqual(['b', 'a', 'c'])
    expect(moveItem(['a', 'b'], 0, 5)).toEqual(['a', 'b'])
    expect(moveItem(['a', 'b'], -1, 0)).toEqual(['a', 'b'])
  })
})

describe('getFallbackChain', () => {
  it('keeps the entries that can serve requests, in order', () => {
    const entries: FallbackEntryDto[] = [
      { modelKey: 'a', displayName: 'A', state: 'disabled' },
      { modelKey: 'b', displayName: 'B', state: 'ready' },
      { modelKey: 'c', displayName: null, state: 'missing' },
      { modelKey: 'd', displayName: 'D', state: 'ready' },
    ]
    expect(getFallbackChain(entries).map((entry) => entry.modelKey)).toEqual(['b', 'd'])
  })
})

describe('groupModels', () => {
  it('groups by where the model runs', () => {
    const base = {
      displayName: 'M',
      providerKey: 'x',
      type: 'chat',
      dataLocation: 'sent_to_provider',
      costTier: 'low',
      supportsVision: false,
      supportsTools: false,
      contextWindow: null,
    } as const
    const models: UsableModelDto[] = [
      { ...base, modelKey: 'openai/a', source: 'provider' },
      { ...base, modelKey: 'local/1/b', source: 'local' },
      { ...base, modelKey: 'trained/1', source: 'trained' },
      { ...base, modelKey: 'platform/c', source: 'platform' },
    ]
    const groups = groupModels(models)
    expect(groups.provider.map((model) => model.modelKey)).toEqual(['openai/a'])
    expect(groups.local.map((model) => model.modelKey)).toEqual(['local/1/b', 'trained/1'])
    expect(groups.platform).toHaveLength(1)
  })
})

describe('model access values', () => {
  const everyone: ModelAccessRuleDto = {
    id: '1',
    subjectType: 'organization',
    team: null,
    user: null,
    createdAt: '',
  }
  const teamRule: ModelAccessRuleDto = {
    id: '2',
    subjectType: 'team',
    team: TEAM,
    user: null,
    createdAt: '',
  }
  const userRule: ModelAccessRuleDto = {
    id: '3',
    subjectType: 'user',
    team: null,
    user: USER,
    createdAt: '',
  }
  const rules = [everyone, teamRule, userRule]

  it('round-trips rules through the picker values', () => {
    const values = toAccessValues(rules)
    expect(values).toEqual(['organization', `team:${TEAM.id}`, `user:${USER.id}`])
    expect(fromAccessValues(values)).toEqual([
      { subjectType: 'organization' },
      { subjectType: 'team', teamId: TEAM.id },
      { subjectType: 'user', userId: USER.id },
    ])
  })

  it('ignores values it does not know', () => {
    expect(fromAccessValues(['everyone', 'team:abc'])).toEqual([
      { subjectType: 'team', teamId: 'abc' },
    ])
  })

  it('says whether a team is granted, directly or through everyone', () => {
    expect(grantsTeam([everyone], TEAM.id)).toBe(true)
    expect(grantsTeam([teamRule], TEAM.id)).toBe(true)
    expect(grantsTeam([userRule], TEAM.id)).toBe(false)
  })
})
