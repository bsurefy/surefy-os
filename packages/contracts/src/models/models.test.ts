// SPDX-License-Identifier: AGPL-3.0-only
import { describe, expect, it } from 'vitest'

import {
  AUTO_MODEL_KEY,
  DEFAULT_VAULT_FALLBACK,
  listVaultModelsQuerySchema,
  localModelKey,
  parseModelKey,
  providerModelKey,
  setModelAccessInputSchema,
  trainedModelKey,
  updateVaultModelInputSchema,
  updateVaultSettingsInputSchema,
  vaultFallbackSchema,
} from '../index.js'

const id = '0190a5c4-0000-7000-8000-000000000001'

describe('model keys', () => {
  it('builds and parses every format', () => {
    expect(parseModelKey(providerModelKey('openai', 'gpt-4.1'))).toEqual({
      source: 'provider',
      providerKey: 'openai',
      providerModelId: 'gpt-4.1',
    })
    expect(parseModelKey(localModelKey(id, 'llama3.1:70b'))).toEqual({
      source: 'local',
      credentialId: id,
      providerModelId: 'llama3.1:70b',
    })
    expect(parseModelKey(trainedModelKey(id))).toEqual({ source: 'trained', trainedModelId: id })
    expect(parseModelKey('platform/fast')).toEqual({ source: 'platform', platformModelId: 'fast' })
    expect(parseModelKey(AUTO_MODEL_KEY)).toEqual({ source: 'auto' })
  })

  it('keeps slashes inside the provider model id', () => {
    expect(parseModelKey('openai_compatible/meta-llama/Llama-3')).toEqual({
      source: 'provider',
      providerKey: 'openai_compatible',
      providerModelId: 'meta-llama/Llama-3',
    })
    expect(parseModelKey(localModelKey(id, 'org/model:7b'))).toMatchObject({
      source: 'local',
      providerModelId: 'org/model:7b',
    })
  })

  it('rejects text that is not a model key', () => {
    for (const key of ['', 'gpt-4', 'openai/', '/gpt', 'local/only', `local/${id}/`]) {
      expect(parseModelKey(key), key).toBeNull()
    }
  })
})

describe('model schemas', () => {
  it('parses boolean and repeated filters from the query string', () => {
    expect(
      listVaultModelsQuerySchema.parse({ isEnabled: 'true', type: 'embedding' }),
    ).toMatchObject({
      isEnabled: true,
      type: ['embedding'],
    })
    expect(listVaultModelsQuerySchema.parse({ isEnabled: 'false' }).isEnabled).toBe(false)
    expect(listVaultModelsQuerySchema.safeParse({ isEnabled: 'maybe' }).success).toBe(false)
  })

  it('checks the subject each access rule needs', () => {
    expect(
      setModelAccessInputSchema.safeParse({
        rules: [{ subjectType: 'organization' }, { subjectType: 'team', teamId: id }],
      }).success,
    ).toBe(true)
    expect(setModelAccessInputSchema.safeParse({ rules: [{ subjectType: 'user' }] }).success).toBe(
      false,
    )
    expect(setModelAccessInputSchema.safeParse({ rules: [] }).success).toBe(true)
    expect(
      updateVaultModelInputSchema.safeParse({
        isEnabled: true,
        access: { rules: [{ subjectType: 'user', userId: id }] },
      }).success,
    ).toBe(true)
  })

  it('locks private chats to local models and rejects a repeated fallback entry', () => {
    expect(vaultFallbackSchema.safeParse(DEFAULT_VAULT_FALLBACK).success).toBe(true)
    expect(
      vaultFallbackSchema.safeParse({ ...DEFAULT_VAULT_FALLBACK, privateChatsLocalOnly: false })
        .success,
    ).toBe(false)
    expect(
      vaultFallbackSchema.safeParse({ ...DEFAULT_VAULT_FALLBACK, order: ['openai/a', 'openai/a'] })
        .success,
    ).toBe(false)
    expect(
      vaultFallbackSchema.safeParse({ ...DEFAULT_VAULT_FALLBACK, timeoutSeconds: 0 }).success,
    ).toBe(false)
    expect(
      vaultFallbackSchema.safeParse({ ...DEFAULT_VAULT_FALLBACK, timeoutSeconds: 30 }).success,
    ).toBe(true)
  })

  it('lets settings clear the embedding model or leave it alone', () => {
    expect(updateVaultSettingsInputSchema.parse({ embeddingModelId: null })).toEqual({
      embeddingModelId: null,
    })
    expect(updateVaultSettingsInputSchema.parse({})).toEqual({})
  })
})
