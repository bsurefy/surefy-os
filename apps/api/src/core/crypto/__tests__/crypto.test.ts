// SPDX-License-Identifier: AGPL-3.0-only
import { describe, expect, it } from 'vitest'

import {
  fingerprintKeyOf,
  masterKeyIdOf,
  masterKeyOf,
  newDataKey,
  rowAad,
  seal,
  secretFingerprint,
  secretLast4,
  unseal,
} from '../index.js'

const ORG_A = '0191a5f0-0000-7000-8000-000000000001'
const ORG_B = '0191a5f0-0000-7000-8000-000000000002'
const ROW = '0191a5f0-0000-7000-8000-0000000000aa'

describe('seal and unseal', () => {
  it('round-trips with the same key and AAD', () => {
    const key = newDataKey()
    const aad = rowAad('vault_credentials', ROW, ORG_A)
    const sealed = seal(key, Buffer.from('sk-secret'), aad)
    expect(sealed.iv).toHaveLength(12)
    expect(sealed.authTag).toHaveLength(16)
    expect(unseal(key, sealed, aad).toString()).toBe('sk-secret')
  })

  it('refuses a ciphertext moved to another row or organization', () => {
    const key = newDataKey()
    const sealed = seal(key, Buffer.from('sk-secret'), rowAad('vault_credentials', ROW, ORG_A))
    expect(() => unseal(key, sealed, rowAad('vault_credentials', ROW, ORG_B))).toThrow()
    expect(() => unseal(key, sealed, rowAad('connections', ROW, ORG_A))).toThrow()
  })

  it('refuses another key or a tampered byte', () => {
    const key = newDataKey()
    const aad = rowAad('vault_credentials', ROW, ORG_A)
    const sealed = seal(key, Buffer.from('sk-secret'), aad)
    expect(() => unseal(newDataKey(), sealed, aad)).toThrow()
    const tampered = Buffer.from(sealed.ciphertext)
    tampered[0] = (tampered[0] ?? 0) ^ 1
    expect(() => unseal(key, { ...sealed, ciphertext: tampered }, aad)).toThrow()
  })

  it('uses install as the organization part of install-level secrets', () => {
    expect(rowAad('install_settings', '1', null)).toBe('install_settings:1:install')
  })
})

describe('master key helpers', () => {
  const masterKey = masterKeyOf(Buffer.alloc(32, 7).toString('base64'))

  it('identifies the master key without revealing it', () => {
    const id = masterKeyIdOf(masterKey)
    expect(id).toMatch(/^[0-9a-f]{16}$/)
    expect(id).toBe(masterKeyIdOf(masterKeyOf(Buffer.alloc(32, 7).toString('base64'))))
    expect(id).not.toBe(masterKeyIdOf(masterKeyOf(Buffer.alloc(32, 8).toString('base64'))))
  })

  it('fingerprints a secret per organization, never across them', () => {
    const fingerprintKey = fingerprintKeyOf(masterKey)
    const a = secretFingerprint(fingerprintKey, ORG_A, 'sk-secret')
    expect(a).toMatch(/^[0-9a-f]{16}$/)
    expect(secretFingerprint(fingerprintKey, ORG_A, 'sk-secret')).toBe(a)
    expect(secretFingerprint(fingerprintKey, ORG_B, 'sk-secret')).not.toBe(a)
    expect(secretFingerprint(fingerprintKey, ORG_A, 'sk-other')).not.toBe(a)
  })

  it('keeps the last four characters for display', () => {
    expect(secretLast4('sk-proj-abcd1234')).toBe('1234')
  })
})
