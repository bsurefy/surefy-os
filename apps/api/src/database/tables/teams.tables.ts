// SPDX-License-Identifier: AGPL-3.0-only
import { sql } from 'drizzle-orm'
import {
  foreignKey,
  index,
  pgTable,
  primaryKey,
  text,
  timestamp,
  unique,
  uniqueIndex,
  uuid,
} from 'drizzle-orm/pg-core'

import { users } from './auth.tables.js'
import { organizationMembers, organizations } from './organizations.tables.js'
import { createdBy, id, orgId, timestamps } from '../columns.js'
import { tenantPolicy } from '../policies.js'

// Teams and team membership (database/organizations-and-members.md, §6–7). No soft delete:
// deleting a team cascades to its memberships and clears the members' primary team.

/** A group of members inside an organization; decides what applies to someone, never their role. */
export const teams = pgTable(
  'teams',
  {
    id: id(),
    organizationId: orgId(organizations),
    name: text().notNull(),
    description: text(),
    /** Must be a member of the team (service rule); cleared when the lead leaves it. */
    leadUserId: uuid().references(() => users.id, { onDelete: 'set null' }),
    ...createdBy(users),
    ...timestamps(),
  },
  (t) => [
    unique('teams_organization_id_id_key').on(t.organizationId, t.id), // target of composite FKs
    uniqueIndex('teams_organization_id_name_key').on(t.organizationId, sql`lower(${t.name})`),
    index('teams_lead_user_id_idx')
      .on(t.leadUserId)
      .where(sql`${t.leadUserId} is not null`),
    index('teams_created_by_user_id_idx')
      .on(t.createdByUserId)
      .where(sql`${t.createdByUserId} is not null`),
    tenantPolicy('teams', t.organizationId),
  ],
)

/** Membership of a member in a team. Join table: no `id`, no `updated_at`. */
export const teamMembers = pgTable(
  'team_members',
  {
    organizationId: orgId(organizations),
    teamId: uuid().notNull(),
    userId: uuid().notNull(),
    addedByUserId: uuid().references(() => users.id, { onDelete: 'set null' }),
    /** When the member joined the team; orders "first team joined". */
    createdAt: timestamp({ withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    primaryKey({ name: 'team_members_pkey', columns: [t.teamId, t.userId] }),
    foreignKey({
      name: 'team_members_organization_id_team_id_fkey',
      columns: [t.organizationId, t.teamId],
      foreignColumns: [teams.organizationId, teams.id],
    }).onDelete('cascade'),
    foreignKey({
      name: 'team_members_organization_id_user_id_fkey',
      columns: [t.organizationId, t.userId],
      foreignColumns: [organizationMembers.organizationId, organizationMembers.userId],
    }).onDelete('cascade'), // removing a member removes their team memberships
    index('team_members_organization_id_user_id_idx').on(t.organizationId, t.userId),
    index('team_members_added_by_user_id_idx')
      .on(t.addedByUserId)
      .where(sql`${t.addedByUserId} is not null`),
    tenantPolicy('team_members', t.organizationId),
  ],
)
