// SPDX-License-Identifier: AGPL-3.0-only
import { SESSION_TTL } from '@/core/auth/index.js'
import { sqlState, type Database, type DbExecutor } from '@/core/database/index.js'
import { decodeCursor, toPage } from '@/lib/pagination.js'
import {
  AUDIT_ACTIONS,
  FEATURES,
  PERMISSIONS,
  type CreateDataRequestInput,
  type DataRequestDto,
  type DataRetentionDto,
  type DownloadLinkDto,
  type ListDataRequestsQuery,
  type Permission,
} from '@surefy/contracts'

import {
  DELETION_HOLD_DAYS,
  DOWNLOAD_URL_TTL_SECONDS,
  EXPORT_FAILED_CODE,
  EXPORT_TTL_HOURS,
  RETENTION_DAYS,
} from './dataControl.constants.js'
import {
  DataControlForbiddenError,
  DataRequestNotCancelableError,
  DataRequestNotFoundError,
  DataRequestNotReadyError,
  DataRequestNotRetryableError,
  DeletionNeedsTwoFactorError,
  DeletionPendingError,
  SessionNotFreshError,
} from './dataControl.errors.js'
import { toDataRequestDto } from './dataControl.mapper.js'
import { zipArchive, type ArchiveFile } from './dataControl.utils.js'

import type { DataArchiveRepository } from './dataArchive/dataArchive.repository.js'
import type { PrepareDataExportPayload } from './dataControl.jobs.js'
import type { DataControlRepository, DataRequestRow } from './dataControl.repository.js'
import type {
  DataControlContext,
  DataControlNotifications,
  DataControlOrganizations,
  DataControlUsers,
} from './dataControl.types.js'
import type { JobDefinition, Queues } from '@/core/queue/index.js'
import type { StorageProvider } from '@/integrations/storage/index.js'
import type { AuditRecorder } from '@/modules/audit/index.js'
import type { Readable } from 'node:stream'

export interface DataControlServiceDeps {
  db: Database
  queues: Queues
  storage: StorageProvider
  dataControlRepository: DataControlRepository
  dataArchiveRepository: DataArchiveRepository
  organizations: DataControlOrganizations
  users: DataControlUsers
  notifications: DataControlNotifications
  audit: AuditRecorder
  /** Whether the organization has a feature (retention policies), from the access module. */
  hasFeature: (
    ctx: DataControlContext,
    feature: (typeof FEATURES)[keyof typeof FEATURES],
  ) => Promise<boolean>
  prepareDataExportJob: () => JobDefinition<PrepareDataExportPayload>
}

const DAY_MS = 86_400_000
const UNIQUE_VIOLATION = '23505'

const assertPermission = (ctx: DataControlContext, permission: Permission): void => {
  if (!ctx.access.permissions.includes(permission)) throw new DataControlForbiddenError(permission)
}

const archiveKey = (orgId: string, requestId: string) => `orgs/${orgId}/exports/${requestId}.zip`

const isUniqueViolation = (error: unknown): boolean => sqlState(error) === UNIQUE_VIOLATION

const toBuffer = async (stream: Readable): Promise<Buffer> => {
  const chunks: Buffer[] = []
  for await (const chunk of stream)
    chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk as string))
  return Buffer.concat(chunks)
}

/**
 * Organization-level data requests (platform-and-jobs.md, §2): export all data (a ZIP prepared in
 * the `data-control` queue) and delete the organization (a 30-day hold, then the purge), plus the
 * retention overview of Settings › Data & privacy.
 */
export class DataControlService {
  constructor(private readonly deps: DataControlServiceDeps) {}

  async list(
    ctx: DataControlContext,
    query: ListDataRequestsQuery,
  ): Promise<{ items: DataRequestDto[]; nextCursor: string | null }> {
    const rows = await this.deps.db.tenant(ctx.orgId, (tx) =>
      this.deps.dataControlRepository.listRequests(tx, ctx.orgId, {
        limit: query.limit,
        ...(query.cursor === undefined ? {} : { cursor: decodeCursor(query.cursor) }),
        ...(query.type === undefined ? {} : { type: query.type }),
        ...(query.status === undefined ? {} : { status: query.status }),
      }),
    )
    const { items, nextCursor } = toPage(rows, query.limit, (row) => ({
      k: row.sortKey,
      id: row.row.id,
    }))
    return { items: await this.toDtos(items.map((item) => item.row)), nextCursor }
  }

