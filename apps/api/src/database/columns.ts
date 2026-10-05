// SPDX-License-Identifier: AGPL-3.0-only
import { sql } from 'drizzle-orm'
import { type AnyPgColumn, char, check, integer, text, timestamp, uuid } from 'drizzle-orm/pg-core'

import { bytea } from './columnTypes.js'

/** `uuid` primary key with the native Postgres 18 `uuidv7()`: time-ordered and safe to expose. */
export const id = () =>
  uuid()
    .primaryKey()
    .default(sql`uuidv7()`)

/** Required on every tenant-owned table; the organization's deletion cascades. */
export const orgId = (organizations: { id: AnyPgColumn }) =>
  uuid()
    .notNull()
    .references(() => organizations.id, { onDelete: 'cascade' })

export const timestamps = () => ({
  createdAt: timestamp({ withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp({ withTimezone: true })
    .notNull()
    .defaultNow()
    .$onUpdate(() => new Date()),
})

export const createdBy = (users: { id: AnyPgColumn }) => ({
  createdByUserId: uuid().references(() => users.id, { onDelete: 'set null' }),
})

/** Only for the restorable tables (chats, prompts, knowledge bases and sources). */
export const softDelete = (users: { id: AnyPgColumn }) => ({
  deletedAt: timestamp({ withTimezone: true }),
  deletedByUserId: uuid().references(() => users.id, { onDelete: 'set null' }),
})

/** Goes next to every *_micros column (bigint({ mode: 'number' })). */
export const currency = () => ({
  currency: char({ length: 3 }).notNull().default('USD'),
})

/**
 * Tables with an `encryptedSecret()` column set: the registry the re-encryption job walks.
 * Extension tables register through the same helper.
 */
export const ENCRYPTED_TABLES = new Set<string>()

export interface EncryptedSecretOptions {
  /** The table that holds the secret, for the re-encryption registry. */
  table: string
  /** Column prefix; `secret` by default (`secret_ciphertext`, …, `data_key_version`). */
  prefix?: string
  /** Whether to add the display-only `<prefix>_last4` and `<prefix>_fingerprint` columns. */
  display?: boolean
}

const encryptedColumns = (p: string, display: boolean) => ({
  [`${p}Ciphertext`]: bytea(),
  [`${p}Iv`]: bytea(), // 12 bytes
  [`${p}AuthTag`]: bytea(), // 16 bytes
  [p === 'secret' ? 'dataKeyVersion' : `${p}DataKeyVersion`]: integer(),
  ...(display ? { [`${p}Last4`]: text(), [`${p}Fingerprint`]: text() } : {}),
})

/** The default column set (`secret_*`, `data_key_version`), typed so tables and queries see it. */
const secretColumns = () => ({
  secretCiphertext: bytea(),
  secretIv: bytea(), // 12 bytes
  secretAuthTag: bytea(), // 16 bytes
  dataKeyVersion: integer(),
  secretLast4: text(),
  secretFingerprint: text(),
})

/**
 * AES-256-GCM ciphertext, IV, auth tag and the organization data key version that wrapped it,
 * plus the display-only last four characters and fingerprint (configuration.md, §5). With the
 * default prefix and display columns the result is typed; another prefix builds the names at run
 * time, so such a table writes its columns out for their types (see install_settings).
 */
export function encryptedSecret(
  options: EncryptedSecretOptions & { prefix?: undefined; display?: true },
): ReturnType<typeof secretColumns>
export function encryptedSecret(options: EncryptedSecretOptions): Record<string, unknown>
export function encryptedSecret(options: EncryptedSecretOptions) {
  ENCRYPTED_TABLES.add(options.table)
  const p = options.prefix ?? 'secret'
  const display = options.display !== false
  return p === 'secret' && display ? secretColumns() : encryptedColumns(p, display)
}

export interface EncryptedColumns {
  ciphertext: AnyPgColumn
  iv: AnyPgColumn
  authTag: AnyPgColumn
  keyVersion: AnyPgColumn
}

/** CHECKs that keep a secret's four columns all set or all null, with well-formed IV and tag. */
export const encryptedSecretChecks = (table: string, t: EncryptedColumns, prefix = 'secret') => [
  check(
    `${table}_${prefix}_complete_check`,
    sql`num_nulls(${t.ciphertext}, ${t.iv}, ${t.authTag}, ${t.keyVersion}) in (0, 4)`,
  ),
  check(`${table}_${prefix}_iv_check`, sql`${t.iv} is null or octet_length(${t.iv}) = 12`),
  check(
    `${table}_${prefix}_auth_tag_check`,
    sql`${t.authTag} is null or octet_length(${t.authTag}) = 16`,
  ),
]
