// SPDX-License-Identifier: AGPL-3.0-only
import { createCipheriv, createDecipheriv, randomBytes } from 'node:crypto'

// AES-256-GCM with a fresh 12-byte IV and a 16-byte tag (conventions-and-security.md, §11). The
// additional authenticated data binds each ciphertext to its row and column.

const ALGORITHM = 'aes-256-gcm'
const IV_BYTES = 12
const KEY_BYTES = 32

export interface Sealed {
  ciphertext: Buffer
  iv: Buffer
  authTag: Buffer
}

export function seal(key: Buffer, plaintext: Buffer, aad: string): Sealed {
  const iv = randomBytes(IV_BYTES)
  const cipher = createCipheriv(ALGORITHM, key, iv)
  cipher.setAAD(Buffer.from(aad, 'utf8'))
  const ciphertext = Buffer.concat([cipher.update(plaintext), cipher.final()])
  return { ciphertext, iv, authTag: cipher.getAuthTag() }
}

/** Throws when the key, the AAD or any byte of the sealed value is wrong. */
export function unseal(key: Buffer, sealed: Sealed, aad: string): Buffer {
  const decipher = createDecipheriv(ALGORITHM, key, sealed.iv)
  decipher.setAAD(Buffer.from(aad, 'utf8'))
  decipher.setAuthTag(sealed.authTag)
  return Buffer.concat([decipher.update(sealed.ciphertext), decipher.final()])
}

/** A new random 256-bit data key. */
export const newDataKey = (): Buffer => randomBytes(KEY_BYTES)

/**
 * The additional authenticated data of a secret column: `'<table>:<id>:<organization_id>'`, with
 * `install` as the organization part for install-level secrets.
 */
export const rowAad = (table: string, id: string, organizationId: string | null): string =>
  `${table}:${id}:${organizationId ?? 'install'}`
