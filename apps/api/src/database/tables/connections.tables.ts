// SPDX-License-Identifier: AGPL-3.0-only
import { sql } from 'drizzle-orm'
import {
  check,
  foreignKey,
  index,
  pgTable,
  text,
  timestamp,
  unique,
  uuid,
} from 'drizzle-orm/pg-core'

import { CONNECTION_AUTH_TYPES, CONNECTION_SCOPES, CONNECTION_STATUSES } from '@surefy/contracts'

import { users } from './auth.tables.js'
import { organizations } from './organizations.tables.js'
import { teams } from './teams.tables.js'
import { enumCheck } from '../checks.js'
import { encryptedSecret, encryptedSecretChecks, id, orgId, timestamps } from '../columns.js'
import { tenantPolicy } from '../policies.js'

// Connections (database/bridge-and-connections.md, §1): accounts in other apps that SurefyOS calls
// on the organization's behalf. The unique index on the connected account needs `nulls not
// distinct` on a partial index, which Drizzle cannot declare: it is in the security migration,
// with FORCE RLS. The foreign key from `bridge_id` to `bridges` and the `bridge_ref_visible()`
// trigger join this table with the bridges table (V2).

export const connections = pgTable(
  'connections',
  {
    id: id(),
    organizationId: orgId(organizations),
    /** Open registry validated in the app: a bridge key or a built-in integration. */
    providerKey: text().notNull(),
    /** V2: → bridges.id. Set when the connection was created for a bridge. */
    bridgeId: uuid(),
    authType: text().notNull(),
    /** Display name; defaults to the external account label. */
    name: text().notNull(),
    scope: text().notNull(),
    teamId: uuid(),
    ownerUserId: uuid().references(() => users.id, { onDelete: 'cascade' }),
    /** Self-hosted apps, MCP server URL, API tool base URL. */
    baseUrl: text(),
    /** `ConnectionSecret` v1 as one JSON document; AAD `connections:<id>:<organization_id>`. */
    ...encryptedSecret({ table: 'connections' }),
    /** Scopes the provider granted (may be fewer than requested). */
    oauthScopes: text().array(),
    externalAccountId: text(),
    externalAccountLabel: text(),
    status: text().notNull().default('active'),
    statusReasonCode: text(),
    /** Access-token expiry (OAuth 2). */
    tokenExpiresAt: timestamp({ withTimezone: true }),
    lastRefreshedAt: timestamp({ withTimezone: true }),
    /** Buffered in Redis, written at most every 5 minutes. */
    lastUsedAt: timestamp({ withTimezone: true }),
    connectedByUserId: uuid().references(() => users.id, { onDelete: 'set null' }),
    revokedAt: timestamp({ withTimezone: true }),
    revokedByUserId: uuid().references(() => users.id, { onDelete: 'set null' }),
    ...timestamps(),
  },
  (t) => [
    unique('connections_organization_id_id_key').on(t.organizationId, t.id), // target of composite FKs
    foreignKey({
      name: 'connections_organization_id_team_id_fkey',
      columns: [t.organizationId, t.teamId],
      foreignColumns: [teams.organizationId, teams.id],
    }).onDelete('cascade'),
    enumCheck('connections_auth_type_check', t.authType, CONNECTION_AUTH_TYPES),
    enumCheck('connections_scope_enum_check', t.scope, CONNECTION_SCOPES),
    enumCheck('connections_status_check', t.status, CONNECTION_STATUSES),
    check(
      'connections_scope_check',
      sql`(${t.scope} = 'organization' and ${t.teamId} is null and ${t.ownerUserId} is null)
        or (${t.scope} = 'team' and ${t.teamId} is not null and ${t.ownerUserId} is null)
        or (${t.scope} = 'personal' and ${t.teamId} is null and ${t.ownerUserId} is not null)`,
    ),
    check(
      'connections_secret_check',
      sql`${t.status} = 'revoked' or ${t.authType} = 'none' or ${t.secretCiphertext} is not null`,
    ),
    check(
      'connections_revoked_check',
      sql`(${t.status} = 'revoked') = (${t.revokedAt} is not null)
        and (${t.status} <> 'revoked' or ${t.secretCiphertext} is null)`,
    ),
    ...encryptedSecretChecks('connections', {
      ciphertext: t.secretCiphertext,
      iv: t.secretIv,
      authTag: t.secretAuthTag,
      keyVersion: t.dataKeyVersion,
    }),
    // pickers ("Slack accounts I may use")
    index('connections_organization_id_provider_key_idx')
      .on(t.organizationId, t.providerKey)
      .where(sql`${t.status} <> 'revoked'`),
    index('connections_organization_id_team_id_idx')
      .on(t.organizationId, t.teamId)
      .where(sql`${t.teamId} is not null`),
    index('connections_owner_user_id_idx')
      .on(t.ownerUserId)
      .where(sql`${t.ownerUserId} is not null`),
    index('connections_bridge_id_idx')
      .on(t.bridgeId)
      .where(sql`${t.bridgeId} is not null`),
    // refresh sweeper (system scope)
    index('connections_token_expires_at_idx')
      .on(t.tokenExpiresAt)
      .where(sql`${t.status} = 'active' and ${t.authType} = 'oauth2'`),
    // retention cleanup (system scope)
    index('connections_revoked_at_idx')
      .on(t.revokedAt)
      .where(sql`${t.status} = 'revoked'`),
    index('connections_connected_by_user_id_idx')
      .on(t.connectedByUserId)
      .where(sql`${t.connectedByUserId} is not null`),
    index('connections_revoked_by_user_id_idx')
      .on(t.revokedByUserId)
      .where(sql`${t.revokedByUserId} is not null`),
    index('connections_organization_id_secret_fingerprint_idx')
      .on(t.organizationId, t.secretFingerprint)
      .where(sql`${t.status} <> 'revoked'`),
    tenantPolicy('connections', t.organizationId),
  ],
)
