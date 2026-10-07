// SPDX-License-Identifier: AGPL-3.0-only
import { z } from 'zod'

import { userRefDtoSchema } from '../auth/schemas.js'
import { multiValueQuery } from '../core/filters.js'
import { pageQuery } from '../core/pagination.js'
import { orgParamsSchema } from '../core/params.js'

// Organization-level data requests (export all data, delete the organization) and background
// exports a person asked for (database/platform-and-jobs.md §2–3; Settings › Data & privacy).
// Routes: GET/POST /api/v1/orgs/:orgId/data-requests · GET /api/v1/orgs/:orgId/data-requests/:dataRequestId ·
// POST …/data-requests/:dataRequestId/{cancel,retry,download} ·
// GET/POST /api/v1/orgs/:orgId/exports · GET /api/v1/orgs/:orgId/exports/:exportId ·
// POST …/exports/:exportId/{retry,download} · GET /api/v1/orgs/:orgId/data-control/retention.

export const DATA_REQUEST_TYPES = ['export', 'deletion'] as const
export type DataRequestType = (typeof DATA_REQUEST_TYPES)[number]

/** Export: requested → preparing → ready → delivered → expired (failed, canceled); deletion: requested → scheduled (canceled). */
export const DATA_REQUEST_STATUSES = [
  'requested',
  'preparing',
  'ready',
  'delivered',
  'expired',
  'failed',
  'scheduled',
  'canceled',
] as const
export type DataRequestStatus = (typeof DATA_REQUEST_STATUSES)[number]

export const DATA_REQUEST_VIAS = ['workspace', 'console', 'partner'] as const
export type DataRequestVia = (typeof DATA_REQUEST_VIAS)[number]

export const dataRequestReasonSchema = z.string().trim().min(1).max(1000)

export const dataRequestDtoSchema = z.object({
  id: z.uuid(),
  type: z.enum(DATA_REQUEST_TYPES),
  status: z.enum(DATA_REQUEST_STATUSES),
  requestedVia: z.enum(DATA_REQUEST_VIAS),
  /** The Owner who asked (workspace); null for Console and Partner requests. */
  requestedBy: userRefDtoSchema.nullable(),
  reason: z.string().nullable(),
  /** Export archive size once ready. */
  sizeBytes: z.number().int().nonnegative().nullable(),
  /** Export: when the archive and its link expire (24 hours after ready). */
  expiresAt: z.iso.datetime().nullable(),
  /** Deletion: end of the 30-day hold. */
  scheduledFor: z.iso.datetime().nullable(),
  errorCode: z.string().nullable(),
  deliveredAt: z.iso.datetime().nullable(),
  canceledAt: z.iso.datetime().nullable(),
  canceledByUserId: z.uuid().nullable(),
  createdAt: z.iso.datetime(),
  updatedAt: z.iso.datetime(),
})
export type DataRequestDto = z.infer<typeof dataRequestDtoSchema>

/**
 * `POST /api/v1/orgs/:orgId/data-requests`. Deletion needs a reason, a fresh session and two-factor
 * re-authentication (T3); it schedules the purge 30 days out and notifies every Owner.
 */
export const createDataRequestInputSchema = z.discriminatedUnion('type', [
  z.object({ type: z.literal('export') }),
  z.object({ type: z.literal('deletion'), reason: dataRequestReasonSchema }),
])
export type CreateDataRequestInput = z.infer<typeof createDataRequestInputSchema>

export const listDataRequestsQuerySchema = pageQuery.extend({
  type: multiValueQuery(z.enum(DATA_REQUEST_TYPES)),
  status: multiValueQuery(z.enum(DATA_REQUEST_STATUSES)),
})
export type ListDataRequestsQuery = z.infer<typeof listDataRequestsQuerySchema>

export const dataRequestParamsSchema = orgParamsSchema.extend({ dataRequestId: z.uuid() })
export type DataRequestParams = z.infer<typeof dataRequestParamsSchema>

/** A signed download URL issued on click after an access check; each download is audited. */
export const downloadLinkDtoSchema = z.object({
  url: z.url(),
  fileName: z.string(),
  contentType: z.string(),
  sizeBytes: z.number().int().nonnegative().nullable(),
  expiresAt: z.iso.datetime(),
})
export type DownloadLinkDto = z.infer<typeof downloadLinkDtoSchema>

