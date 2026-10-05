// SPDX-License-Identifier: AGPL-3.0-only
import { and, asc, eq, ne, sql } from 'drizzle-orm'

import { ENCRYPTED_TABLES, encryptedColumnNames, type EncryptedTable } from '@/database/columns.js'
import { installSettings, organizationKeys, organizations } from '@/database/tables/index.js'

import type { OrganizationKeyRow, RewrappedKey } from '@/core/crypto/index.js'
import type { DbExecutor } from '@/core/database/index.js'

/** One organization-key-encrypted secret as the re-encryption and re-fingerprint read it. */
export interface StoredSecretRow {
  id: string
  ciphertext: Buffer
  iv: Buffer
  authTag: Buffer
  keyVersion: number
}

export type InstallKeyRow = Pick<
  typeof installSettings.$inferSelect,
  'dataKeyWrapped' | 'dataKeyIv' | 'dataKeyAuthTag' | 'dataKeyMasterKeyId'
>

/** The tables whose secrets the organization data keys encrypt (vault ones and extension ones). */
export const organizationEncryptedTables = (): [string, EncryptedTable][] =>
  [...ENCRYPTED_TABLES].filter(([, entry]) => entry.key === 'organization')

const col = (name: string) => sql.identifier(name)

/**
 * Key rotation statements (vault-and-models.md, §1). They run under `db.system('key-rotation')`
 * (the install row through `db.global`) and touch other modules' tables only through the
 * `encryptedSecret()` registry, by column name.
 */
export class VaultKeysRepository {
  /** Organizations with a data key wrapped by another master key. */
  async organizationsToRewrap(tx: DbExecutor, masterKeyId: string): Promise<string[]> {
    const rows = await tx
      .selectDistinct({ organizationId: organizationKeys.organizationId })
      .from(organizationKeys)
      .where(ne(organizationKeys.masterKeyId, masterKeyId))
    return rows.map((row) => row.organizationId)
  }

  async keysToRewrap(
    tx: DbExecutor,
    organizationId: string,
    masterKeyId: string,
  ): Promise<OrganizationKeyRow[]> {
    return tx
      .select()
      .from(organizationKeys)
      .where(
        and(
          eq(organizationKeys.organizationId, organizationId),
          ne(organizationKeys.masterKeyId, masterKeyId),
        ),
      )
      .orderBy(asc(organizationKeys.keyVersion))
      .for('update')
  }

  async saveRewrap(tx: DbExecutor, id: string, columns: RewrappedKey): Promise<void> {
    await tx.update(organizationKeys).set(columns).where(eq(organizationKeys.id, id))
  }

  /** Organizations that still hold a retired data key. */
  async organizationsWithRetiredKeys(tx: DbExecutor, organizationId?: string): Promise<string[]> {
    const rows = await tx
      .selectDistinct({ organizationId: organizationKeys.organizationId })
      .from(organizationKeys)
      .where(
        and(
          eq(organizationKeys.status, 'retired'),
          organizationId === undefined
            ? undefined
            : eq(organizationKeys.organizationId, organizationId),
        ),
      )
    return rows.map((row) => row.organizationId)
  }

  /** Secrets of one organization encrypted with a version below `below`, locked for the batch. */
  async secretsBelow(
    tx: DbExecutor,
    table: string,
    entry: EncryptedTable,
    organizationId: string,
    below: number,
    limit: number,
  ): Promise<StoredSecretRow[]> {
    const c = encryptedColumnNames(entry)
    const result = await tx.execute<{
      id: string
      ciphertext: Buffer
      iv: Buffer
      auth_tag: Buffer
      key_version: number
    }>(sql`
      select id, ${col(c.ciphertext)} as ciphertext, ${col(c.iv)} as iv,
        ${col(c.authTag)} as auth_tag, ${col(c.keyVersion)} as key_version
      from ${col(table)}
      where organization_id = ${organizationId} and ${col(c.keyVersion)} < ${below}
      order by id
      limit ${limit}
      for update skip locked`)
    return result.rows.map(toSecret)
  }

  /** Every secret of one organization in a table with display columns (re-fingerprint). */
  async secretsOf(
    tx: DbExecutor,
    table: string,
    entry: EncryptedTable,
    organizationId: string,
  ): Promise<StoredSecretRow[]> {
    const c = encryptedColumnNames(entry)
    const result = await tx.execute<{
      id: string
      ciphertext: Buffer
      iv: Buffer
      auth_tag: Buffer
      key_version: number
    }>(sql`
      select id, ${col(c.ciphertext)} as ciphertext, ${col(c.iv)} as iv,
        ${col(c.authTag)} as auth_tag, ${col(c.keyVersion)} as key_version
      from ${col(table)}
      where organization_id = ${organizationId} and ${col(c.ciphertext)} is not null
      for update`)
    return result.rows.map(toSecret)
  }

