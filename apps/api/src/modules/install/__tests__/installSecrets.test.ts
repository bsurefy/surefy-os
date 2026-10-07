// SPDX-License-Identifier: AGPL-3.0-only
import { describe, expect, it } from 'vitest'

import {
  DATA_KEY_AAD,
  masterKeyIdOf,
  newDataKey,
  seal,
  SMTP_PASSWORD_AAD,
  unseal,
} from '../installSecrets.js'

describe('install secrets', () => {
  it('round-trips a value through AES-256-GCM', () => {
    const key = newDataKey()
    const sealed = seal(key, Buffer.from('secret'), SMTP_PASSWORD_AAD)
    expect(sealed.iv).toHaveLength(12)
    expect(sealed.authTag).toHaveLength(16)
    expect(unseal(key, sealed, SMTP_PASSWORD_AAD).toString()).toBe('secret')
  })

  it('refuses another key, another AAD or a changed ciphertext', () => {
    const key = newDataKey()
    const sealed = seal(key, Buffer.from('secret'), SMTP_PASSWORD_AAD)
    expect(() => unseal(newDataKey(), sealed, SMTP_PASSWORD_AAD)).toThrow()
    expect(() => unseal(key, sealed, DATA_KEY_AAD)).toThrow()
    const tampered = { ...sealed, ciphertext: Buffer.from(sealed.ciphertext.map((b) => b ^ 1)) }
    expect(() => unseal(key, tampered, SMTP_PASSWORD_AAD)).toThrow()
  })

  it('identifies a master key without revealing it', () => {
    const key = newDataKey()
    expect(masterKeyIdOf(key)).toMatch(/^[0-9a-f]{16}$/)
    expect(masterKeyIdOf(key)).not.toContain(key.toString('hex').slice(0, 16))
  })
})
