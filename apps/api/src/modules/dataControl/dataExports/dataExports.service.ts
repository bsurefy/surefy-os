// SPDX-License-Identifier: AGPL-3.0-only
import { ForbiddenError } from '@/core/errors/index.js'
import { decodeCursor, toPage } from '@/lib/pagination.js'
import {
  AUDIT_ACTIONS,
  ERROR_CODES,
  FEATURE_EDITIONS,
  FEATURES,
  type CreateExportInput,
  type DownloadLinkDto,
  type ExportDto,
  type ExportKind,
  type ListExportsQuery,
} from '@surefy/contracts'

import {
  DOWNLOAD_URL_TTL_SECONDS,
  EXPORT_FAILED_CODE,
  EXPORT_TTL_HOURS,
} from '../dataControl.constants.js'
import {
  DataControlForbiddenError,
  ExportKindUnavailableError,
  ExportNotFoundError,
  ExportNotReadyError,
  ExportNotRetryableError,
} from '../dataControl.errors.js'
import { toExportDto } from '../dataControl.mapper.js'
import { toCsv } from '../dataControl.utils.js'

import type { ExportProducer } from './exportProducers.js'
import type { PrepareExportPayload } from '../dataControl.jobs.js'
import type { DataControlRepository, ExportRow } from '../dataControl.repository.js'
import type {
  DataControlAccess,
  DataControlContext,
  DataControlNotifications,
} from '../dataControl.types.js'
import type { Database, DbExecutor } from '@/core/database/index.js'
import type { JobDefinition, Queues } from '@/core/queue/index.js'
import type { StorageProvider } from '@/integrations/storage/index.js'
import type { AuditRecorder } from '@/modules/audit/index.js'

export interface DataExportsServiceDeps {
  db: Database
  queues: Queues
  storage: StorageProvider
  dataControlRepository: DataControlRepository
  access: DataControlAccess
  notifications: DataControlNotifications
  audit: AuditRecorder
  producers: readonly ExportProducer[]
  prepareExportJob: () => JobDefinition<PrepareExportPayload>
}

const AUDIT_KINDS = new Set<ExportKind>(['audit_csv', 'audit_json'])

/** Whoever asked: only they see and download their exports. */
const requesterOf = (ctx: DataControlContext): string => {
  if (ctx.userId === null) {
    throw new ForbiddenError(ERROR_CODES.ACCESS_FORBIDDEN, 'A person is required')
  }
  return ctx.userId
}

/** A short-lived signed link, never past the file's own expiry. */
const linkExpiry = (fileExpiresAt: Date | null): Date =>
  new Date(Math.min(Date.now() + DOWNLOAD_URL_TTL_SECONDS * 1000, fileExpiresAt?.getTime() ?? 0))

const secondsUntil = (date: Date): number =>
  Math.max(1, Math.floor((date.getTime() - Date.now()) / 1000))

/**
 * Background exports a person asked for (platform-and-jobs.md, §3, "Export lifecycle"): queued,
 * prepared in the `data-control` queue with the requester's access re-checked, downloadable for
 * 24 hours through a signed link, kept as a row for 30 days.
 */
export class DataExportsService {
  private readonly producers: ReadonlyMap<ExportKind, ExportProducer>

  constructor(private readonly deps: DataExportsServiceDeps) {
    this.producers = new Map(deps.producers.map((producer) => [producer.kind, producer]))
  }

  async list(
    ctx: DataControlContext,
    query: ListExportsQuery,
  ): Promise<{ items: ExportDto[]; nextCursor: string | null }> {
    const userId = requesterOf(ctx)
    const rows = await this.deps.db.tenant(ctx.orgId, (tx) =>
      this.deps.dataControlRepository.listExports(tx, ctx.orgId, userId, {
        limit: query.limit,
        ...(query.cursor === undefined ? {} : { cursor: decodeCursor(query.cursor) }),
        ...(query.kind === undefined ? {} : { kind: query.kind }),
        ...(query.status === undefined ? {} : { status: query.status }),
      }),
    )
    const { items, nextCursor } = toPage(rows, query.limit, (row) => ({
      k: row.sortKey,
      id: row.row.id,
    }))
    return { items: items.map((item) => toExportDto(item.row)), nextCursor }
  }

