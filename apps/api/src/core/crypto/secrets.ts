// SPDX-License-Identifier: AGPL-3.0-only
import { rowAad, seal, unseal } from './aesGcm.js'
import { secretFingerprint, secretLast4 } from './masterKey.js'

import type { OrganizationKeyring } from './organizationKeys.js'
import type { DbExecutor } from '@/core/database/index.js'

/** The row a secret belongs to: its AAD binds the ciphertext to it. */
export interface SecretRef {
  table: string
  id: string
  organizationId: string
}

/** The `encryptedSecret()` columns, as written on insert or rotation. */
export interface EncryptedSecretValues {
  secretCiphertext: Buffer
  secretIv: Buffer
  secretAuthTag: Buffer
  dataKeyVersion: number
  secretLast4: string
  secretFingerprint: string
}

/** The stored columns a decryption needs; null when the secret was revoked. */
export interface StoredSecret {
  secretCiphertext: Buffer | null
  secretIv: Buffer | null
  secretAuthTag: Buffer | null
  dataKeyVersion: number | null
}

/**
 * Organization secrets in `encryptedSecret()` columns (conventions-and-security.md, §11). Plain
 * text exists only in the caller's memory, for the duration of the call.
 */
export class SecretCipher {
  constructor(
    private readonly keyring: OrganizationKeyring,
    private readonly fingerprintKey: Buffer,
  ) {}

  async encrypt(tx: DbExecutor, ref: SecretRef, plaintext: string): Promise<EncryptedSecretValues> {
    const { version, key } = await this.keyring.activeKey(tx, ref.organizationId)
    const sealed = seal(
      key,
      Buffer.from(plaintext, 'utf8'),
      rowAad(ref.table, ref.id, ref.organizationId),
    )
    return {
      secretCiphertext: sealed.ciphertext,
      secretIv: sealed.iv,
      secretAuthTag: sealed.authTag,
      dataKeyVersion: version,
      secretLast4: secretLast4(plaintext),
      secretFingerprint: this.fingerprint(ref.organizationId, plaintext),
    }
  }

  /** Null for a revoked secret; throws when the ciphertext does not belong to this row. */
  async decrypt(tx: DbExecutor, ref: SecretRef, stored: StoredSecret): Promise<string | null> {
    const { secretCiphertext, secretIv, secretAuthTag, dataKeyVersion } = stored
    if (!secretCiphertext || !secretIv || !secretAuthTag || dataKeyVersion === null) return null
    const key = await this.keyring.keyForVersion(tx, ref.organizationId, dataKeyVersion)
    return unseal(
      key,
      { ciphertext: secretCiphertext, iv: secretIv, authTag: secretAuthTag },
      rowAad(ref.table, ref.id, ref.organizationId),
    ).toString('utf8')
  }

  /** For the "already added" check before an insert. */
  fingerprint(organizationId: string, secret: string): string {
    return secretFingerprint(this.fingerprintKey, organizationId, secret)
  }
}
