// SPDX-License-Identifier: AGPL-3.0-only
import { describe, expect, it } from 'vitest'

import {
  API_KEY_AUDIT_ACTIONS,
  API_KEY_DISPLAY_PREFIX_LENGTH,
  API_KEY_PREFIX,
  API_KEY_SCOPES_MAX,
  API_KEYS_ERROR_CODES,
  API_KEYS_PERMISSIONS,
  apiKeyCreatedDtoSchema,
  createApiKeyInputSchema,
  ERROR_CODES,
  isApiKeyScopeAllowed,
  listApiKeysQuerySchema,
  ROLE_PERMISSIONS,
  updateApiKeyInputSchema,
} from '../index.js'

const secret = `sk_${'a'.repeat(43)}`

describe('api key schemas', () => {
  it('needs a name and at least one distinct permission-shaped scope', () => {
    const valid = { name: ' Website backend ', scopes: ['agents:invoke'] }
    expect(createApiKeyInputSchema.parse(valid).name).toBe('Website backend')
    expect(createApiKeyInputSchema.safeParse({ ...valid, scopes: [] }).success).toBe(false)
    expect(createApiKeyInputSchema.safeParse({ ...valid, scopes: ['agents'] }).success).toBe(false)
    expect(createApiKeyInputSchema.safeParse({ ...valid, scopes: ['Agents:Invoke'] }).success).toBe(
      false,
    )
    expect(
      createApiKeyInputSchema.safeParse({ ...valid, scopes: ['agents:invoke', 'agents:invoke'] })
        .success,
    ).toBe(false)
    expect(
      createApiKeyInputSchema.safeParse({
        ...valid,
        scopes: Array.from({ length: API_KEY_SCOPES_MAX + 1 }, (_, i) => `a${'b'.repeat(i + 1)}:x`),
      }).success,
    ).toBe(false)
    expect(createApiKeyInputSchema.safeParse({ name: '', scopes: ['a:b'] }).success).toBe(false)
  })

  it('takes an optional ISO expiry', () => {
    const base = { name: 'k', scopes: ['agents:invoke'] }
    expect(
      createApiKeyInputSchema.safeParse({ ...base, expiresAt: '2027-01-01T00:00:00Z' }).success,
    ).toBe(true)
    expect(createApiKeyInputSchema.safeParse({ ...base, expiresAt: 'tomorrow' }).success).toBe(
      false,
    )
  })

  it('never lets a key manage keys', () => {
    expect(isApiKeyScopeAllowed('agents:invoke')).toBe(true)
    expect(isApiKeyScopeAllowed('api-keys:manage')).toBe(false)
  })

  it('shows the full key only in the creation answer, in the sk_ format', () => {
    expect(API_KEY_PREFIX).toBe('sk_')
    expect(API_KEY_DISPLAY_PREFIX_LENGTH).toBe(11)
    const dto = {
      id: '0190a5c4-0000-7000-8000-000000000001',
      name: 'k',
      keyPrefix: secret.slice(0, API_KEY_DISPLAY_PREFIX_LENGTH),
      scopes: ['agents:invoke'],
      status: 'active',
      expiresAt: null,
      isExpired: false,
      lastUsedAt: null,
      lastUsedIp: null,
      createdBy: null,
      revokedAt: null,
      revokedBy: null,
      createdAt: '2026-10-07T10:00:00Z',
      updatedAt: '2026-10-07T10:00:00Z',
    }
    expect(apiKeyCreatedDtoSchema.safeParse({ apiKey: dto, secret }).success).toBe(true)
    expect(apiKeyCreatedDtoSchema.safeParse({ apiKey: dto, secret: 'sk_short' }).success).toBe(
      false,
    )
  })

  it('filters by status and sorts by an allowed field; a rename carries only the name', () => {
    expect(listApiKeysQuerySchema.parse({ status: 'revoked' }).status).toEqual(['revoked'])
    expect(listApiKeysQuerySchema.safeParse({ sort: '-lastUsedAt' }).success).toBe(true)
    expect(listApiKeysQuerySchema.safeParse({ sort: 'keyPrefix' }).success).toBe(false)
    expect(updateApiKeyInputSchema.parse({ name: ' New ', scopes: ['a:b'] })).toEqual({
      name: 'New',
    })
  })
})

describe('api key codes, permissions and audit', () => {
  it('registers every error code', () => {
    for (const code of Object.values(API_KEYS_ERROR_CODES)) expect(ERROR_CODES[code]).toBe(code)
  })

  it('gives key management to Admins and Owners only', () => {
    const key = API_KEYS_PERMISSIONS.API_KEYS_MANAGE.key
    expect(ROLE_PERMISSIONS.builder).not.toContain(key)
    expect(ROLE_PERMISSIONS.admin).toContain(key)
  })

  it('names audit actions <area>.<verb>', () => {
    for (const action of Object.values(API_KEY_AUDIT_ACTIONS)) {
      expect(action).toMatch(/^api_key\.[a-z_]+$/)
    }
  })
})