  async get(ctx: DataControlContext, id: string): Promise<ExportDto> {
    const userId = requesterOf(ctx)
    return toExportDto(
      await this.deps.db.tenant(ctx.orgId, (tx) => this.findOrThrow(tx, ctx.orgId, userId, id)),
    )
  }

  /** Checks the producing module's permission and feature, queues the export after commit. */
  async create(ctx: DataControlContext, input: CreateExportInput): Promise<ExportDto> {
    const userId = requesterOf(ctx)
    const producer = this.producerFor(ctx, input.kind)
    const row = await this.deps.db.tenant(ctx.orgId, async (tx) => {
      const created = await this.deps.dataControlRepository.insertExport(tx, {
        organizationId: ctx.orgId,
        requestedByUserId: userId,
        kind: input.kind,
        params: input.params,
        containsPersonalData: producer.containsPersonalData,
      })
      await this.auditRequested(tx, ctx, created)
      return created
    })
    await this.enqueue(ctx.orgId, row.id)
    return toExportDto(row)
  }

  /** "Try again": a failed export is queued again; an expired one is prepared as a new export. */
  async retry(ctx: DataControlContext, id: string): Promise<ExportDto> {
    const userId = requesterOf(ctx)
    const repository = this.deps.dataControlRepository
    const row = await this.deps.db.tenant(ctx.orgId, async (tx) => {
      const current = await this.findOrThrow(tx, ctx.orgId, userId, id)
      const producer = this.producerFor(ctx, current.kind)
      if (current.status === 'failed') {
        const queued = await repository.updateExport(
          tx,
          ctx.orgId,
          id,
          { status: 'queued', errorCode: null, attempts: current.attempts + 1 },
          ['failed'],
        )
        if (queued === undefined) throw new ExportNotRetryableError()
        return queued
      }
      if (current.status !== 'expired') throw new ExportNotRetryableError()
      const again = await repository.insertExport(tx, {
        organizationId: ctx.orgId,
        requestedByUserId: userId,
        kind: current.kind,
        params: current.params,
        containsPersonalData: producer.containsPersonalData,
      })
      await this.auditRequested(tx, ctx, again)
      return again
    })
    await this.enqueue(ctx.orgId, row.id)
    return toExportDto(row)
  }

  /** A signed link issued on click after the access check; every download is audited. */
  async download(ctx: DataControlContext, id: string): Promise<DownloadLinkDto> {
    const userId = requesterOf(ctx)
    const row = await this.deps.db.tenant(ctx.orgId, async (tx) => {
      const current = await this.findOrThrow(tx, ctx.orgId, userId, id)
      const usable =
        current.status === 'ready' &&
        current.objectKey !== null &&
        current.expiresAt !== null &&
        current.expiresAt > new Date()
      if (!usable) throw new ExportNotReadyError()
      if (current.downloadedAt === null) {
        await this.deps.dataControlRepository.updateExport(tx, ctx.orgId, id, {
          downloadedAt: new Date(),
        })
      }
      await this.deps.audit.record(tx, ctx, {
        action: AUDIT_ACTIONS.EXPORT_DOWNLOADED,
        target: { type: 'export', id },
        metadata: { labels: { kind: current.kind } },
      })
      return current
    })
    const expiresAt = linkExpiry(row.expiresAt)
    const fileName = row.fileName ?? `${row.kind}.csv`
    const url = await this.deps.storage.getSignedUrl(row.objectKey ?? '', {
      expiresInSeconds: secondsUntil(expiresAt),
      disposition: `attachment; filename="${fileName}"`,
    })
    return {
      url,
      fileName,
      contentType: row.contentType ?? 'text/csv',
      sizeBytes: row.sizeBytes,
      expiresAt: expiresAt.toISOString(),
    }
  }

  // ---- Jobs ---------------------------------------------------------------------------------

