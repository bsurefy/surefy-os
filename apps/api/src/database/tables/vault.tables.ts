// SPDX-License-Identifier: AGPL-3.0-only
import { sql } from 'drizzle-orm'
import {
  bigint,
  boolean,
  char,
  check,
  foreignKey,
  index,
  integer,
  jsonb,
  pgTable,
  text,
  timestamp,
  unique,
  uniqueIndex,
  uuid,
} from 'drizzle-orm/pg-core'

import {
  CREDENTIAL_KINDS,
  CREDENTIAL_SCOPES,
  CREDENTIAL_STATUSES,
  EMBEDDING_DIMENSIONS,
  MODEL_ACCESS_SUBJECT_TYPES,
  MODEL_TYPES,
  VAULT_MODEL_SOURCES,
  VAULT_MODEL_STATUSES,
} from '@surefy/contracts'
import type { VaultFallback } from '@surefy/contracts'

import { users } from './auth.tables.js'
import { organizationMembers, organizations } from './organizations.tables.js'
import { teams } from './teams.tables.js'
import { enumCheck } from '../checks.js'
import {
  createdBy,
  encryptedSecret,
  encryptedSecretChecks,
  id,
  orgId,
  timestamps,
} from '../columns.js'
import { bytea } from '../columnTypes.js'
import { tenantPolicy } from '../policies.js'

// Vault and models (database/vault-and-models.md, §1–5): the organization's data keys, provider
// keys and local servers, the models they serve, who may use each model, and the embedding model
// and fallback order. The partial unique index on primary AI keys needs `nulls not distinct`,
// which Drizzle cannot declare: it is in the vault security migration.

/** `active → retired`; never returned by the API, so not a contract enum. */
export const ORGANIZATION_KEY_STATUSES = ['active', 'retired'] as const

/** The organization's data keys, each wrapped by the master key; read through `core/crypto`. */
export const organizationKeys = pgTable(
  'organization_keys',
  {
    id: id(),
    organizationId: orgId(organizations),
    keyVersion: integer().notNull(),
    wrappedKey: bytea().notNull(),
    wrapIv: bytea().notNull(),
    wrapAuthTag: bytea().notNull(),
    /** Fingerprint of the master key that wrapped this row. */
    masterKeyId: text().notNull(),
    status: text().notNull().default('active'),
    rotatedAt: timestamp({ withTimezone: true }),
    ...timestamps(),
  },
  (t) => [
    unique('organization_keys_organization_id_id_key').on(t.organizationId, t.id),
    unique('organization_keys_organization_id_key_version_key').on(t.organizationId, t.keyVersion),
    uniqueIndex('organization_keys_organization_id_active_key')
      .on(t.organizationId)
      .where(sql`${t.status} = 'active'`),
    index('organization_keys_master_key_id_idx').on(t.masterKeyId),
    enumCheck('organization_keys_status_check', t.status, ORGANIZATION_KEY_STATUSES),
    check('organization_keys_key_version_check', sql`${t.keyVersion} > 0`),
    check('organization_keys_wrap_iv_check', sql`octet_length(${t.wrapIv}) = 12`),
    check('organization_keys_wrap_auth_tag_check', sql`octet_length(${t.wrapAuthTag}) = 16`),
    tenantPolicy('organization_keys', t.organizationId),
  ],
)

