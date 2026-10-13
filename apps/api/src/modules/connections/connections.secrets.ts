// SPDX-License-Identifier: AGPL-3.0-only
import { secretLast4 } from '@/core/crypto/index.js'
import { connectionSecretSchema } from '@surefy/contracts'
import type { ConnectionSecret } from '@surefy/contracts'

import { TABLE } from './connections.constants.js'

import type { SecretCipher, StoredSecret } from '@/core/crypto/index.js'
import type { DbExecutor } from '@/core/database/index.js'

/** The `enc` columns as written: the display values may be null (OAuth, basic, open endpoints). */
export interface SealedSecret {
  secretCiphertext: Buffer
  secretIv: Buffer
  secretAuthTag: Buffer
  dataKeyVersion: number
  secretLast4: string | null
  secretFingerprint: string | null
}

/** All `enc` columns cleared, as a revoke leaves them. */
export const NO_SECRET = {
  secretCiphertext: null,
  secretIv: null,
  secretAuthTag: null,
  dataKeyVersion: null,
  secretLast4: null,
  secretFingerprint: null,
} as const

/** The value a person pasted, when there is exactly one: a key or a token. */
const pastedValue = (secret: ConnectionSecret): string | null =>
  secret.apiKey ?? secret.token ?? null

/**
 * `ConnectionSecret` v1 as one encrypted JSON document (database/bridge-and-connections.md, §1).
 * Plain text exists only in the caller's memory; the display columns come from the pasted
 * key or token, never from the JSON.
 */
export class ConnectionSecrets {
  constructor(private readonly cipher: SecretCipher) {}

  async seal(
    tx: DbExecutor,
    ref: { id: string; organizationId: string },
    secret: ConnectionSecret,
  ): Promise<SealedSecret> {
    const encrypted = await this.cipher.encrypt(
      tx,
      { table: TABLE, ...ref },
      JSON.stringify(secret),
    )
    const pasted = pastedValue(secret)
    return {
      secretCiphertext: encrypted.secretCiphertext,
      secretIv: encrypted.secretIv,
      secretAuthTag: encrypted.secretAuthTag,
      dataKeyVersion: encrypted.dataKeyVersion,
      secretLast4: pasted === null ? null : secretLast4(pasted),
      secretFingerprint:
        pasted === null ? null : this.cipher.fingerprint(ref.organizationId, pasted),
    }
  }

  /** Null for a connection without a secret (revoked, or no sign-in). */
  async open(
    tx: DbExecutor,
    ref: { id: string; organizationId: string },
    stored: StoredSecret,
  ): Promise<ConnectionSecret | null> {
    const plain = await this.cipher.decrypt(tx, { table: TABLE, ...ref }, stored)
    if (plain === null) return null
    return connectionSecretSchema.parse(JSON.parse(plain))
  }

  fingerprint(organizationId: string, value: string): string {
    return this.cipher.fingerprint(organizationId, value)
  }
}
