// SPDX-License-Identifier: AGPL-3.0-only
import { describe, expect, it } from 'vitest'

import { PERMISSIONS } from '@surefy/contracts'

import {
  buildCurlExample,
  getApiBaseUrl,
  getApiKeyRowStatus,
  getAvailableScopes,
  getEarliestExpiryDate,
  getExpiresAt,
  getRevokeImpact,
  splitScopes,
  toSortParam,
} from './ApiKeysSettings.utils'

const NOW = new Date('2026-01-15T09:00:00.000Z')

describe('getApiKeyRowStatus', () => {
  it('reads revoked first, then expired, then active', () => {
    expect(getApiKeyRowStatus({ status: 'revoked', isExpired: true })).toBe('revoked')
    expect(getApiKeyRowStatus({ status: 'active', isExpired: true })).toBe('expired')
    expect(getApiKeyRowStatus({ status: 'active', isExpired: false })).toBe('active')
  })
})

describe('toSortParam', () => {
  it('turns a leading dash into a descending sort', () => {
    expect(toSortParam('-createdAt')).toEqual({ id: 'createdAt', desc: true })
    expect(toSortParam('name')).toEqual({ id: 'name', desc: false })
  })
})

describe('splitScopes', () => {
  it('shows the first permission and counts the rest', () => {
    expect(splitScopes(['agents:invoke', 'a:b', 'c:d'])).toEqual({
      shown: ['agents:invoke'],
      more: 2,
    })
    expect(splitScopes(['agents:invoke'])).toEqual({ shown: ['agents:invoke'], more: 0 })
  })
})

describe('getAvailableScopes', () => {
  it('lists only the permissions the person holds', () => {
    expect(getAvailableScopes(() => true)).toEqual([PERMISSIONS.AGENTS_INVOKE])
    expect(getAvailableScopes(() => false)).toEqual([])
  })
})

describe('getExpiresAt', () => {
  it('counts the presets from now', () => {
    expect(getExpiresAt('30d', '', NOW)).toBe('2026-02-14T09:00:00.000Z')
    expect(getExpiresAt('90d', '', NOW)).toBe('2026-04-15T09:00:00.000Z')
    expect(getExpiresAt('1y', '', NOW)).toBe('2027-01-15T09:00:00.000Z')
  })

  it('ends a picked day at its last second, and leaves no expiry for "never"', () => {
    expect(getExpiresAt('date', '2026-03-01', NOW)).toBe('2026-03-01T23:59:59.000Z')
    expect(getExpiresAt('never', '', NOW)).toBeUndefined()
  })
})

describe('getEarliestExpiryDate', () => {
  it('is tomorrow', () => {
    expect(getEarliestExpiryDate(NOW)).toBe('2026-01-16')
  })
})

describe('getApiBaseUrl', () => {
  it('moves the Cloud app host to the API host', () => {
    expect(getApiBaseUrl('https://app.surefyos.com')).toBe('https://api.surefyos.com')
  })

  it('keeps a self-hosted address, port included', () => {
    expect(getApiBaseUrl('http://surefy.example.com:8080')).toBe('http://surefy.example.com:8080')
  })
})

describe('buildCurlExample', () => {
  it('puts the key in the authorization header and the organization in the path', () => {
    const example = buildCurlExample('https://api.surefyos.com', 'org-1', 'sk_abc')
    expect(example).toContain('https://api.surefyos.com/api/v1/orgs/org-1/agents/')
    expect(example).toContain('Authorization: Bearer sk_abc')
  })
})

describe('getRevokeImpact', () => {
  it('names the agents and counts those beyond the listed names', () => {
    const impact = getRevokeImpact({
      dependents: [
        { type: 'agent', count: 4 },
        { type: 'flow', count: 1 },
      ],
      listed: [
        { type: 'agent', id: '00000000-0000-4000-8000-000000000001', name: 'Support triage' },
        { type: 'agent', id: '00000000-0000-4000-8000-000000000002', name: 'HR helper' },
      ],
    })
    expect(impact).toEqual({
      agentCount: 4,
      agentNames: ['Support triage', 'HR helper'],
      moreAgents: 2,
      others: [{ type: 'flow', count: 1 }],
    })
  })

  it('is empty for an unused key', () => {
    expect(getRevokeImpact({ dependents: [], listed: [] }).agentCount).toBe(0)
  })
})
