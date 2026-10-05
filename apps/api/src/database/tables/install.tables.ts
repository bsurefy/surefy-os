// SPDX-License-Identifier: AGPL-3.0-only
import { sql } from 'drizzle-orm'
import {
  check,
  index,
  integer,
  jsonb,
  pgTable,
  smallint,
  text,
  timestamp,
  uuid,
} from 'drizzle-orm/pg-core'

import {
  INSTALL_ORG_CREATION_POLICIES,
  INSTALL_SIGNUP_POLICIES,
  type InstallOrgCreationPolicy,
  type InstallSettings,
  type InstallSignupPolicy,
} from '@surefy/contracts'

import { users } from './auth.tables.js'
import { enumCheck } from '../checks.js'
import { ENCRYPTED_TABLES, encryptedSecretChecks, timestamps } from '../columns.js'
import { bytea } from '../columnTypes.js'

// Install-wide settings and administrators of a self-hosted install
// (database/organizations-and-members.md, §9–10). Both tables are global: no RLS, read and
// written through `db.global` by the install module only.

const at = () => timestamp({ withTimezone: true })

/** `InstallSettings` v1 as stored: sparse, every section and field optional. */
export interface StoredInstallSettings {
  version: 1
  signIn?: {
    emailPassword?: boolean
    oauth?: Partial<InstallSettings['signIn']['oauth']>
  }
  smtp?: InstallSettings['smtp']
  webSearch?: Partial<InstallSettings['webSearch']>
}

// `encryptedSecret({ prefix: 'smtp_password', display: false })`, written out so the column types
// stay exact; the registry entry is what the re-encryption job walks.
ENCRYPTED_TABLES.set('install_settings', {
  prefix: 'smtp_password',
  display: false,
  key: 'install',
})

/**
 * The install's one settings row (`id = 1`). The custom migration inserts it with the defaults;
 * the install module recreates it the same way if it is ever missing. The install data key is
 * wrapped by `ENCRYPTION_KEY` and encrypts the SMTP password.
 */
export const installSettings = pgTable(
  'install_settings',
  {
    id: smallint().primaryKey().default(1),
    installationId: uuid()
      .notNull()
      .default(sql`uuidv7()`),
    signupPolicy: text().$type<InstallSignupPolicy>().notNull().default('invite_only'),
    orgCreationPolicy: text().$type<InstallOrgCreationPolicy>().notNull().default('install_admins'),
    settings: jsonb()
      .$type<StoredInstallSettings>()
      .notNull()
      .default(sql`'{"version":1}'::jsonb`),
    dataKeyWrapped: bytea(),
    dataKeyIv: bytea(), // 12 bytes
    dataKeyAuthTag: bytea(), // 16 bytes
    dataKeyMasterKeyId: text(),
    smtpPasswordCiphertext: bytea(),
    smtpPasswordIv: bytea(), // 12 bytes
    smtpPasswordAuthTag: bytea(), // 16 bytes
    /** Always 1: the install data key is re-wrapped, never versioned. */
    smtpPasswordDataKeyVersion: integer(),
    setupCompletedAt: at(),
    ...timestamps(),
  },
  (t) => [
    check('install_settings_id_check', sql`${t.id} = 1`),
    enumCheck('install_settings_signup_policy_check', t.signupPolicy, INSTALL_SIGNUP_POLICIES),
    enumCheck(
      'install_settings_org_creation_policy_check',
      t.orgCreationPolicy,
      INSTALL_ORG_CREATION_POLICIES,
    ),
    check(
      'install_settings_data_key_complete_check',
      sql`num_nulls(${t.dataKeyWrapped}, ${t.dataKeyIv}, ${t.dataKeyAuthTag}, ${t.dataKeyMasterKeyId}) in (0, 4)`,
    ),
    check(
      'install_settings_data_key_iv_check',
      sql`${t.dataKeyIv} is null or octet_length(${t.dataKeyIv}) = 12`,
    ),
    check(
      'install_settings_data_key_auth_tag_check',
      sql`${t.dataKeyAuthTag} is null or octet_length(${t.dataKeyAuthTag}) = 16`,
    ),
    ...encryptedSecretChecks(
      'install_settings',
      {
        ciphertext: t.smtpPasswordCiphertext,
        iv: t.smtpPasswordIv,
        authTag: t.smtpPasswordAuthTag,
        keyVersion: t.smtpPasswordDataKeyVersion,
      },
      'smtp_password',
    ),
  ],
)

/** People who administer a self-hosted install. At least one always remains. */
export const installAdmins = pgTable(
  'install_admins',
  {
    userId: uuid()
      .primaryKey()
      .references(() => users.id, { onDelete: 'cascade' }),
    grantedByUserId: uuid().references(() => users.id, { onDelete: 'set null' }),
    createdAt: at().notNull().defaultNow(),
  },
  (t) => [
    index('install_admins_granted_by_user_id_idx')
      .on(t.grantedByUserId)
      .where(sql`${t.grantedByUserId} is not null`),
  ],
)