/** A provider key, local model server, web search provider or decision service. */
export const vaultCredentials = pgTable(
  'vault_credentials',
  {
    id: id(),
    organizationId: orgId(organizations),
    name: text().notNull(),
    kind: text().notNull(),
    providerKey: text().notNull(),
    scope: text().notNull(),
    teamId: uuid(),
    ownerUserId: uuid().references(() => users.id, { onDelete: 'cascade' }),
    isPrimary: boolean().notNull().default(true),
    baseUrl: text(),
    ...encryptedSecret({ table: 'vault_credentials' }),
    status: text().notNull().default('active'),
    statusReasonCode: text(),
    statusCheckedAt: timestamp({ withTimezone: true }),
    lastSuccessAt: timestamp({ withTimezone: true }),
    expiresAt: timestamp({ withTimezone: true }),
    /** Buffered in Redis, written at most every 5 minutes. */
    lastUsedAt: timestamp({ withTimezone: true }),
    rotatedFromId: uuid(),
    ...createdBy(users),
    revokedAt: timestamp({ withTimezone: true }),
    revokedByUserId: uuid().references(() => users.id, { onDelete: 'set null' }),
    ...timestamps(),
  },
  (t) => [
    unique('vault_credentials_organization_id_id_key').on(t.organizationId, t.id),
    foreignKey({
      name: 'vault_credentials_organization_id_team_id_fkey',
      columns: [t.organizationId, t.teamId],
      foreignColumns: [teams.organizationId, teams.id],
    }).onDelete('cascade'),
    foreignKey({
      name: 'vault_credentials_rotated_from_id_fkey',
      columns: [t.rotatedFromId],
      foreignColumns: [t.id],
    }).onDelete('set null'),
    enumCheck('vault_credentials_kind_check', t.kind, CREDENTIAL_KINDS),
    enumCheck('vault_credentials_scope_enum_check', t.scope, CREDENTIAL_SCOPES),
    enumCheck('vault_credentials_status_check', t.status, CREDENTIAL_STATUSES),
    check(
      'vault_credentials_scope_check',
      sql`(${t.scope} = 'organization' and ${t.teamId} is null and ${t.ownerUserId} is null)
        or (${t.scope} = 'team' and ${t.teamId} is not null and ${t.ownerUserId} is null)
        or (${t.scope} = 'personal' and ${t.teamId} is null and ${t.ownerUserId} is not null)`,
    ),
    check(
      'vault_credentials_personal_kind_check',
      sql`${t.scope} <> 'personal' or ${t.kind} = 'ai_provider'`,
    ),
    check(
      'vault_credentials_search_scope_check',
      sql`${t.kind} <> 'search_provider' or ${t.scope} = 'organization'`,
    ),
    check(
      'vault_credentials_secret_check',
      sql`${t.kind} <> 'ai_provider' or ${t.status} = 'revoked' or ${t.secretCiphertext} is not null`,
    ),
    check(
      'vault_credentials_revoked_check',
      sql`${t.status} <> 'revoked'
        or (${t.secretCiphertext} is null and ${t.revokedAt} is not null and not ${t.isPrimary})`,
    ),
    ...encryptedSecretChecks('vault_credentials', {
      ciphertext: t.secretCiphertext,
      iv: t.secretIv,
      authTag: t.secretAuthTag,
      keyVersion: t.dataKeyVersion,
    }),
    uniqueIndex('vault_credentials_primary_search_key')
      .on(t.organizationId)
      .where(sql`${t.kind} = 'search_provider' and ${t.isPrimary}`),
    index('vault_credentials_organization_id_kind_scope_idx')
      .on(t.organizationId, t.kind, t.scope)
      .where(sql`${t.status} <> 'revoked'`),
    index('vault_credentials_organization_id_team_id_idx')
      .on(t.organizationId, t.teamId)
      .where(sql`${t.teamId} is not null`),
    index('vault_credentials_owner_user_id_idx')
      .on(t.ownerUserId)
      .where(sql`${t.ownerUserId} is not null`),
    index('vault_credentials_organization_id_secret_fingerprint_idx')
      .on(t.organizationId, t.secretFingerprint)
      .where(sql`${t.status} <> 'revoked'`),
    index('vault_credentials_expires_at_idx')
      .on(t.expiresAt)
      .where(sql`${t.status} = 'active' and ${t.expiresAt} is not null`),
    index('vault_credentials_rotated_from_id_idx')
      .on(t.rotatedFromId)
      .where(sql`${t.rotatedFromId} is not null`),
    index('vault_credentials_revoked_at_idx')
      .on(t.revokedAt)
      .where(sql`${t.status} = 'revoked'`),
    index('vault_credentials_created_by_user_id_idx')
      .on(t.createdByUserId)
      .where(sql`${t.createdByUserId} is not null`),
    index('vault_credentials_revoked_by_user_id_idx')
      .on(t.revokedByUserId)
      .where(sql`${t.revokedByUserId} is not null`),
    tenantPolicy('vault_credentials', t.organizationId),
  ],
)

