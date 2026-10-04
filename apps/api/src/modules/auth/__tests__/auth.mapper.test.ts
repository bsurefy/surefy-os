// SPDX-License-Identifier: AGPL-3.0-only
import { describe, expect, it } from 'vitest'

import { toSessionDto, toUserPreferencesDto } from '../auth.mapper.js'

import type { SessionRow, UserPreferencesRow } from '../auth.repository.js'

const ORG = '0199c0de-0000-7000-8000-00000000000a'
const at = new Date('2026-10-01T10:00:00.000Z')

const preferences = (overrides: Partial<UserPreferencesRow> = {}): UserPreferencesRow => ({
  userId: '0199c0de-0000-7000-8000-000000000001',
  locale: 'en',
  theme: 'dark',
  timezone: 'Europe/Berlin',
  lastOrganizationId: ORG,
  createdAt: at,
  updatedAt: at,
  ...overrides,
})

describe('toUserPreferencesDto', () => {
  it('uses every default when the person has no row', () => {
    expect(toUserPreferencesDto(undefined, new Set())).toEqual({
      locale: null,
      theme: 'system',
      timezone: null,
      lastOrganizationId: null,
    })
  })

  it('keeps the last organization only while the membership is active', () => {
    expect(toUserPreferencesDto(preferences(), new Set([ORG])).lastOrganizationId).toBe(ORG)
    expect(toUserPreferencesDto(preferences(), new Set()).lastOrganizationId).toBeNull()
  })
})

describe('toSessionDto', () => {
  it('marks the current session and never exposes the token', () => {
    const row: SessionRow = {
      id: 's1',
      token: 'secret-token',
      userId: 'u1',
      expiresAt: at,
      ipAddress: '203.0.113.7',
      userAgent: 'Firefox',
      app: 'workspace',
      createdAt: at,
      updatedAt: at,
    }
    const dto = toSessionDto(row, 's1')
    expect(dto).toMatchObject({ id: 's1', isCurrent: true, ipAddress: '203.0.113.7' })
    expect(JSON.stringify(dto)).not.toContain('secret-token')
    expect(toSessionDto(row, 's2').isCurrent).toBe(false)
  })
})