  /**
   * `prepareExport`: re-checks the requester's membership and access, produces the rows in the
   * organization's tenant transaction and stores the file. Idempotent on the row's status.
   */
  async prepare(orgId: string, id: string): Promise<void> {
    const repository = this.deps.dataControlRepository
    const row = await this.deps.db.tenant(orgId, (tx) =>
      repository.updateExport(tx, orgId, id, { status: 'preparing' }, ['queued', 'preparing']),
    )
    if (row === undefined) return
    const producer = this.producers.get(row.kind)
    const access = await this.deps.access.forMember(orgId, row.requestedByUserId)
    const allowed =
      producer !== undefined &&
      access !== null &&
      access.permissions.includes(producer.permission) &&
      (producer.feature === undefined || access.features.includes(producer.feature))
    if (!allowed) {
      await this.fail(orgId, id)
      return
    }
    const now = new Date()
    const table = await this.deps.db.tenant(orgId, (tx) =>
      producer.produce(tx, { orgId, params: row.params }),
    )
    const body = Buffer.from(toCsv(table.columns, table.rows), 'utf8')
    const objectKey = `orgs/${orgId}/exports/${id}.csv`
    await this.deps.storage.put(objectKey, body, { contentType: 'text/csv', size: body.length })
    const ready = await this.deps.db.tenant(orgId, (tx) =>
      repository.updateExport(
        tx,
        orgId,
        id,
        {
          status: 'ready',
          objectKey,
          fileName: `${producer.baseName(now)}.csv`,
          contentType: 'text/csv',
          sizeBytes: body.length,
          rowCount: table.rows.length,
          expiresAt: new Date(now.getTime() + EXPORT_TTL_HOURS * 3_600_000),
          errorCode: null,
        },
        ['preparing'],
      ),
    )
    if (ready !== undefined) await this.notifyOutcome(orgId, ready, 'export.ready')
  }

  /** The export failed for good: "Try again" and the requester is told. */
  async fail(orgId: string, id: string): Promise<void> {
    const failed = await this.deps.db.tenant(orgId, (tx) =>
      this.deps.dataControlRepository.updateExport(
        tx,
        orgId,
        id,
        { status: 'failed', errorCode: EXPORT_FAILED_CODE },
        ['queued', 'preparing'],
      ),
    )
    if (failed !== undefined) await this.notifyOutcome(orgId, failed, 'export.failed')
  }

  // ---- Private ------------------------------------------------------------------------------

  private producerFor(ctx: DataControlContext, kind: ExportKind): ExportProducer {
    if (AUDIT_KINDS.has(kind) && !ctx.access.features.includes(FEATURES.AUDIT_EXPORT)) {
      throw new ForbiddenError(ERROR_CODES.FEATURE_NOT_AVAILABLE, 'Feature not available', {
        details: [
          {
            feature: FEATURES.AUDIT_EXPORT,
            minimumEdition: FEATURE_EDITIONS[FEATURES.AUDIT_EXPORT].minimum,
          },
        ],
      })
    }
    const producer = this.producers.get(kind)
    if (producer === undefined) throw new ExportKindUnavailableError(kind)
    if (!ctx.access.permissions.includes(producer.permission)) {
      throw new DataControlForbiddenError(producer.permission)
    }
    return producer
  }

  private auditRequested(tx: DbExecutor, ctx: DataControlContext, row: ExportRow) {
    return this.deps.audit.record(tx, ctx, {
      action: AUDIT_ACTIONS.EXPORT_REQUESTED,
      target: { type: 'export', id: row.id },
      metadata: {
        labels: { kind: row.kind, containsPersonalData: row.containsPersonalData },
      },
    })
  }

  private async enqueue(orgId: string, id: string): Promise<void> {
    const job = this.deps.prepareExportJob()
    const jobId = `export-${id}`
    const existing = await this.deps.queues.get(job.queue).getJob(jobId)
    if (existing !== undefined && !(await existing.isActive())) await existing.remove()
    await this.deps.queues.enqueue(job, { orgId, exportId: id }, { jobId })
  }

  private notifyOutcome(orgId: string, row: ExportRow, type: 'export.ready' | 'export.failed') {
    return this.deps.notifications.notify(
      { orgId },
      {
        userId: row.requestedByUserId,
        type,
        params: { version: 1, kind: row.kind },
        target: { type: 'export', id: row.id },
        dedupeKey: `${type}-${row.id}-${row.attempts}`,
      },
    )
  }

  private async findOrThrow(
    tx: DbExecutor,
    orgId: string,
    userId: string,
    id: string,
  ): Promise<ExportRow> {
    const row = await this.deps.dataControlRepository.findExport(tx, orgId, userId, id)
    if (row === undefined) throw new ExportNotFoundError()
    return row
  }
}