  async get(ctx: DataControlContext, id: string): Promise<DataRequestDto> {
    const row = await this.deps.db.tenant(ctx.orgId, (tx) => this.findOrThrow(tx, ctx.orgId, id))
    const [dto] = await this.toDtos([row])
    if (dto === undefined) throw new DataRequestNotFoundError()
    return dto
  }

  /**
   * Export all data (Owners): queued after commit. Delete the organization (Owners, T3): a fresh
   * session and two-factor on the account; the organization enters its 30-day hold in the same
   * transaction, and every Owner is notified after it commits.
   */
  async create(ctx: DataControlContext, input: CreateDataRequestInput): Promise<DataRequestDto> {
    if (input.type === 'export') return this.createExport(ctx)
    assertPermission(ctx, PERMISSIONS.DATA_CONTROL_DELETE)
    await this.assertReauthenticated(ctx)
    const scheduledFor = new Date(Date.now() + DELETION_HOLD_DAYS * DAY_MS)
    const { row, owners } = await this.deps.db
      .tenant(ctx.orgId, async (tx) => {
        const scheduled = await this.deps.organizations.scheduleDeletionInTx(tx, ctx.orgId, {
          requestedByUserId: ctx.userId,
          scheduledFor,
        })
        if (!scheduled) throw new DeletionPendingError()
        const request = await this.deps.dataControlRepository.insertRequest(tx, {
          organizationId: ctx.orgId,
          type: 'deletion',
          status: 'scheduled',
          requestedVia: 'workspace',
          requestedByUserId: ctx.userId,
          reason: input.reason,
          scheduledFor,
        })
        await this.deps.audit.record(tx, ctx, {
          action: AUDIT_ACTIONS.ORGANIZATION_DELETION_SCHEDULED,
          target: { type: 'organization', id: ctx.orgId },
          reason: input.reason,
          metadata: { refs: { dataRequestId: request.id } },
        })
        return {
          row: request,
          owners: await this.deps.dataControlRepository.listActiveOwnerIds(tx, ctx.orgId),
        }
      })
      .catch((error: unknown) => {
        if (isUniqueViolation(error)) throw new DeletionPendingError()
        throw error
      })
    for (const userId of owners) {
      await this.deps.notifications.notify(ctx, {
        userId,
        type: 'organization.deletion_scheduled',
        params: { version: 1, scheduledFor: scheduledFor.toISOString() },
        target: { type: 'organization', id: ctx.orgId },
        ...(ctx.userId === null ? {} : { actorUserId: ctx.userId }),
        dedupeKey: `deletion-${row.id}`,
      })
    }
    return this.get(ctx, row.id)
  }

  /** Cancel deletion (T2) restores the organization; an export waiting to start is dropped. */
  async cancel(ctx: DataControlContext, id: string): Promise<DataRequestDto> {
    await this.deps.db.tenant(ctx.orgId, async (tx) => {
      const current = await this.findOrThrow(tx, ctx.orgId, id)
      assertPermission(
        ctx,
        current.type === 'deletion'
          ? PERMISSIONS.DATA_CONTROL_DELETE
          : PERMISSIONS.DATA_CONTROL_EXPORT,
      )
      const from =
        current.type === 'deletion'
          ? (['requested', 'scheduled'] as const)
          : (['requested'] as const)
      const canceled = await this.deps.dataControlRepository.updateRequest(
        tx,
        ctx.orgId,
        id,
        { status: 'canceled', canceledAt: new Date(), canceledByUserId: ctx.userId },
        from,
      )
      if (canceled === undefined) throw new DataRequestNotCancelableError()
      if (current.type === 'deletion') {
        await this.deps.organizations.cancelDeletionInTx(tx, ctx.orgId)
        await this.deps.audit.record(tx, ctx, {
          action: AUDIT_ACTIONS.ORGANIZATION_DELETION_CANCELED,
          target: { type: 'organization', id: ctx.orgId },
          metadata: { refs: { dataRequestId: id } },
        })
      }
    })
    return this.get(ctx, id)
  }

