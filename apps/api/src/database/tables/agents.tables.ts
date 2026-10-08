// SPDX-License-Identifier: AGPL-3.0-only
import { sql } from 'drizzle-orm'
import {
  type AnyPgColumn,
  boolean,
  check,
  foreignKey,
  index,
  integer,
  jsonb,
  pgTable,
  text,
  timestamp,
  unique,
  uuid,
} from 'drizzle-orm/pg-core'

import {
  AGENT_ACCESS_LEVELS,
  AGENT_ACCESS_SUBJECT_TYPES,
  AGENT_STATUSES,
  AGENT_TEMPLATE_KEYS,
} from '@surefy/contracts'
import type {
  AgentAccessLevel,
  AgentAccessSubjectType,
  AgentDefinition,
  AgentStatus,
  AgentTemplateKey,
} from '@surefy/contracts'

import { users } from './auth.tables.js'
import { organizationMembers, organizations } from './organizations.tables.js'
import { teams } from './teams.tables.js'
import { enumCheck } from '../checks.js'
import { id, orgId, timestamps } from '../columns.js'
import { tenantPolicy } from '../policies.js'

// Agents (database/agents-and-runs.md, §1–3): the agent with its draft, its immutable versions and
// the audience. FORCE RLS, the deferred `live_version_id` constraint and the SELECT/INSERT-only
// grant on `agent_versions` are in the security migration. `agent_channels`, `agent_runs` and
// `agent_run_steps` come with the modules that own them.

/** One agent per row: live metadata, the editable draft and the pointer to the live version. */
export const agents = pgTable(
  'agents',
  {
    id: id(),
    organizationId: orgId(organizations),
    /** Live metadata, not versioned. */
    name: text().notNull(),
    description: text(),
    status: text().$type<AgentStatus>().notNull().default('draft'),
    ownerUserId: uuid().references(() => users.id, { onDelete: 'set null' }),
    /** `AgentDefinition` v1: the part of an agent that is versioned. */
    draftDefinition: jsonb().$type<AgentDefinition>().notNull(),
    /** Bumped by every draft save and every publish: the base of the edit-conflict check. */
    draftRevision: integer().notNull().default(1),
    draftUpdatedAt: timestamp({ withTimezone: true }).notNull().defaultNow(),
    draftUpdatedByUserId: uuid().references(() => users.id, { onDelete: 'set null' }),
    /** True when the draft differs from the live version; always false before the first publish. */
    hasUnpublishedChanges: boolean().notNull().default(false),
    /** Null until the first publish. `DEFERRABLE INITIALLY DEFERRED` in the security migration. */
    liveVersionId: uuid().references((): AnyPgColumn => agentVersions.id, {
      onDelete: 'set null',
    }),
    /** The code-defined template the agent was created from; validated in the app. */
    templateKey: text().$type<AgentTemplateKey>(),
    pausedAt: timestamp({ withTimezone: true }),
    archivedAt: timestamp({ withTimezone: true }),
    /** Tombstone marker: hidden everywhere except runs, usage and audit history. */
    deletedAt: timestamp({ withTimezone: true }),
    createdByUserId: uuid().references(() => users.id, { onDelete: 'set null' }),
    ...timestamps(),
  },
  (t) => [
    unique('agents_organization_id_id_key').on(t.organizationId, t.id),
    enumCheck('agents_status_check', t.status, AGENT_STATUSES),
    enumCheck('agents_template_key_check', t.templateKey, AGENT_TEMPLATE_KEYS),
    check('agents_draft_revision_check', sql`${t.draftRevision} >= 1`),
    // list filters
    index('agents_organization_id_status_idx')
      .on(t.organizationId, t.status)
      .where(sql`${t.deletedAt} is null`),
    // owner filter, "my agents"
    index('agents_organization_id_owner_user_id_idx')
      .on(t.organizationId, t.ownerUserId)
      .where(sql`${t.deletedAt} is null`),
    // tombstone purge
    index('agents_organization_id_deleted_at_idx')
      .on(t.organizationId, t.deletedAt)
      .where(sql`${t.deletedAt} is not null`),
    index('agents_live_version_id_idx')
      .on(t.liveVersionId)
      .where(sql`${t.liveVersionId} is not null`),
    index('agents_created_by_user_id_idx')
      .on(t.createdByUserId)
      .where(sql`${t.createdByUserId} is not null`),
    index('agents_draft_updated_by_user_id_idx')
      .on(t.draftUpdatedByUserId)
      .where(sql`${t.draftUpdatedByUserId} is not null`),
    tenantPolicy('agents', t.organizationId),
  ],
)