  async saveSecret(
    tx: DbExecutor,
    table: string,
    entry: EncryptedTable,
    organizationId: string,
    id: string,
    values: { ciphertext: Buffer; iv: Buffer; authTag: Buffer; keyVersion: number },
  ): Promise<void> {
    const c = encryptedColumnNames(entry)
    await tx.execute(sql`
      update ${col(table)} set ${col(c.ciphertext)} = ${values.ciphertext},
        ${col(c.iv)} = ${values.iv}, ${col(c.authTag)} = ${values.authTag},
        ${col(c.keyVersion)} = ${values.keyVersion}
      where organization_id = ${organizationId} and id = ${id}`)
  }

  async saveFingerprint(
    tx: DbExecutor,
    table: string,
    column: string,
    organizationId: string,
    id: string,
    fingerprint: string,
  ): Promise<void> {
    await tx.execute(sql`
      update ${col(table)} set ${col(column)} = ${fingerprint}
      where organization_id = ${organizationId} and id = ${id}`)
  }

  /**
   * Deletes the organization's retired keys that no registered table still references. Returns
   * the deleted versions.
   */
  async deleteUnreferencedRetiredKeys(tx: DbExecutor, organizationId: string): Promise<number[]> {
    const references = organizationEncryptedTables().map(([table, entry]) => {
      const version = col(encryptedColumnNames(entry).keyVersion)
      return sql`exists (select 1 from ${col(table)} s
        where s.organization_id = k.organization_id and s.${version} = k.key_version)`
    })
    const referenced = references.length === 0 ? sql`false` : sql.join(references, sql` or `)
    const result = await tx.execute<{ key_version: number }>(sql`
      delete from organization_keys k
      where k.organization_id = ${organizationId} and k.status = 'retired' and not (${referenced})
      returning k.key_version`)
    return result.rows.map((row) => row.key_version).sort((a, b) => a - b)
  }

  /** Per organization: active version, retired versions and the master key ids in use. */
  async keyStatus(tx: DbExecutor): Promise<
    {
      organizationId: string
      slug: string
      activeVersion: number | null
      retiredVersions: number[]
      masterKeyIds: string[]
    }[]
  > {
    const result = await tx.execute<{
      organization_id: string
      slug: string
      active_version: number | null
      retired_versions: number[] | null
      master_key_ids: string[] | null
    }>(sql`
      select o.id as organization_id, o.slug,
        max(k.key_version) filter (where k.status = 'active') as active_version,
        array_agg(k.key_version order by k.key_version) filter (where k.status = 'retired') as retired_versions,
        array_agg(distinct k.master_key_id) filter (where k.id is not null) as master_key_ids
      from ${organizations} o
      left join organization_keys k on k.organization_id = o.id
      group by o.id, o.slug
      order by o.slug`)
    return result.rows.map((row) => ({
      organizationId: row.organization_id,
      slug: row.slug,
      activeVersion: row.active_version,
      retiredVersions: row.retired_versions ?? [],
      masterKeyIds: row.master_key_ids ?? [],
    }))
  }

  /** The organization by id or slug. */
  async findOrganization(tx: DbExecutor, idOrSlug: string): Promise<string | undefined> {
    const isUuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(idOrSlug)
    const [row] = await tx
      .select({ id: organizations.id })
      .from(organizations)
      .where(isUuid ? eq(organizations.id, idOrSlug) : eq(organizations.slug, idOrSlug))
    return row?.id
  }

  // ---- The install data key (`db.global`) -----------------------------------------------------

  async lockInstallKey(executor: DbExecutor): Promise<InstallKeyRow | undefined> {
    const [row] = await executor
      .select({
        dataKeyWrapped: installSettings.dataKeyWrapped,
        dataKeyIv: installSettings.dataKeyIv,
        dataKeyAuthTag: installSettings.dataKeyAuthTag,
        dataKeyMasterKeyId: installSettings.dataKeyMasterKeyId,
      })
      .from(installSettings)
      .where(eq(installSettings.id, 1))
      .for('update')
    return row
  }

  async saveInstallKey(executor: DbExecutor, columns: RewrappedKey): Promise<void> {
    await executor
      .update(installSettings)
      .set({
        dataKeyWrapped: columns.wrappedKey,
        dataKeyIv: columns.wrapIv,
        dataKeyAuthTag: columns.wrapAuthTag,
        dataKeyMasterKeyId: columns.masterKeyId,
      })
      .where(eq(installSettings.id, 1))
  }
}

const toSecret = (row: {
  id: string
  ciphertext: Buffer
  iv: Buffer
  auth_tag: Buffer
  key_version: number
}): StoredSecretRow => ({
  id: row.id,
  ciphertext: row.ciphertext,
  iv: row.iv,
  authTag: row.auth_tag,
  keyVersion: row.key_version,
})