/** A model the organization can call through a provider key, a local server or a trained model. */
export const vaultModels = pgTable(
  'vault_models',
  {
    id: id(),
    organizationId: orgId(organizations),
    /** The local server; null for provider models (the key is resolved per call). */
    credentialId: uuid(),
    modelKey: text().notNull(),
    providerKey: text().notNull(),
    providerModelId: text().notNull(),
    displayName: text().notNull(),
    type: text().notNull(),
    source: text().notNull(),
    /** V3: → trained_models once Train exists. */
    trainedModelId: uuid(),
    supportsVision: boolean().notNull().default(false),
    supportsTools: boolean().notNull().default(false),
    contextWindow: integer(),
    embeddingDimensions: integer(),
    inputPricePerMtokMicros: bigint({ mode: 'number' }),
    outputPricePerMtokMicros: bigint({ mode: 'number' }),
    cachedInputPricePerMtokMicros: bigint({ mode: 'number' }),
    currency: char({ length: 3 }).notNull().default('USD'),
    isEnabled: boolean().notNull().default(false),
    status: text().notNull().default('available'),
    lastSeenAt: timestamp({ withTimezone: true }),
    ...timestamps(),
  },
  (t) => [
    unique('vault_models_organization_id_id_key').on(t.organizationId, t.id),
    unique('vault_models_organization_id_model_key_key').on(t.organizationId, t.modelKey),
    foreignKey({
      name: 'vault_models_organization_id_credential_id_fkey',
      columns: [t.organizationId, t.credentialId],
      foreignColumns: [vaultCredentials.organizationId, vaultCredentials.id],
    }).onDelete('cascade'),
    enumCheck('vault_models_type_check', t.type, MODEL_TYPES),
    enumCheck('vault_models_source_enum_check', t.source, VAULT_MODEL_SOURCES),
    enumCheck('vault_models_status_check', t.status, VAULT_MODEL_STATUSES),
    check(
      'vault_models_source_check',
      sql`(${t.source} = 'local') = (${t.credentialId} is not null and ${t.modelKey} like 'local/%')
        and (${t.source} = 'trained') = (${t.trainedModelId} is not null and ${t.modelKey} like 'trained/%')
        and (${t.source} <> 'provider' or (${t.modelKey} not like 'local/%'
          and ${t.modelKey} not like 'trained/%' and ${t.modelKey} not like 'platform/%'
          and ${t.modelKey} <> 'auto'))`,
    ),
    check(
      'vault_models_embedding_check',
      sql`${t.type} <> 'embedding' or ${t.embeddingDimensions} in (${sql.raw(EMBEDDING_DIMENSIONS.join(', '))})`,
    ),
    index('vault_models_organization_id_credential_id_idx')
      .on(t.organizationId, t.credentialId)
      .where(sql`${t.credentialId} is not null`),
    index('vault_models_organization_id_trained_model_id_idx')
      .on(t.organizationId, t.trainedModelId)
      .where(sql`${t.trainedModelId} is not null`),
    index('vault_models_organization_id_type_idx')
      .on(t.organizationId, t.type)
      .where(sql`${t.isEnabled} and ${t.status} = 'available'`),
    tenantPolicy('vault_models', t.organizationId),
  ],
)

