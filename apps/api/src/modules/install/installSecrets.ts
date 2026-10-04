// SPDX-License-Identifier: AGPL-3.0-only
import { createCipheriv, createDecipheriv, createHash, randomBytes } from 'node:crypto'

// Envelope encryption of the install's secrets (configuration.md, §5): `ENCRYPTION_KEY` wraps
// the install data key, which encrypts the SMTP password. AES-256-GCM with a 12-byte IV and a
// 16-byte tag; the additional authenticated data binds each ciphertext to its column.
// Kept to what the install module needs until the shared `core/crypto` lands with the vault.

const ALGORITHM = 'aes-256-gcm'
const IV_BYTES = 12
const KEY_BYTES = 32

/** AAD of the wrapped install data key. */
export const DATA_KEY_AAD = 'install_settings:1:data_key'
/** AAD of the SMTP password (organizations-and-members.md, §9). */
export const SMTP_PASSWORD_AAD = 'install_settings:1:install'

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

/** A new random install data key. */
export const newDataKey = (): Buffer => randomBytes(KEY_BYTES)

/** The master key from `ENCRYPTION_KEY` (base64, 32 bytes; validated by the config). */
export const masterKeyOf = (encryptionKey: string): Buffer => Buffer.from(encryptionKey, 'base64')

/** Which master key wrapped a data key: a short digest, never the key itself. */
export const masterKeyIdOf = (masterKey: Buffer): string =>
  createHash('sha256').update(masterKey).digest('hex').slice(0, 16)
