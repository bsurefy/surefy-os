// SPDX-License-Identifier: AGPL-3.0-only
import { sql } from 'drizzle-orm'
import { foreignKey, index, jsonb, pgTable, unique, uuid } from 'drizzle-orm/pg-core'

import type { AccessPolicy } from '@surefy/contracts'

import { users } from './auth.tables.js'
import { organizations } from './organizations.tables.js'
import { teams } from './teams.tables.js'
import { id, orgId, timestamps } from '../columns.js'
import { tenantPolicy } from '../policies.js'

// One level's own restrictions (database/access-and-entitlements.md, §1). Effective access is
// computed from these rows and cached, never stored.

/**
 * The organization's row (`team_id` null) and at most one row per team. A missing row means "no
 * restrictions at this level"; a row never copies its parent's values.
 */
export const accessPolicies = pgTable(
  'access_policies',
  {
    id: id(),
    organizationId: orgId(organizations),
    /** Null: the organization-level row. */
    teamId: uuid(),
    policy: jsonb()
      .$type<AccessPolicy>()
      .notNull()
      .default(sql`'{"version":1}'::jsonb`),
    updatedByUserId: uuid().references(() => users.id, { onDelete: 'set null' }),
    ...timestamps(),
  },
  (t) => [
    unique('access_policies_organization_id_id_key').on(t.organizationId, t.id),
    unique('access_policies_organization_id_team_id_key')
      .on(t.organizationId, t.teamId)
      .nullsNotDistinct(),
    index('access_policies_updated_by_user_id_idx')
      .on(t.updatedByUserId)
      .where(sql`${t.updatedByUserId} is not null`),
    foreignKey({
      name: 'access_policies_organization_id_team_id_fkey',
      columns: [t.organizationId, t.teamId],
      foreignColumns: [teams.organizationId, teams.id],
    }).onDelete('cascade'), // deleting a team removes its restrictions
    tenantPolicy('access_policies', t.organizationId),
  ],
)