export const EXPORT_KINDS = [
  'usage_csv',
  'runs_csv',
  'audit_csv',
  'audit_json',
  'chat_pdf',
  'chat_markdown',
  'chat_json',
  'members_csv',
] as const
export type ExportKind = (typeof EXPORT_KINDS)[number]

export const EXPORT_STATUSES = ['queued', 'preparing', 'ready', 'failed', 'expired'] as const
export type ExportStatus = (typeof EXPORT_STATUSES)[number]

export const EXPORT_FORMATS = ['csv', 'json', 'pdf', 'markdown'] as const
export type ExportFormat = (typeof EXPORT_FORMATS)[number]

/** `ExportParams` v1: what the export dialog collected; `filters` is the table's URL state. */
export const exportParamsSchema = z.object({
  version: z.literal(1),
  format: z.enum(EXPORT_FORMATS),
  dateRange: z
    .object({
      from: z.iso.datetime(),
      to: z.iso.datetime(),
      timeZone: z.string().min(1).max(64),
    })
    .optional(),
  filters: z.record(z.string(), z.unknown()).default({}),
  columns: z.array(z.string().min(1).max(100)).max(100).optional(),
  chatId: z.uuid().optional(),
  includeAttachments: z.boolean().optional(),
})
export type ExportParams = z.infer<typeof exportParamsSchema>

/** Only the requester sees their exports. `fileName` is the download name, never the object key. */
export const exportDtoSchema = z.object({
  id: z.uuid(),
  kind: z.enum(EXPORT_KINDS),
  status: z.enum(EXPORT_STATUSES),
  params: exportParamsSchema,
  /** Shown as the personal-data notice before starting; audited. */
  containsPersonalData: z.boolean(),
  fileName: z.string().nullable(),
  contentType: z.string().nullable(),
  sizeBytes: z.number().int().nonnegative().nullable(),
  rowCount: z.number().int().nonnegative().nullable(),
  attempts: z.number().int().nonnegative(),
  errorCode: z.string().nullable(),
  expiresAt: z.iso.datetime().nullable(),
  downloadedAt: z.iso.datetime().nullable(),
  createdAt: z.iso.datetime(),
  updatedAt: z.iso.datetime(),
})
export type ExportDto = z.infer<typeof exportDtoSchema>

/**
 * `POST /api/v1/orgs/:orgId/exports` (202): the producing module's read permission is checked too;
 * `audit_csv` and `audit_json` need the `audit-export` feature. Small exports (under 5,000 rows)
 * stream directly from the producing module's own export route instead.
 */
export const createExportInputSchema = z.object({
  kind: z.enum(EXPORT_KINDS),
  params: exportParamsSchema,
})
export type CreateExportInput = z.infer<typeof createExportInputSchema>

export const listExportsQuerySchema = pageQuery.extend({
  kind: multiValueQuery(z.enum(EXPORT_KINDS)),
  status: multiValueQuery(z.enum(EXPORT_STATUSES)),
})
export type ListExportsQuery = z.infer<typeof listExportsQuerySchema>

export const exportIdParamsSchema = orgParamsSchema.extend({ exportId: z.uuid() })
export type ExportIdParams = z.infer<typeof exportIdParamsSchema>

/** One line of "where data is stored, retention per data type" (Settings › Data & privacy). */
export const retentionItemDtoSchema = z.object({
  /** `chats`, `audit_logs`, `usage_events`, `notifications`, `exports`, `deleted_items`… */
  key: z.string().min(1),
  /** Days kept; null = until deleted by a person. */
  retentionDays: z.number().int().positive().nullable(),
  /** Changeable with the `retention-policies` feature. */
  configurable: z.boolean(),
})
export type RetentionItemDto = z.infer<typeof retentionItemDtoSchema>

/** `GET /api/v1/orgs/:orgId/data-control/retention`. */
export const dataRetentionDtoSchema = z.object({
  /** Data region label (`data-regions`, Cloud); null on self-hosted installs. */
  region: z.string().nullable(),
  items: z.array(retentionItemDtoSchema),
})
export type DataRetentionDto = z.infer<typeof dataRetentionDtoSchema>
