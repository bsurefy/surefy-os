// SPDX-License-Identifier: AGPL-3.0-only
import { rowAad, seal, unseal } from '@/core/crypto/index.js'
import { encryptedColumnNames } from '@/database/columns.js'
import { INSTALL_DATA_KEY_AAD } from '@/modules/install/index.js'

import { KEY_AUDIT_ACTIONS, REENCRYPT_BATCH } from './vault.constants.js'
import { organizationEncryptedTables } from './vaultKeys.repository.js'

import type { StoredSecretRow, VaultKeysRepository } from './vaultKeys.repository.js'
import type { Crypto, RotatedKey } from '@/core/crypto/index.js'
import type { Database, DbExecutor } from '@/core/database/index.js'
import type { Logger } from '@/core/logger/index.js'
import type { AuditRecorder } from '@/modules/audit/index.js'

export interface VaultKeysDeps {
  db: Database
  crypto: Pick<Crypto, 'masterKeys' | 'keyring' | 'secrets'>
  repository: VaultKeysRepository
  audit: AuditRecorder
  logger: Logger
}

/** What a master key re-wrap did. */
export interface RewrapResult {
  organizations: number
  keys: number
  fingerprints: number
  installKey: boolean
}

/** What re-encryption did, per organization. */
export interface ReencryptResult {
  organizations: number
  secrets: number
  /** Retired key versions deleted, by organization id. */
  deleted: Record<string, number[]>
}

const systemActor = (orgId: string) => ({ orgId, userId: null, via: 'system' as const })

/**
 * Key rotation (vault-and-models.md, §1): the data key rotation of one organization, the
 * re-encryption of its secrets to the active version and the deletion of retired keys, and the
 * re-wrap of every data key after a master key change. Each runs under
 * `db.system('key-rotation')`, in short transactions, and each is audited. The operator starts
 * them with `cli keys …`; the daily `vaultRotateKeys` job finishes whatever is left.
 */
export class VaultKeysService {
  constructor(private readonly deps: VaultKeysDeps) {}

  /** Retires the active data key and activates the next version, audited, in one transaction. */
  rotate(orgId: string): Promise<RotatedKey> {
    return this.deps.db.system('key-rotation', async (tx) => {
      const rotated = await this.deps.crypto.keyring.rotate(tx, orgId)
      await this.deps.audit.record(tx, systemActor(orgId), {
        action: KEY_AUDIT_ACTIONS.ROTATED,
        target: { type: 'organization', id: orgId },
        metadata: { counts: { retiredVersion: rotated.retiredVersion, version: rotated.version } },
      })
      return rotated
    })
  }

  /**
   * Master key re-wrap: every data key wrapped by `ENCRYPTION_KEY_PREVIOUS` is wrapped again by
   * `ENCRYPTION_KEY`; `key_version` and the secrets stay. The secret fingerprints derive from the
   * master key, so each organization's are recomputed in the same transaction as its keys. Then
   * the install data key.
   */
  async rewrap(): Promise<RewrapResult> {
    const { masterKeys } = this.deps.crypto
    const result: RewrapResult = { organizations: 0, keys: 0, fingerprints: 0, installKey: false }
    const orgIds = await this.deps.db.system('key-rotation', (tx) =>
      this.deps.repository.organizationsToRewrap(tx, masterKeys.current.id),
    )
    for (const orgId of orgIds) {
      const done = await this.deps.db.system('key-rotation', (tx) =>
        this.rewrapOrganization(tx, orgId),
      )
      result.organizations++
      result.keys += done.keys
      result.fingerprints += done.fingerprints
    }
    result.installKey = await this.rewrapInstallKey()
    return result
  }

  /**
   * Re-encrypts every secret below the active version (all organizations with a retired key, or
   * one), in batches, then deletes the retired keys nothing references.
   */
  async reencrypt(orgId?: string): Promise<ReencryptResult> {
    const result: ReencryptResult = { organizations: 0, secrets: 0, deleted: {} }
    const orgIds = await this.deps.db.system('key-rotation', (tx) =>
      this.deps.repository.organizationsWithRetiredKeys(tx, orgId),
    )
    for (const id of orgIds) {
      try {
        result.secrets += await this.reencryptOrganization(id)
        const deleted = await this.deleteRetiredKeys(id)
        if (deleted.length > 0) result.deleted[id] = deleted
        result.organizations++
      } catch (error) {
        // one organization's failure never stops the others; the next run continues it
        this.deps.logger.error({ err: error, orgId: id }, 'secret re-encryption failed')
      }
    }
    return result
  }

  /** Per organization: active and retired versions and the master key ids that wrap them. */
  status() {
    return this.deps.db.system('key-rotation', (tx) => this.deps.repository.keyStatus(tx))
  }

