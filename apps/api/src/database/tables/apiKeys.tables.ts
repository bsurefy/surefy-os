// SPDX-License-Identifier: AGPL-3.0-only
import { sql } from 'drizzle-orm'
import {
  check,
  index,
  inet,
  pgTable,
  text,
  timestamp,
  unique,
  uniqueIndex,
  uuid,
} from 'drizzle-orm/pg-core'

import { API_KEY_STATUSES } from '@surefy/contracts'

import { users } from './auth.tables.js'
import { organizations } from './organizations.tables.js'
import { enumCheck } from '../checks.js'
import { createdBy, id, orgId, timestamps } from '../columns.js'
import { bytea } from '../columnTypes.js'
import { tenantPolicy } from '../policies.js'

// Organization API keys (database/access-and-entitlements.md, §2): machine access to published
// agents and integrations. Shown once, stored as a hash; revoking nulls the hash.

/**
 * A key of the organization, not of its creator: it survives their departure. The full key is
 * never stored: `key_hash` is the sha256 of it, resolved by `auth_resolve_api_key`.
 */
export const apiKeys = pgTable(
  'api_keys',
  {
    id: id(),
    organizationId: orgId(organizations),
    /** The label ("Website backend"). */
    name: text().notNull(),
    /** `sk_` plus the first 8 characters of the random part; shown in lists and logs. */
    keyPrefix: text().notNull(),
    /** `sha256` of the full key; null once revoked. */
    keyHash: bytea(),
    /** Permission keys, checked against the contracts in the app. */
    scopes: text().array().notNull(),
    status: text().notNull().default('active'),
    /** Optional expiry chosen at creation; "expired" is computed from it, never stored. */
    expiresAt: timestamp({ withTimezone: true }),
    /** Buffered in Redis and written at most every 5 minutes. */
    lastUsedAt: timestamp({ withTimezone: true }),
    lastUsedIp: inet(),
    ...createdBy(users),
    revokedAt: timestamp({ withTimezone: true }),
    revokedByUserId: uuid().references(() => users.id, { onDelete: 'set null' }),
    ...timestamps(),
  },
  (t) => [
    unique('api_keys_organization_id_id_key').on(t.organizationId, t.id), // target of composite FKs
    // resolution by hash; nulls never collide, so revoked rows do not clash
    uniqueIndex('api_keys_key_hash_key').on(t.keyHash),
    enumCheck('api_keys_status_check', t.status, API_KEY_STATUSES),
    check('api_keys_scopes_check', sql`cardinality(${t.scopes}) > 0`),
    check('api_keys_key_hash_check', sql`octet_length(${t.keyHash}) = 32`),
    check(
      'api_keys_state_check',
      sql`(${t.status} = 'active') = (${t.keyHash} is not null)
        and (${t.status} = 'revoked') = (${t.revokedAt} is not null)`,
    ),
    index('api_keys_organization_id_created_at_id_idx').on(
      t.organizationId,
      sql`${t.createdAt} desc`,
      sql`${t.id} desc`,
    ),
    index('api_keys_created_by_user_id_idx')
      .on(t.createdByUserId)
      .where(sql`${t.createdByUserId} is not null`),
    index('api_keys_revoked_by_user_id_idx')
      .on(t.revokedByUserId)
      .where(sql`${t.revokedByUserId} is not null`),
    // retention cleanup (system scope)
    index('api_keys_revoked_at_idx')
      .on(t.revokedAt)
      .where(sql`${t.status} = 'revoked'`),
    tenantPolicy('api_keys', t.organizationId),
  ],
)
