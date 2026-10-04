// SPDX-License-Identifier: AGPL-3.0-only
import { sql } from 'drizzle-orm'
import {
  type AnyPgColumn,
  char,
  check,
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
  MEMBER_STATUSES,
  ORG_ROLES,
  ORGANIZATION_STATUSES,
  PROVISIONING_SOURCES,
  type Locale,
  type MemberStatus,
  type OrganizationSettings,
  type OrganizationStatus,
  type OrgRole,
  type ProvisioningSource,
} from '@surefy/contracts'

import { users } from './auth.tables.js'
import { enumCheck } from '../checks.js'
import { createdBy, id, orgId, timestamps } from '../columns.js'
import { memberReadPolicy, selfReadPolicy, tenantPolicy } from '../policies.js'

// The tenant and its memberships (database/organizations-and-members.md, §1–3). Teams are in
// teams.tables.ts; invitations and member preferences in members.tables.ts.

const at = () => timestamp({ withTimezone: true })

/** `OrganizationSettings` v1 as stored: sparse, every section and field optional. */
export interface StoredOrganizationSettings {
  version: 1
  security?: Partial<OrganizationSettings['security']>
  privacy?: Partial<OrganizationSettings['privacy']>
  setup?: Partial<OrganizationSettings['setup']>
}

/** `ORGANIZATION_SLUG_PATTERN` in contracts, as SQL (3–48 characters, no edge hyphen). */
const slugFormat = (column: AnyPgColumn) => sql`${column} ~ '^[a-z0-9][a-z0-9-]{1,46}[a-z0-9]$'`

/**
 * The tenant (RLS `tenant+member-read`). Its id is generated in the application, so the creating
 * transaction can run under `db.tenant(newOrgId)`. `partner_id` has no foreign key on purpose: the
 * partners table lives in the private repository.
 */
export const organizations = pgTable(
  'organizations',
  {
    id: id(),
    name: text().notNull(),
    slug: text().notNull(),
    /** `orgs/{orgId}/branding/logo`, never an external URL. */
    logoObjectKey: text(),
    timezone: text().notNull().default('UTC'),
    defaultLocale: text().$type<Locale>().notNull().default('en'),
    currency: char({ length: 3 }).notNull().default('USD'),
    status: text().$type<OrganizationStatus>().notNull().default('active'),
    suspendedAt: at(),
    deletionRequestedAt: at(),
    deletionScheduledFor: at(),
    deletionRequestedByUserId: uuid().references(() => users.id, { onDelete: 'set null' }),
    partnerId: uuid(),
    accessVersion: integer().notNull().default(1),
    /** `OrganizationSettings` v1, stored sparse and read with the contract defaults. */
    settings: jsonb()
      .$type<StoredOrganizationSettings>()
      .notNull()
      .default(sql`'{"version":1}'::jsonb`),
    ...createdBy(users),
    ...timestamps(),
  },
  (t) => [
    uniqueIndex('organizations_slug_key').on(t.slug),
    index('organizations_partner_id_idx')
      .on(t.partnerId)
      .where(sql`${t.partnerId} is not null`),
    index('organizations_status_idx')
      .on(t.status)
      .where(sql`${t.status} <> 'active'`),
    index('organizations_deletion_scheduled_for_idx')
      .on(t.deletionScheduledFor)
      .where(sql`${t.status} = 'deletion_scheduled'`),
    index('organizations_created_by_user_id_idx')
      .on(t.createdByUserId)
      .where(sql`${t.createdByUserId} is not null`),
    index('organizations_deletion_requested_by_user_id_idx')
      .on(t.deletionRequestedByUserId)
      .where(sql`${t.deletionRequestedByUserId} is not null`),
    check('organizations_slug_format_check', slugFormat(t.slug)),
    enumCheck('organizations_status_check', t.status, ORGANIZATION_STATUSES),
    check(
      'organizations_deletion_check',
      sql`${t.status} <> 'deletion_scheduled' or (${t.deletionRequestedAt} is not null and ${t.deletionScheduledFor} is not null)`,
    ),
    tenantPolicy('organizations', t.id),
    memberReadPolicy(t.id),
  ],
)

/** A slug an organization used before; old links redirect for 90 days. Rows are never updated. */
export const organizationSlugHistory = pgTable(
  'organization_slug_history',
  {
    id: id(),
    organizationId: orgId(organizations),
    slug: text().notNull(),
    retiredAt: at().notNull().defaultNow(),
    redirectUntil: at().notNull(),
    createdAt: at().notNull().defaultNow(),
  },
  (t) => [
    uniqueIndex('organization_slug_history_slug_key').on(t.slug),
    unique('organization_slug_history_organization_id_id_key').on(t.organizationId, t.id),
    index('organization_slug_history_organization_id_idx').on(t.organizationId),
    index('organization_slug_history_redirect_until_idx').on(t.redirectUntil),
    check('organization_slug_history_slug_format_check', slugFormat(t.slug)),
    tenantPolicy('organization_slug_history', t.organizationId),
  ],
)

/**
 * A person's membership in one organization (RLS `tenant+self`). The composite foreign key
 * `(organization_id, primary_team_id) → teams on delete set null (primary_team_id)` is created in
 * custom SQL (Drizzle cannot express the column list), so it is not declared here.
 */
export const organizationMembers = pgTable(
  'organization_members',
  {
    id: id(),
    organizationId: orgId(organizations),
    userId: uuid()
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    role: text().$type<OrgRole>().notNull(),
    status: text().$type<MemberStatus>().notNull().default('active'),
    primaryTeamId: uuid(),
    provisioningSource: text().$type<ProvisioningSource>().notNull(),
    joinedAt: at().notNull().defaultNow(),
    invitedByUserId: uuid().references(() => users.id, { onDelete: 'set null' }),
    deactivatedAt: at(),
    deactivatedByUserId: uuid().references(() => users.id, { onDelete: 'set null' }),
    lastActiveAt: at(),
    ...timestamps(),
  },
  (t) => [
    unique('organization_members_organization_id_id_key').on(t.organizationId, t.id),
    unique('organization_members_organization_id_user_id_key').on(t.organizationId, t.userId),
    index('organization_members_user_id_idx').on(t.userId),
    index('organization_members_organization_id_role_idx')
      .on(t.organizationId, t.role)
      .where(sql`${t.status} = 'active'`),
    index('organization_members_organization_id_primary_team_id_idx')
      .on(t.organizationId, t.primaryTeamId)
      .where(sql`${t.primaryTeamId} is not null`),
    index('organization_members_organization_id_created_at_id_idx').on(
      t.organizationId,
      t.createdAt.desc(),
      t.id.desc(),
    ),
    index('organization_members_invited_by_user_id_idx')
      .on(t.invitedByUserId)
      .where(sql`${t.invitedByUserId} is not null`),
    index('organization_members_deactivated_by_user_id_idx')
      .on(t.deactivatedByUserId)
      .where(sql`${t.deactivatedByUserId} is not null`),
    enumCheck('organization_members_role_check', t.role, ORG_ROLES),
    enumCheck('organization_members_status_check', t.status, MEMBER_STATUSES),
    enumCheck(
      'organization_members_provisioning_source_check',
      t.provisioningSource,
      PROVISIONING_SOURCES,
    ),
    check(
      'organization_members_deactivated_check',
      sql`(${t.status} = 'deactivated') = (${t.deactivatedAt} is not null)`,
    ),
    tenantPolicy('organization_members', t.organizationId),
    selfReadPolicy('organization_members', t.userId),
  ],
)