  /** Try again: a failed export goes back to the queue. */
  async retry(ctx: DataControlContext, id: string): Promise<DataRequestDto> {
    assertPermission(ctx, PERMISSIONS.DATA_CONTROL_EXPORT)
    await this.deps.db.tenant(ctx.orgId, async (tx) => {
      const current = await this.findOrThrow(tx, ctx.orgId, id)
      if (current.type !== 'export') throw new DataRequestNotRetryableError()
      const retried = await this.deps.dataControlRepository.updateRequest(
        tx,
        ctx.orgId,
        id,
        { status: 'requested', errorCode: null },
        ['failed'],
      )
      if (retried === undefined) throw new DataRequestNotRetryableError()
    })
    await this.enqueueArchive(ctx.orgId, id)
    return this.get(ctx, id)
  }

  /** A signed link to the archive, issued after the access check; each download is audited. */
  async download(ctx: DataControlContext, id: string): Promise<DownloadLinkDto> {
    assertPermission(ctx, PERMISSIONS.DATA_CONTROL_EXPORT)
    const row = await this.deps.db.tenant(ctx.orgId, async (tx) => {
      const current = await this.findOrThrow(tx, ctx.orgId, id)
      const usable =
        current.type === 'export' &&
        (current.status === 'ready' || current.status === 'delivered') &&
        current.objectKey !== null &&
        current.expiresAt !== null &&
        current.expiresAt > new Date()
      if (!usable) throw new DataRequestNotReadyError()
      const delivered =
        current.status === 'ready'
          ? ((await this.deps.dataControlRepository.updateRequest(
              tx,
              ctx.orgId,
              id,
              { status: 'delivered', deliveredAt: new Date() },
              ['ready'],
            )) ?? current)
          : current
      await this.deps.audit.record(tx, ctx, {
        action: AUDIT_ACTIONS.EXPORT_DOWNLOADED,
        target: { type: 'data_request', id },
      })
      return delivered
    })
    const fileName = `organization-export-${row.createdAt.toISOString().slice(0, 10)}.zip`
    const expiresAt = new Date(
      Math.min(Date.now() + DOWNLOAD_URL_TTL_SECONDS * 1000, row.expiresAt?.getTime() ?? 0),
    )
    const url = await this.deps.storage.getSignedUrl(row.objectKey ?? '', {
      expiresInSeconds: Math.max(1, Math.floor((expiresAt.getTime() - Date.now()) / 1000)),
      disposition: `attachment; filename="${fileName}"`,
    })
    return {
      url,
      fileName,
      contentType: 'application/zip',
      sizeBytes: row.sizeBytes,
      expiresAt: expiresAt.toISOString(),
    }
  }

  /** Where data is kept and for how long (Settings › Data & privacy). */
  async retention(ctx: DataControlContext): Promise<DataRetentionDto> {
    const configurable = await this.deps.hasFeature(ctx, FEATURES.RETENTION_POLICIES)
    return {
      region: null, // data regions are a Cloud feature
      items: [
        { key: 'chats', retentionDays: null, configurable },
        { key: 'deleted_items', retentionDays: RETENTION_DAYS.deletedItems, configurable },
        { key: 'audit_logs', retentionDays: RETENTION_DAYS.auditLogs, configurable },
        { key: 'usage_events', retentionDays: RETENTION_DAYS.usageEvents, configurable: false },
        { key: 'notifications', retentionDays: RETENTION_DAYS.notifications, configurable: false },
        { key: 'exports', retentionDays: 30, configurable: false },
      ],
    }
  }

  // ---- Jobs ---------------------------------------------------------------------------------

  /**
   * `prepareDataExport`: the full archive, one JSON file per area plus the stored files, written
   * under the organization's prefix. Idempotent: only a `requested` or `preparing` request is
   * prepared. The requester hears `export.ready` or, on the last attempt, `export.failed`.
   */
  async prepareArchive(orgId: string, id: string): Promise<void> {
    const repository = this.deps.dataControlRepository
    const request = await this.deps.db.tenant(orgId, (tx) =>
      repository.updateRequest(tx, orgId, id, { status: 'preparing' }, ['requested', 'preparing']),
    )
    if (request === undefined) return // canceled, already prepared, or gone with the organization
    const { areas, keys } = await this.deps.db.tenant(orgId, async (tx) => ({
      areas: await this.deps.dataArchiveRepository.readAreas(tx, orgId),
      keys: await this.deps.dataArchiveRepository.listObjectKeys(tx, orgId),
    }))
    const files: ArchiveFile[] = areas.map((area) => ({
      name: area.file,
      data: Buffer.from(area.json, 'utf8'),
    }))
    for (const key of keys) {
      files.push({ name: `files/${key}`, data: await toBuffer(await this.deps.storage.get(key)) })
    }
    const archive = zipArchive(files)
    const objectKey = archiveKey(orgId, id)
    await this.deps.storage.put(objectKey, archive, {
      contentType: 'application/zip',
      size: archive.length,
    })
    const ready = await this.deps.db.tenant(orgId, (tx) =>
      repository.updateRequest(
        tx,
        orgId,
        id,
        {
          status: 'ready',
          objectKey,
          sizeBytes: archive.length,
          expiresAt: new Date(Date.now() + EXPORT_TTL_HOURS * 3_600_000),
          errorCode: null,
        },
        ['preparing'],
      ),
    )
    if (ready?.requestedByUserId != null) {
      await this.deps.notifications.notify(
        { orgId },
        {
          userId: ready.requestedByUserId,
          type: 'export.ready',
          params: { version: 1, kind: 'organization' },
          target: { type: 'data_request', id },
          dedupeKey: `data-export-ready-${id}`,
        },
      )
    }
  }

