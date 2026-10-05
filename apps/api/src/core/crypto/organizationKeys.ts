// SPDX-License-Identifier: AGPL-3.0-only
import { and, eq, sql } from 'drizzle-orm'

import { organizationKeys } from '@/database/tables/index.js'

import { newDataKey, rowAad, seal, unseal } from './aesGcm.js'

import type { DbExecutor } from '@/core/database/index.js'

const CACHE_TTL_MS = 5 * 60_000
const CACHE_MAX_ENTRIES = 1000
const FIRST_VERSION = 1

export interface DataKey {
  version: number
  key: Buffer
}

export interface OrganizationKeyringOptions {
  masterKey: Buffer
  masterKeyId: string
  now?: () => number
}

interface CachedKey {
  key: Buffer
  expiresAt: number
}

type KeyRow = typeof organizationKeys.$inferSelect

/**
 * The organizations' data keys (vault-and-models.md, §1): one active version per organization,
 * wrapped by the master key with the AAD `'organization_keys:<id>:<organization_id>'`. Unwrapped
 * keys live only in this process, in a small cache with a 5-minute lifetime; never in Redis, logs
 * or job payloads. Every method runs in the caller's tenant transaction.
 */
export class OrganizationKeyring {
  private readonly cache = new Map<string, CachedKey>()
  private readonly now: () => number

  constructor(private readonly options: OrganizationKeyringOptions) {
    this.now = options.now ?? Date.now
  }

  /**
   * Version 1, inserted in the transaction that creates the organization. A second call is a
   * no-op: the one-active-key index keeps the first.
   */
  async createInitialKey(tx: DbExecutor, organizationId: string): Promise<void> {
    const result = await tx.execute<{ id: string }>(sql`select uuidv7() as id`)
    const id = result.rows[0]?.id
    if (id === undefined) throw new Error('uuidv7() returned no row')
    const wrapped = seal(
      this.options.masterKey,
      newDataKey(),
      rowAad('organization_keys', id, organizationId),
    )
    await tx
      .insert(organizationKeys)
      .values({
        id,
        organizationId,
        keyVersion: FIRST_VERSION,
        wrappedKey: wrapped.ciphertext,
        wrapIv: wrapped.iv,
        wrapAuthTag: wrapped.authTag,
        masterKeyId: this.options.masterKeyId,
      })
      .onConflictDoNothing()
  }

  /**
   * The key new secrets are encrypted with. An organization created before the vault existed gets
   * its version 1 here, the first time it needs one.
   */
  async activeKey(tx: DbExecutor, organizationId: string): Promise<DataKey> {
    let row = await this.findActive(tx, organizationId)
    if (row === undefined) {
      await this.createInitialKey(tx, organizationId)
      row = await this.findActive(tx, organizationId)
    }
    if (row === undefined) throw new Error(`organization ${organizationId} has no active data key`)
    return { version: row.keyVersion, key: this.unwrap(row) }
  }

  private async findActive(tx: DbExecutor, organizationId: string): Promise<KeyRow | undefined> {
    const [row] = await tx
      .select()
      .from(organizationKeys)
      .where(
        and(
          eq(organizationKeys.organizationId, organizationId),
          eq(organizationKeys.status, 'active'),
        ),
      )
    return row
  }

  /** The key a stored secret names in its `data_key_version`, active or retired. */
  async keyForVersion(tx: DbExecutor, organizationId: string, version: number): Promise<Buffer> {
    const cached = this.cached(organizationId, version)
    if (cached) return cached
    const [row] = await tx
      .select()
      .from(organizationKeys)
      .where(
        and(
          eq(organizationKeys.organizationId, organizationId),
          eq(organizationKeys.keyVersion, version),
        ),
      )
    if (row === undefined) {
      throw new Error(`organization ${organizationId} has no data key version ${String(version)}`)
    }
    return this.unwrap(row)
  }

  private unwrap(row: KeyRow): Buffer {
    const cached = this.cached(row.organizationId, row.keyVersion)
    if (cached) return cached
    const key = unseal(
      this.options.masterKey,
      { ciphertext: row.wrappedKey, iv: row.wrapIv, authTag: row.wrapAuthTag },
      rowAad('organization_keys', row.id, row.organizationId),
    )
    if (this.cache.size >= CACHE_MAX_ENTRIES) {
      const oldest = this.cache.keys().next().value
      if (oldest !== undefined) this.cache.delete(oldest)
    }
    this.cache.set(cacheKey(row.organizationId, row.keyVersion), {
      key,
      expiresAt: this.now() + CACHE_TTL_MS,
    })
    return key
  }

  private cached(organizationId: string, version: number): Buffer | undefined {
    const entry = this.cache.get(cacheKey(organizationId, version))
    if (entry === undefined) return undefined
    if (entry.expiresAt <= this.now()) {
      this.cache.delete(cacheKey(organizationId, version))
      return undefined
    }
    return entry.key
  }
}

const cacheKey = (organizationId: string, version: number) => `${organizationId}:${String(version)}`