  /** The organization's id, by id or slug; undefined when there is none. */
  findOrganization(idOrSlug: string): Promise<string | undefined> {
    return this.deps.db.system('key-rotation', (tx) =>
      this.deps.repository.findOrganization(tx, idOrSlug),
    )
  }

  // ---- Private ------------------------------------------------------------------------------

  private async rewrapOrganization(
    tx: DbExecutor,
    orgId: string,
  ): Promise<{ keys: number; fingerprints: number }> {
    const { keyring, masterKeys, secrets } = this.deps.crypto
    const rows = await this.deps.repository.keysToRewrap(tx, orgId, masterKeys.current.id)
    for (const row of rows) {
      const columns = keyring.rewrap(row)
      if (columns !== null) await this.deps.repository.saveRewrap(tx, row.id, columns)
    }
    let fingerprints = 0
    for (const [table, entry] of organizationEncryptedTables()) {
      const column = encryptedColumnNames(entry).fingerprint
      if (column === null) continue
      for (const secret of await this.deps.repository.secretsOf(tx, table, entry, orgId)) {
        const plaintext = await this.open(tx, table, orgId, secret)
        await this.deps.repository.saveFingerprint(
          tx,
          table,
          column,
          orgId,
          secret.id,
          secrets.fingerprint(orgId, plaintext.toString('utf8')),
        )
        fingerprints++
      }
    }
    await this.deps.audit.record(tx, systemActor(orgId), {
      action: KEY_AUDIT_ACTIONS.REWRAPPED,
      target: { type: 'organization', id: orgId },
      metadata: { counts: { keys: rows.length, fingerprints } },
    })
    return { keys: rows.length, fingerprints }
  }

  /** The install data key (`install_settings`, global): re-wrapped when the master key changed. */
  private rewrapInstallKey(): Promise<boolean> {
    const { masterKeys } = this.deps.crypto
    return this.deps.db.global.transaction(async (tx) => {
      const row = await this.deps.repository.lockInstallKey(tx)
      if (
        row?.dataKeyWrapped == null ||
        row.dataKeyIv === null ||
        row.dataKeyAuthTag === null ||
        row.dataKeyMasterKeyId === null ||
        row.dataKeyMasterKeyId === masterKeys.current.id
      ) {
        return false
      }
      const dataKey = masterKeys.unwrap(
        { ciphertext: row.dataKeyWrapped, iv: row.dataKeyIv, authTag: row.dataKeyAuthTag },
        INSTALL_DATA_KEY_AAD,
        row.dataKeyMasterKeyId,
      )
      const wrapped = masterKeys.wrap(dataKey, INSTALL_DATA_KEY_AAD)
      await this.deps.repository.saveInstallKey(tx, {
        wrappedKey: wrapped.ciphertext,
        wrapIv: wrapped.iv,
        wrapAuthTag: wrapped.authTag,
        masterKeyId: wrapped.masterKeyId,
      })
      return true
    })
  }

  /** Every registered table, batch after batch, until no secret is below the active version. */
  private async reencryptOrganization(orgId: string): Promise<number> {
    let total = 0
    for (const [table, entry] of organizationEncryptedTables()) {
      for (;;) {
        const moved = await this.deps.db.system('key-rotation', async (tx) => {
          const active = await this.deps.crypto.keyring.activeKey(tx, orgId)
          const rows = await this.deps.repository.secretsBelow(
            tx,
            table,
            entry,
            orgId,
            active.version,
            REENCRYPT_BATCH,
          )
          for (const secret of rows) {
            const plaintext = await this.open(tx, table, orgId, secret)
            const sealed = seal(active.key, plaintext, rowAad(table, secret.id, orgId))
            await this.deps.repository.saveSecret(tx, table, entry, orgId, secret.id, {
              ...sealed,
              keyVersion: active.version,
            })
          }
          return rows.length
        })
        total += moved
        if (moved < REENCRYPT_BATCH) break
      }
    }
    return total
  }

  private deleteRetiredKeys(orgId: string): Promise<number[]> {
    return this.deps.db.system('key-rotation', async (tx) => {
      const versions = await this.deps.repository.deleteUnreferencedRetiredKeys(tx, orgId)
      if (versions.length > 0) {
        await this.deps.audit.record(tx, systemActor(orgId), {
          action: KEY_AUDIT_ACTIONS.DELETED,
          target: { type: 'organization', id: orgId },
          metadata: { labels: { versions: versions.join(',') } },
        })
      }
      return versions
    })
  }

  /** The plain bytes of a stored secret, with the key of the version it names. */
  private async open(
    tx: DbExecutor,
    table: string,
    orgId: string,
    secret: StoredSecretRow,
  ): Promise<Buffer> {
    const key = await this.deps.crypto.keyring.keyForVersion(tx, orgId, secret.keyVersion)
    return unseal(
      key,
      { ciphertext: secret.ciphertext, iv: secret.iv, authTag: secret.authTag },
      rowAad(table, secret.id, orgId),
    )
  }
}