  /** The last attempt failed: the request shows "Try again" and the requester is told. */
  async failArchive(orgId: string, id: string): Promise<void> {
    const failed = await this.deps.db.tenant(orgId, (tx) =>
      this.deps.dataControlRepository.updateRequest(
        tx,
        orgId,
        id,
        { status: 'failed', errorCode: EXPORT_FAILED_CODE },
        ['requested', 'preparing'],
      ),
    )
    if (failed?.requestedByUserId != null) {
      await this.deps.notifications.notify(
        { orgId },
        {
          userId: failed.requestedByUserId,
          type: 'export.failed',
          params: { version: 1, kind: 'organization' },
          target: { type: 'data_request', id },
          dedupeKey: `data-export-failed-${id}-${failed.updatedAt.getTime()}`,
        },
      )
    }
  }

  // ---- Private ------------------------------------------------------------------------------

  private async createExport(ctx: DataControlContext): Promise<DataRequestDto> {
    assertPermission(ctx, PERMISSIONS.DATA_CONTROL_EXPORT)
    const row = await this.deps.db.tenant(ctx.orgId, async (tx) => {
      const request = await this.deps.dataControlRepository.insertRequest(tx, {
        organizationId: ctx.orgId,
        type: 'export',
        status: 'requested',
        requestedVia: 'workspace',
        requestedByUserId: ctx.userId,
      })
      await this.deps.audit.record(tx, ctx, {
        action: AUDIT_ACTIONS.ORGANIZATION_EXPORT_REQUESTED,
        target: { type: 'data_request', id: request.id },
      })
      return request
    })
    await this.enqueueArchive(ctx.orgId, row.id)
    return this.get(ctx, row.id)
  }

  private async enqueueArchive(orgId: string, id: string): Promise<void> {
    const job = this.deps.prepareDataExportJob()
    const jobId = `data-export-${id}`
    const existing = await this.deps.queues.get(job.queue).getJob(jobId)
    if (existing !== undefined && !(await existing.isActive())) await existing.remove()
    await this.deps.queues.enqueue(job, { orgId, dataRequestId: id }, { jobId })
  }

  /** T3: a sign-in within the last 10 minutes, on an account with two-factor turned on. */
  private async assertReauthenticated(ctx: DataControlContext): Promise<void> {
    const signedInAt = ctx.session?.createdAt.getTime() ?? 0
    if (Date.now() - signedInAt > SESSION_TTL.freshAge * 1000) throw new SessionNotFreshError()
    const user = ctx.userId === null ? undefined : await this.deps.users.findById(ctx.userId)
    if (user?.twoFactorEnabled !== true) throw new DeletionNeedsTwoFactorError()
  }

  private async findOrThrow(tx: DbExecutor, orgId: string, id: string): Promise<DataRequestRow> {
    const row = await this.deps.dataControlRepository.findRequest(tx, orgId, id)
    if (row === undefined) throw new DataRequestNotFoundError()
    return row
  }

  private async toDtos(rows: readonly DataRequestRow[]): Promise<DataRequestDto[]> {
    const ids = rows.flatMap((row) =>
      row.requestedByUserId === null ? [] : [row.requestedByUserId],
    )
    const refs = await this.deps.users.findUserRefs([...new Set(ids)])
    return rows.map((row) =>
      toDataRequestDto(
        row,
        row.requestedByUserId === null ? null : (refs.get(row.requestedByUserId) ?? null),
      ),
    )
  }
}
