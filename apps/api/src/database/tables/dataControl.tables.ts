// SPDX-License-Identifier: AGPL-3.0-only
import { sql } from 'drizzle-orm'
import {
  bigint,
  boolean,
  check,
  foreignKey,
  index,
  integer,
  jsonb,
  pgTable,
  smallint,
  text,
  timestamp,
  unique,
  uniqueIndex,
  uuid,
} from 'drizzle-orm/pg-core'

import {
  DATA_REQUEST_STATUSES,
  DATA_REQUEST_TYPES,
  DATA_REQUEST_VIAS,
  EXPORT_KINDS,
  EXPORT_STATUSES,
  type DataRequestStatus,
  type DataRequestType,
  type DataRequestVia,
  type ExportKind,
  type ExportParams,
  type ExportStatus,
} from '@surefy/contracts'

import { users } from './auth.tables.js'
import { organizationMembers, organizations } from './organizations.tables.js'
import { enumCheck } from '../checks.js'
import { id, orgId, timestamps } from '../columns.js'
import { bytea } from '../columnTypes.js'
import { systemOnlyPolicy, tenantPolicy } from '../policies.js'

// Organization data requests, background exports and the permanent purge records
// (database/platform-and-jobs.md, §2, §3 and §7).

const at = () => timestamp({ withTimezone: true })

/** Why an organization is purged; system-only, so the values are not in the contracts. */
export const ORGANIZATION_PURGE_REASONS = [
  'owner_request',
  'platform_request',
  'data_request',
] as const
export type OrganizationPurgeReason = (typeof ORGANIZATION_PURGE_REASONS)[number]

export const ORGANIZATION_PURGE_STATUSES = [
  'scheduled',
  'running',
  'completed',
  'failed',
  'canceled',
] as const
export type OrganizationPurgeStatus = (typeof ORGANIZATION_PURGE_STATUSES)[number]

/** `PurgeCounts` v1: rows deleted per table, and per partition for the partitioned tables. */
export interface PurgeCounts {
  version: 1
  tables: Record<string, number>
  partitionedTables: Record<string, number>
}

/**
 * The permanent record of one organization purge (RLS `system-only`). No foreign keys: the record
 * outlives the organization, its request and the people involved. It holds only ids, counts and
 * the certificate hash.
 */
export const organizationPurges = pgTable(
  'organization_purges',
  {
    id: id(),
    organizationId: uuid().notNull(),
    reason: text().$type<OrganizationPurgeReason>().notNull(),
    status: text().$type<OrganizationPurgeStatus>().notNull().default('scheduled'),
    dataRequestId: uuid(),
    requestedByUserId: uuid(),
    scheduledFor: at().notNull(),
    attempt: smallint().notNull().default(0),
    rowsDeleted: jsonb()
      .$type<PurgeCounts>()
      .notNull()
      .default(sql`'{"version":1,"tables":{},"partitionedTables":{}}'::jsonb`),
    objectsDeleted: bigint({ mode: 'number' }),
    certificateSha256: bytea(),
    errorCode: text(),
    startedAt: at(),
    finishedAt: at(),
    canceledAt: at(),
    ...timestamps(),
  },
  (t) => [
    // Also serves the per-organization lookups; satisfies the (organization_id, id) convention.
    unique('organization_purges_organization_id_id_key').on(t.organizationId, t.id),
    uniqueIndex('organization_purges_open_key')
      .on(t.organizationId)
      .where(sql`${t.status} in ('scheduled', 'running')`),
    index('organization_purges_due_idx')
      .on(t.scheduledFor)
      .where(sql`${t.status} = 'scheduled'`),
    enumCheck('organization_purges_reason_check', t.reason, ORGANIZATION_PURGE_REASONS),
    enumCheck('organization_purges_status_check', t.status, ORGANIZATION_PURGE_STATUSES),
    systemOnlyPolicy('organization_purges'),
  ],
)