/** Grants one model to the organization, a team or a person; rules only grant. */
export const modelAccessRules = pgTable(
  'model_access_rules',
  {
    id: id(),
    organizationId: orgId(organizations),
    vaultModelId: uuid().notNull(),
    subjectType: text().notNull(),
    teamId: uuid(),
    userId: uuid(),
    ...createdBy(users),
    ...timestamps(),
  },
  (t) => [
    unique('model_access_rules_organization_id_id_key').on(t.organizationId, t.id),
    unique('model_access_rules_subject_key')
      .on(t.organizationId, t.vaultModelId, t.subjectType, t.teamId, t.userId)
      .nullsNotDistinct(),
    foreignKey({
      name: 'model_access_rules_organization_id_vault_model_id_fkey',
      columns: [t.organizationId, t.vaultModelId],
      foreignColumns: [vaultModels.organizationId, vaultModels.id],
    }).onDelete('cascade'),
    foreignKey({
      name: 'model_access_rules_organization_id_team_id_fkey',
      columns: [t.organizationId, t.teamId],
      foreignColumns: [teams.organizationId, teams.id],
    }).onDelete('cascade'),
    foreignKey({
      name: 'model_access_rules_organization_id_user_id_fkey',
      columns: [t.organizationId, t.userId],
      foreignColumns: [organizationMembers.organizationId, organizationMembers.userId],
    }).onDelete('cascade'),
    enumCheck('model_access_rules_subject_type_check', t.subjectType, MODEL_ACCESS_SUBJECT_TYPES),
    check(
      'model_access_rules_subject_check',
      sql`(${t.subjectType} = 'organization' and ${t.teamId} is null and ${t.userId} is null)
        or (${t.subjectType} = 'team' and ${t.teamId} is not null and ${t.userId} is null)
        or (${t.subjectType} = 'user' and ${t.teamId} is null and ${t.userId} is not null)`,
    ),
    index('model_access_rules_organization_id_team_id_idx')
      .on(t.organizationId, t.teamId)
      .where(sql`${t.teamId} is not null`),
    index('model_access_rules_organization_id_user_id_idx')
      .on(t.organizationId, t.userId)
      .where(sql`${t.userId} is not null`),
    index('model_access_rules_created_by_user_id_idx')
      .on(t.createdByUserId)
      .where(sql`${t.createdByUserId} is not null`),
    tenantPolicy('model_access_rules', t.organizationId),
  ],
)

/** One row per organization, inserted with it: the embedding model and the fallback behavior. */
export const vaultSettings = pgTable(
  'vault_settings',
  {
    organizationId: uuid()
      .primaryKey()
      .references(() => organizations.id, { onDelete: 'cascade' }),
    embeddingVaultModelId: uuid(),
    fallback: jsonb()
      .$type<VaultFallback>()
      .notNull()
      .default(
        sql`'{"version":1,"order":[],"onProviderError":true,"timeoutSeconds":null,"privateChatsLocalOnly":true}'::jsonb`,
      ),
    updatedByUserId: uuid().references(() => users.id, { onDelete: 'set null' }),
    ...timestamps(),
  },
  (t) => [
    foreignKey({
      name: 'vault_settings_organization_id_embedding_vault_model_id_fkey',
      columns: [t.organizationId, t.embeddingVaultModelId],
      foreignColumns: [vaultModels.organizationId, vaultModels.id],
      // no action, not restrict: deleting the embedding model (or its local server) still fails,
      // but an organization purge, which cascades to both tables in one statement, does not
    }).onDelete('no action'),
    index('vault_settings_organization_id_embedding_vault_model_id_idx').on(
      t.organizationId,
      t.embeddingVaultModelId,
    ),
    index('vault_settings_updated_by_user_id_idx')
      .on(t.updatedByUserId)
      .where(sql`${t.updatedByUserId} is not null`),
    tenantPolicy('vault_settings', t.organizationId),
  ],
)
