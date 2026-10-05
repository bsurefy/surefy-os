// SPDX-License-Identifier: AGPL-3.0-only
import { describe, expect, it } from 'vitest'

import {
  connectionTestInputSchema,
  createCredentialInputSchema,
  createLocalServerInputSchema,
  createPersonalCredentialInputSchema,
  credentialImpactQuerySchema,
  FILTER_VALUES_MAX,
  listCredentialsQuerySchema,
  updateCredentialInputSchema,
  VAULT_AUDIT_ACTIONS,
  VAULT_ERROR_CODES,
} from '../index.js'

const id = '0190a5c4-0000-7000-8000-000000000001'

describe('vault schemas', () => {
  it('turns one or repeated filter values into an array and checks the sort', () => {
    expect(listCredentialsQuerySchema.parse({ kind: 'local_server' }).kind).toEqual([
      'local_server',
    ])
    expect(listCredentialsQuerySchema.parse({ status: ['active', 'error'] }).status).toEqual([
      'active',
      'error',
    ])
    expect(listCredentialsQuerySchema.parse({}).scope).toBeUndefined()
    expect(
      listCredentialsQuerySchema.safeParse({
        scope: Array.from({ length: FILTER_VALUES_MAX + 1 }, () => 'team'),
      }).success,
    ).toBe(false)
    expect(listCredentialsQuerySchema.safeParse({ sort: '-lastUsedAt' }).success).toBe(true)
    expect(listCredentialsQuerySchema.safeParse({ sort: 'secret' }).success).toBe(false)
  })

  it('needs a secret to test or save a provider key, and an address for a local server', () => {
    expect(
      connectionTestInputSchema.safeParse({ kind: 'ai_provider', providerKey: 'openai' }).success,
    ).toBe(false)
    expect(
      connectionTestInputSchema.safeParse({
        kind: 'ai_provider',
        providerKey: 'openai',
        secret: ' sk-test ',
      }),
    ).toMatchObject({ success: true, data: { secret: 'sk-test' } })
    expect(
      connectionTestInputSchema.safeParse({ kind: 'local_server', providerKey: 'ollama' }).success,
    ).toBe(false)
    expect(
      connectionTestInputSchema.safeParse({
        kind: 'local_server',
        providerKey: 'ollama',
        baseUrl: 'http://localhost:11434',
      }).success,
    ).toBe(true)
    expect(
      connectionTestInputSchema.safeParse({
        kind: 'local_server',
        providerKey: 'ollama',
        baseUrl: 'file:///host',
      }).success,
    ).toBe(false)
  })

  it('ties team keys to a team and keeps personal keys out of the admin route', () => {
    const base = { name: 'Production', providerKey: 'anthropic', secret: 'sk-ant' }
    expect(createCredentialInputSchema.safeParse({ ...base, scope: 'organization' }).success).toBe(
      true,
    )
    expect(createCredentialInputSchema.safeParse({ ...base, scope: 'team' }).success).toBe(false)
    expect(
      createCredentialInputSchema.safeParse({ ...base, scope: 'team', teamId: id }).success,
    ).toBe(true)
    expect(createCredentialInputSchema.safeParse({ ...base, scope: 'personal' }).success).toBe(
      false,
    )
    expect(
      createCredentialInputSchema.safeParse({
        ...base,
        scope: 'organization',
        rotatesCredentialId: id,
        expiresAt: '2027-01-01T00:00:00.000Z',
      }).success,
    ).toBe(true)
    expect(createPersonalCredentialInputSchema.safeParse(base).success).toBe(true)
  })

  it('limits local servers to the supported servers and the organization or a team', () => {
    const base = { name: 'GPU box', providerKey: 'vllm', baseUrl: 'https://gpu.internal:8000' }
    expect(createLocalServerInputSchema.safeParse({ ...base, scope: 'organization' }).success).toBe(
      true,
    )
    expect(createLocalServerInputSchema.safeParse({ ...base, scope: 'personal' }).success).toBe(
      false,
    )
    expect(
      createLocalServerInputSchema.safeParse({
        ...base,
        providerKey: 'openai',
        scope: 'team',
        teamId: id,
      }).success,
    ).toBe(false)
  })

  it('accepts partial updates and the impact actions', () => {
    expect(updateCredentialInputSchema.parse({ name: 'Renamed' })).toEqual({ name: 'Renamed' })
    expect(updateCredentialInputSchema.safeParse({ expiresAt: null }).success).toBe(true)
    expect(credentialImpactQuerySchema.safeParse({ action: 'revoke' }).success).toBe(true)
    expect(credentialImpactQuerySchema.safeParse({ action: 'delete' }).success).toBe(false)
  })

  it('uses the audit action format and keeps the failure codes as API error codes', () => {
    for (const action of Object.values(VAULT_AUDIT_ACTIONS)) {
      expect(action).toMatch(/^[a-z][a-z0-9_]*\.[a-z][a-z0-9_]*$/)
    }
    expect(VAULT_ERROR_CODES.LOCAL_SERVER_UNREACHABLE).toBe('LOCAL_SERVER_UNREACHABLE')
  })
})
