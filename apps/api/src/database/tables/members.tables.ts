// SPDX-License-Identifier: AGPL-3.0-only
import { sql } from 'drizzle-orm'
import {
  check,
  foreignKey,
  index,
  integer,
  jsonb,
  pgTable,
  primaryKey,
  smallint,
  text,
  timestamp,
  unique,
  uniqueIndex,
  uuid,
} from 'drizzle-orm/pg-core'

import {
  INVITATION_DELIVERY_STATUSES,
  INVITATION_STATUSES,
  ORG_ROLES,
  type InvitationDeliveryStatus,
  type InvitationStatus,
  type MemberPreferences,
  type OrgRole,
} from '@surefy/contracts'

import { users } from './auth.tables.js'
import { organizationMembers, organizations } from './organizations.tables.js'
import { teams } from './teams.tables.js'
import { enumCheck, lowercaseCheck } from '../checks.js'
import { id, orgId, timestamps } from '../columns.js'
import { bytea } from '../columnTypes.js'
import { tenantPolicy } from '../policies.js'

// Invitations and per-organization member preferences (database/organizations-and-members.md,
// §4, §5 and §8). Memberships themselves are in organizations.tables.ts.

const at = () => timestamp({ withTimezone: true })

/** An invitation for an email address to join with a role. Only the link token's hash is stored. */
export const invitations = pgTable(
  'invitations',
  {
    id: id(),
    organizationId: orgId(organizations),
    email: text().notNull(),
    role: text().$type<OrgRole>().notNull(),
    tokenHash: bytea().notNull(),
    status: text().$type<InvitationStatus>().notNull().default('pending'),
    deliveryStatus: text().$type<InvitationDeliveryStatus>().notNull().default('queued'),
    invitedByUserId: uuid().references(() => users.id, { onDelete: 'set null' }),
    /** Reset on Resend and on Copy invite link. */
    expiresAt: at()
      .notNull()
      .default(sql`now() + interval '7 days'`),
    acceptedAt: at(),
    acceptedUserId: uuid().references(() => users.id, { onDelete: 'set null' }),
    revokedAt: at(),
    revokedByUserId: uuid().references(() => users.id, { onDelete: 'set null' }),
    /** The last email handed to the mailer. */
    lastSentAt: at(),
    sendCount: integer().notNull().default(0),
    ...timestamps(),
  },
  (t) => [
    unique('invitations_organization_id_id_key').on(t.organizationId, t.id),
    uniqueIndex('invitations_token_hash_key').on(t.tokenHash),
    uniqueIndex('invitations_organization_id_email_key')
      .on(t.organizationId, t.email)
      .where(sql`${t.status} = 'pending'`),
    index('invitations_email_idx')
      .on(t.email)
      .where(sql`${t.status} = 'pending'`),
    index('invitations_organization_id_created_at_id_idx')
      .on(t.organizationId, t.createdAt.desc(), t.id.desc())
      .where(sql`${t.status} = 'pending'`),
    index('invitations_resolved_idx')
      .on(sql`coalesce(${t.acceptedAt}, ${t.revokedAt}, ${t.expiresAt})`)
      .where(sql`${t.status} <> 'pending'`),
    index('invitations_invited_by_user_id_idx')
      .on(t.invitedByUserId)
      .where(sql`${t.invitedByUserId} is not null`),
    index('invitations_accepted_user_id_idx')
      .on(t.acceptedUserId)
      .where(sql`${t.acceptedUserId} is not null`),
    index('invitations_revoked_by_user_id_idx')
      .on(t.revokedByUserId)
      .where(sql`${t.revokedByUserId} is not null`),
    lowercaseCheck('invitations_email_lower_check', t.email),
    enumCheck('invitations_role_check', t.role, ORG_ROLES),
    enumCheck('invitations_status_check', t.status, INVITATION_STATUSES),
    enumCheck('invitations_delivery_status_check', t.deliveryStatus, INVITATION_DELIVERY_STATUSES),
    check('invitations_token_hash_check', sql`octet_length(${t.tokenHash}) = 32`),
    check(
      'invitations_accepted_check',
      sql`${t.status} <> 'accepted' or ${t.acceptedAt} is not null`,
    ),
    tenantPolicy('invitations', t.organizationId),
  ],
)

/** Teams a pending invitation adds the person to; `position` 0 becomes the primary team. */
export const invitationTeams = pgTable(
  'invitation_teams',
  {
    organizationId: orgId(organizations),
    invitationId: uuid().notNull(),
    teamId: uuid().notNull(),
    position: smallint().notNull().default(0),
    createdAt: at().notNull().defaultNow(),
  },
  (t) => [
    primaryKey({ name: 'invitation_teams_pkey', columns: [t.invitationId, t.teamId] }),
    foreignKey({
      name: 'invitation_teams_organization_id_invitation_id_fkey',
      columns: [t.organizationId, t.invitationId],
      foreignColumns: [invitations.organizationId, invitations.id],
    }).onDelete('cascade'),
    foreignKey({
      name: 'invitation_teams_organization_id_team_id_fkey',
      columns: [t.organizationId, t.teamId],
      foreignColumns: [teams.organizationId, teams.id],
    }).onDelete('cascade'), // a team deleted before acceptance drops out of the invitation
    index('invitation_teams_organization_id_invitation_id_idx').on(
      t.organizationId,
      t.invitationId,
    ),
    index('invitation_teams_organization_id_team_id_idx').on(t.organizationId, t.teamId),
    tenantPolicy('invitation_teams', t.organizationId),
  ],
)

/** A member's preferences inside one organization; a missing row means the defaults. */
export const memberPreferences = pgTable(
  'member_preferences',
  {
    organizationId: orgId(organizations),
    userId: uuid().notNull(),
    /** Open registry, no foreign key; ignored at use when the model is no longer allowed. */
    defaultModelKey: text(),
    /** `MemberPreferences` v1, stored sparse and read with the contract defaults. */
    preferences: jsonb()
      .$type<Partial<MemberPreferences> & { version: 1 }>()
      .notNull()
      .default(sql`'{"version":1}'::jsonb`),
    ...timestamps(),
  },
  (t) => [
    primaryKey({ name: 'member_preferences_pkey', columns: [t.organizationId, t.userId] }),
    foreignKey({
      name: 'member_preferences_organization_id_user_id_fkey',
      columns: [t.organizationId, t.userId],
      foreignColumns: [organizationMembers.organizationId, organizationMembers.userId],
    }).onDelete('cascade'),
    tenantPolicy('member_preferences', t.organizationId),
  ],
)