/** An organization-level request to export all data or delete the organization. */
export const dataRequests = pgTable(
  'data_requests',
  {
    id: id(),
    organizationId: orgId(organizations),
    type: text().$type<DataRequestType>().notNull(),
    status: text().$type<DataRequestStatus>().notNull().default('requested'),
    requestedVia: text().$type<DataRequestVia>().notNull(),
    requestedByUserId: uuid().references(() => users.id, { onDelete: 'set null' }),
    /** Console or Partner reference; no foreign key, core never references extension tables. */
    externalRef: text(),
    reason: text(),
    /** `orgs/{orgId}/exports/{dataRequestId}.zip` */
    objectKey: text(),
    sizeBytes: bigint({ mode: 'number' }),
    expiresAt: at(),
    scheduledFor: at(),
    organizationPurgeId: uuid().references(() => organizationPurges.id, { onDelete: 'set null' }),
    errorCode: text(),
    deliveredAt: at(),
    canceledAt: at(),
    canceledByUserId: uuid().references(() => users.id, { onDelete: 'set null' }),
    ...timestamps(),
  },
  (t) => [
    unique('data_requests_organization_id_id_key').on(t.organizationId, t.id),
    uniqueIndex('data_requests_open_deletion_key')
      .on(t.organizationId)
      .where(sql`${t.type} = 'deletion' and ${t.status} in ('requested', 'scheduled')`),
    index('data_requests_organization_id_created_at_idx').on(
      t.organizationId,
      t.createdAt.desc(),
      t.id.desc(),
    ),
    index('data_requests_expires_at_idx')
      .on(t.expiresAt)
      .where(sql`${t.status} = 'ready'`),
    index('data_requests_requested_by_user_id_idx')
      .on(t.requestedByUserId)
      .where(sql`${t.requestedByUserId} is not null`),
    index('data_requests_canceled_by_user_id_idx')
      .on(t.canceledByUserId)
      .where(sql`${t.canceledByUserId} is not null`),
    index('data_requests_organization_purge_id_idx')
      .on(t.organizationPurgeId)
      .where(sql`${t.organizationPurgeId} is not null`),
    enumCheck('data_requests_type_check', t.type, DATA_REQUEST_TYPES),
    enumCheck('data_requests_status_check', t.status, DATA_REQUEST_STATUSES),
    enumCheck('data_requests_requested_via_check', t.requestedVia, DATA_REQUEST_VIAS),
    check(
      'data_requests_type_status_check',
      sql`(${t.type} = 'export' and ${t.status} in ('requested', 'preparing', 'ready', 'delivered', 'expired', 'failed', 'canceled'))
        or (${t.type} = 'deletion' and ${t.status} in ('requested', 'scheduled', 'canceled'))`,
    ),
    tenantPolicy('data_requests', t.organizationId),
  ],
)

/**
 * A file a person asked to prepare in the background; only the requester sees it. Named
 * `dataExports` in code, because `exports` is reserved at the top level of a module.
 */
export const dataExports = pgTable(
  'exports',
  {
    id: id(),
    organizationId: orgId(organizations),
    requestedByUserId: uuid().notNull(),
    kind: text().$type<ExportKind>().notNull(),
    status: text().$type<ExportStatus>().notNull().default('queued'),
    params: jsonb().$type<ExportParams>().notNull(),
    containsPersonalData: boolean().notNull(),
    /** `orgs/{orgId}/exports/{exportId}.{ext}` */
    objectKey: text(),
    /** The download name, never part of the object key. */
    fileName: text(),
    contentType: text(),
    sizeBytes: bigint({ mode: 'number' }),
    rowCount: integer(),
    attempts: smallint().notNull().default(0),
    errorCode: text(),
    expiresAt: at(),
    downloadedAt: at(),
    ...timestamps(),
  },
  (t) => [
    unique('exports_organization_id_id_key').on(t.organizationId, t.id),
    foreignKey({
      name: 'exports_organization_id_requested_by_user_id_fkey',
      columns: [t.organizationId, t.requestedByUserId],
      foreignColumns: [organizationMembers.organizationId, organizationMembers.userId],
    }).onDelete('cascade'), // removing the member deletes their exports
    index('exports_requester_idx').on(
      t.organizationId,
      t.requestedByUserId,
      t.createdAt.desc(),
      t.id.desc(),
    ),
    index('exports_open_idx')
      .on(t.status, t.createdAt)
      .where(sql`${t.status} in ('queued', 'preparing')`),
    index('exports_expires_at_idx')
      .on(t.expiresAt)
      .where(sql`${t.status} = 'ready'`),
    index('exports_cleanup_idx').on(t.createdAt),
    enumCheck('exports_kind_check', t.kind, EXPORT_KINDS),
    enumCheck('exports_status_check', t.status, EXPORT_STATUSES),
    tenantPolicy('exports', t.organizationId),
  ],
)
