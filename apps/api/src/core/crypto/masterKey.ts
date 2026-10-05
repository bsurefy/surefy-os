// SPDX-License-Identifier: AGPL-3.0-only
import { createHash, createHmac, hkdfSync } from 'node:crypto'

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
