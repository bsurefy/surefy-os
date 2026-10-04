// SPDX-License-Identifier: AGPL-3.0-only
import { describe, expect, it } from 'vitest'
import { z } from 'zod'

import {
  COMMUNITY_ENTITLEMENTS,
  COMMUNITY_INSTALL_LIMITS,
  ERROR_CODE_SOURCES,
  ERROR_CODES,
  FEATURE_EDITIONS,
  FEATURES,
  okResponse,
  ORG_ROLES,
  pageQuery,
  pageResponse,
  PERMISSION_DEFINITIONS,
  PERMISSION_MODULES,
  PERMISSIONS,
  ROLE_PERMISSIONS,
  sortQuery,
} from './index.js'

describe('error codes', () => {
  it('are UPPER_SNAKE_CASE and equal to their key', () => {
    for (const [key, value] of Object.entries(ERROR_CODES)) {
      expect(value).toBe(key)
      expect(key).toMatch(/^[A-Z][A-Z0-9]*(?:_[A-Z0-9]+)+$|^[A-Z]+$/)
    }
  })

  it('are declared once across all domain files', () => {
    const declared = Object.values(ERROR_CODE_SOURCES).flatMap((codes) => Object.keys(codes))
    expect(new Set(declared).size).toBe(declared.length)
    expect(Object.keys(ERROR_CODES)).toHaveLength(declared.length)
  })
})

describe('permissions', () => {
  it('use the <resource>:<action> format and are unique', () => {
    const keys = Object.values(PERMISSIONS)
    for (const key of keys) expect(key).toMatch(/^[a-z][a-z-]*:[a-z][a-z-]*$/)
    expect(new Set(keys).size).toBe(keys.length)
    expect(Object.keys(PERMISSION_MODULES)).toHaveLength(keys.length)
  })

  it('give each higher role everything the lower role has', () => {
    for (let i = 1; i < ORG_ROLES.length; i++) {
      const lower = ORG_ROLES[i - 1]
      const higher = ORG_ROLES[i]
      if (!lower || !higher) throw new Error('role order')
      expect(ROLE_PERMISSIONS[higher]).toEqual(expect.arrayContaining([...ROLE_PERMISSIONS[lower]]))
    }
  })

  it('keep organization management away from plain users', () => {
    expect(ROLE_PERMISSIONS.user).toContain(PERMISSIONS.CHAT_USE)
    expect(ROLE_PERMISSIONS.user).not.toContain(PERMISSIONS.VAULT_MANAGE)
    expect(ROLE_PERMISSIONS.admin).not.toContain(PERMISSIONS.BILLING_MANAGE)
    expect(ROLE_PERMISSIONS.owner).toHaveLength(Object.keys(PERMISSION_DEFINITIONS).length)
  })
})

describe('features and entitlements', () => {
  it('give every feature a minimum edition', () => {
    for (const feature of Object.values(FEATURES)) expect(FEATURE_EDITIONS[feature]).toBeDefined()
  })

  it('grant Community every module, no features and one organization', () => {
    expect(COMMUNITY_ENTITLEMENTS.features).toEqual([])
    expect(COMMUNITY_ENTITLEMENTS.modules).toContain('chat')
    expect(COMMUNITY_INSTALL_LIMITS.maxOrganizations).toBe(1)
  })
})

describe('envelope and pagination', () => {
  it('parses data and page responses', () => {
    expect(okResponse(z.object({ id: z.string() })).parse({ data: { id: 'a' } })).toEqual({
      data: { id: 'a' },
    })
    const page = pageResponse(z.string()).parse({ data: ['a'], meta: { nextCursor: null } })
    expect(page.meta.nextCursor).toBeNull()
  })

  it('defaults and caps the page size', () => {
    expect(pageQuery.parse({})).toEqual({ limit: 25 })
    expect(pageQuery.parse({ limit: '50', cursor: 'abc' })).toEqual({ limit: 50, cursor: 'abc' })
    expect(pageQuery.safeParse({ limit: 101 }).success).toBe(false)
  })

  it('accepts only allowed sort fields, ascending or descending', () => {
    const sort = sortQuery(['createdAt', 'name'])
    expect(sort.parse('-createdAt')).toBe('-createdAt')
    expect(sort.safeParse('email').success).toBe(false)
  })
})
