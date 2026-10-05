// SPDX-License-Identifier: AGPL-3.0-only
import { createHash, createHmac, hkdfSync } from 'node:crypto'

import { seal, unseal, type Sealed } from './aesGcm.js'

const FINGERPRINT_INFO = 'surefy:secret-fingerprint:v1'
const FINGERPRINT_HEX_CHARS = 16
const LAST_CHARS = 4

/** The master key from `ENCRYPTION_KEY` (base64, 32 bytes; validated by the config). */
export const masterKeyOf = (encryptionKey: string): Buffer => Buffer.from(encryptionKey, 'base64')

/** Which master key wrapped a data key: a short digest, never the key itself. */
export const masterKeyIdOf = (masterKey: Buffer): string =>
  createHash('sha256').update(masterKey).digest('hex').slice(0, 16)

/** The key the secret fingerprints use, derived from the master key with HKDF. */
export const fingerprintKeyOf = (masterKey: Buffer): Buffer =>
  Buffer.from(hkdfSync('sha256', masterKey, Buffer.alloc(0), FINGERPRINT_INFO, 32))

/**
 * First 16 hex characters of `HMAC-SHA256(fingerprintKey, organization_id || secret)`: finds the
 * same secret added twice in one organization, without allowing an offline guess and without
 * being comparable across organizations.
 */
export const secretFingerprint = (
  fingerprintKey: Buffer,
  organizationId: string,
  secret: string,
): string =>
  createHmac('sha256', fingerprintKey)
    .update(organizationId)
    .update(secret)
    .digest('hex')
    .slice(0, FINGERPRINT_HEX_CHARS)

/** The last four characters, shown as the masked value. */
export const secretLast4 = (secret: string): string => secret.slice(-LAST_CHARS)

/** One master key and its id. */
export interface MasterKey {
  id: string
  key: Buffer
}

/** A data key wrapped by the current master key, with that key's id. */
export interface WrappedDataKey extends Sealed {
  masterKeyId: string
}

/** Thrown when a data key was wrapped by a master key this process does not have. */
export class MasterKeyUnavailableError extends Error {
  constructor(readonly masterKeyId: string) {
    super(
      `data key wrapped by master key ${masterKeyId}, which is neither ENCRYPTION_KEY nor ENCRYPTION_KEY_PREVIOUS`,
    )
    this.name = 'MasterKeyUnavailableError'
  }
}

/**
 * `ENCRYPTION_KEY` and, while a master key change is under way, `ENCRYPTION_KEY_PREVIOUS`. New
 * wraps always use the current key; a data key wrapped by the previous one stays readable until
 * the re-wrap moves it (vault-and-models.md, §1).
 */
export class MasterKeys {
  readonly current: MasterKey
  readonly previous: MasterKey | undefined

  constructor(encryptionKey: string, previousEncryptionKey?: string) {
    this.current = masterKeyFrom(encryptionKey)
    const previous =
      previousEncryptionKey === undefined ? undefined : masterKeyFrom(previousEncryptionKey)
    this.previous = previous?.id === this.current.id ? undefined : previous
  }

  wrap(dataKey: Buffer, aad: string): WrappedDataKey {
    return { ...seal(this.current.key, dataKey, aad), masterKeyId: this.current.id }
  }

  /** Unwraps with the master key that wrapped the data key. */
  unwrap(sealed: Sealed, aad: string, masterKeyId: string): Buffer {
    return unseal(this.keyFor(masterKeyId).key, sealed, aad)
  }

  private keyFor(masterKeyId: string): MasterKey {
    if (masterKeyId === this.current.id) return this.current
    if (masterKeyId === this.previous?.id) return this.previous
    throw new MasterKeyUnavailableError(masterKeyId)
  }
}

const masterKeyFrom = (encryptionKey: string): MasterKey => {
  const key = masterKeyOf(encryptionKey)
  return { id: masterKeyIdOf(key), key }
}