/** An immutable snapshot of a published agent definition; rows are never updated. */
export const agentVersions = pgTable(
  'agent_versions',
  {
    id: id(),
    organizationId: orgId(organizations),
    agentId: uuid().notNull(),
    /** 1, 2, 3 … per agent; shown as "v4". */
    version: integer().notNull(),
    /** Frozen copy of the draft at publish time. */
    definition: jsonb().$type<AgentDefinition>().notNull(),
    notes: text(),
    publishedByUserId: uuid().references(() => users.id, { onDelete: 'set null' }),
    publishedAt: timestamp({ withTimezone: true }).notNull().defaultNow(),
    /** No `updated_at`: rows are never updated. */
    createdAt: timestamp({ withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    unique('agent_versions_organization_id_id_key').on(t.organizationId, t.id),
    // target of the composite foreign key from agent_runs
    unique('agent_versions_organization_id_agent_id_id_key').on(t.organizationId, t.agentId, t.id),
    // version list and the backstop for the version number
    unique('agent_versions_agent_id_version_key').on(t.agentId, t.version),
    foreignKey({
      name: 'agent_versions_organization_id_agent_id_fkey',
      columns: [t.organizationId, t.agentId],
      foreignColumns: [agents.organizationId, agents.id],
    }).onDelete('cascade'),
    check('agent_versions_version_check', sql`${t.version} >= 1`),
    index('agent_versions_published_by_user_id_idx')
      .on(t.publishedByUserId)
      .where(sql`${t.publishedByUserId} is not null`),
    tenantPolicy('agent_versions', t.organizationId),
  ],
)

/** Who may use or edit an agent ("Who can use it"); not versioned. */
export const agentAccess = pgTable(
  'agent_access',
  {
    id: id(),
    organizationId: orgId(organizations),
    agentId: uuid().notNull(),
    /** `organization` is "Everyone". */
    subjectType: text().$type<AgentAccessSubjectType>().notNull(),
    teamId: uuid(),
    userId: uuid(),
    /** `edit` lets a Builder edit, test and publish the agent, and implies `use`. */
    level: text().$type<AgentAccessLevel>().notNull().default('use'),
    createdByUserId: uuid().references(() => users.id, { onDelete: 'set null' }),
    ...timestamps(),
  },
  (t) => [
    unique('agent_access_organization_id_id_key').on(t.organizationId, t.id),
    foreignKey({
      name: 'agent_access_organization_id_agent_id_fkey',
      columns: [t.organizationId, t.agentId],
      foreignColumns: [agents.organizationId, agents.id],
    }).onDelete('cascade'),
    foreignKey({
      name: 'agent_access_organization_id_team_id_fkey',
      columns: [t.organizationId, t.teamId],
      foreignColumns: [teams.organizationId, teams.id],
    }).onDelete('cascade'),
    foreignKey({
      name: 'agent_access_organization_id_user_id_fkey',
      columns: [t.organizationId, t.userId],
      foreignColumns: [organizationMembers.organizationId, organizationMembers.userId],
    }).onDelete('cascade'),
    enumCheck('agent_access_subject_type_check', t.subjectType, AGENT_ACCESS_SUBJECT_TYPES),
    enumCheck('agent_access_level_check', t.level, AGENT_ACCESS_LEVELS),
    check(
      'agent_access_subject_check',
      sql`(${t.subjectType} = 'organization' and ${t.teamId} is null and ${t.userId} is null)
        or (${t.subjectType} = 'team' and ${t.teamId} is not null and ${t.userId} is null)
        or (${t.subjectType} = 'user' and ${t.userId} is not null and ${t.teamId} is null)`,
    ),
    // one row per subject: the unused subject columns are null, which must still collide
    unique('agent_access_subject_key')
      .on(t.organizationId, t.agentId, t.subjectType, t.teamId, t.userId)
      .nullsNotDistinct(),
    // "agents shared with the team" and team deletion impact
    index('agent_access_organization_id_team_id_idx')
      .on(t.organizationId, t.teamId)
      .where(sql`${t.teamId} is not null`),
    // "agents shared with me"
    index('agent_access_organization_id_user_id_idx')
      .on(t.organizationId, t.userId)
      .where(sql`${t.userId} is not null`),
    index('agent_access_created_by_user_id_idx')
      .on(t.createdByUserId)
      .where(sql`${t.createdByUserId} is not null`),
    tenantPolicy('agent_access', t.organizationId),
  ],
)
