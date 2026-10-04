// SPDX-License-Identifier: AGPL-3.0-only
import { createHash } from 'node:crypto'

import { sqlState } from '@/core/database/index.js'
import { canonicalJson } from '@/modules/audit/index.js'

import {
  CLEANUP_BATCH,
  EXPORT_ROW_RETENTION_DAYS,
  PARTITION_MONTHS_AHEAD,
  PARTITIONED_TABLES,
  PURGE_ERROR_CODES,
  RETENTION_DAYS,
  SOFT_DELETE_TABLES,
} from '../dataControl.constants.js'

import type { DataRetentionRepository, ExpiredObject } from './dataRetention.repository.js'
import type { PurgeOrganizationPayload } from '../dataControl.jobs.js'
import type { Database, DbExecutor } from '@/core/database/index.js'
import type { Logger } from '@/core/logger/index.js'
import type { JobDefinition, Queues } from '@/core/queue/index.js'
import type { StorageProvider } from '@/integrations/storage/index.js'

export interface DataRetentionServiceDeps {
  db: Database
  queues: Queues
  storage: StorageProvider
  logger: Logger
  dataRetentionRepository: DataRetentionRepository
  purgeOrganizationJob: () => JobDefinition<PurgeOrganizationPayload>
}

const FOREIGN_KEY_VIOLATION = '23503'

/**
 * Retention and purge (conventions-and-security.md, §8–9; platform-and-jobs.md, "Purge
 * lifecycle"): the `maintenance` queue's daily cleanup, partition upkeep and soft-delete purge,
 * the scheduling of organization purges past their hold, and the purge itself.
 */
export class DataRetentionService {
  constructor(private readonly deps: DataRetentionServiceDeps) {}

  /** `cleanup-daily`: every expired row and file, in batches, each batch its own transaction. */
  async cleanup(): Promise<Record<string, number>> {
    const repository = this.deps.dataRetentionRepository
    const removed: Record<string, number> = {
      notifications: await this.loop((tx) =>
        repository.deleteOldNotifications(tx, RETENTION_DAYS.notifications, CLEANUP_BATCH),
      ),
      invitations: await this.loop((tx) =>
        repository.deleteResolvedInvitations(tx, RETENTION_DAYS.invitations, CLEANUP_BATCH),
      ),
      slugHistory: await this.loop((tx) => repository.deleteExpiredSlugHistory(tx, CLEANUP_BATCH)),
      exportFiles: await this.expireObjects(
        (tx) => repository.listExpiredExports(tx, CLEANUP_BATCH),
        (tx, ids) => repository.markExportsExpired(tx, ids),
      ),
      exportRows: await this.expireObjects(
        (tx) => repository.listOldExports(tx, EXPORT_ROW_RETENTION_DAYS, CLEANUP_BATCH),
        (tx, ids) => repository.deleteExports(tx, ids),
      ),
      archives: await this.expireObjects(
        (tx) => repository.listExpiredArchives(tx, CLEANUP_BATCH),
        (tx, ids) => repository.markArchivesExpired(tx, ids),
      ),
      authRows: 0,
    }
    let batch: number
    do {
      batch = await repository.deleteExpiredAuthRows(
        this.deps.db.global,
        RETENTION_DAYS.sessions,
        CLEANUP_BATCH,
      )
      removed.authRows = (removed.authRows ?? 0) + batch
    } while (batch > 0)
    return removed
  }

  /**
   * `ensure-partitions-daily`: months ahead for every partitioned table, then expired partitions
   * dropped. Rows in a DEFAULT partition are an operator alert (error log).
   */
  async maintainPartitions(): Promise<void> {
    const repository = this.deps.dataRetentionRepository
    for (const { table, keep } of PARTITIONED_TABLES) {
      const { created, defaultRows, dropped } = await this.deps.db.system(
        'maintenance',
        async (tx) => ({
          ...(await repository.ensurePartitions(tx, table, PARTITION_MONTHS_AHEAD)),
          dropped: await repository.dropExpiredPartitions(tx, table, keep),
        }),
      )
      if (defaultRows > 0) {
        this.deps.logger.error(
          { table, db_default_partition_rows: defaultRows },
          'rows in the default partition',
        )
      }
      if (created > 0 || dropped.length > 0) {
        this.deps.logger.info({ table, created, dropped }, 'partitions maintained')
      }
    }
  }

  /**
   * `purge-soft-deleted-daily`: soft-deleted rows past their restore window. The soft-delete
   * tables and `purge_soft_deleted` arrive with their modules; until then there is nothing to do.
   */
  purgeSoftDeleted(): Promise<number> {
    return Promise.resolve(SOFT_DELETE_TABLES.length)
  }

  /**
   * `organization-purge-due`: records the purge of every organization that entered its hold,
   * cancels purges whose deletion was canceled, and starts the due ones (`purgeOrganization` on
   * the `data-control` queue, one job per purge).
   */
  async scheduleDuePurges(): Promise<number> {
    const repository = this.deps.dataRetentionRepository
    const due = await this.deps.db.system('data-control', async (tx) => {
      await repository.recordScheduledPurges(tx)
      await repository.cancelAbandonedPurges(tx)
      return repository.startDuePurges(tx)
    })
    const job = this.deps.purgeOrganizationJob()
    for (const purge of due) {
      const jobId = `purge-${purge.id}-${purge.attempt}`
      await this.deps.queues.enqueue(
        job,
        { orgId: purge.organizationId, purgeId: purge.id },
        { jobId },
      )
    }
    return due.length
  }

  /**
   * `purgeOrganization`: stored objects first (a failed run never leaves objects of a deleted
   * organization), then `purge_organization`, then the certificate. Any failure records `failed`
   * with its code; the next daily run starts it again.
   */
  async purgeOrganization(orgId: string, purgeId: string): Promise<void> {
    const repository = this.deps.dataRetentionRepository
    const purge = await this.deps.db.system('data-control', (tx) =>
      repository.findPurge(tx, purgeId),
    )
    if (purge?.status !== 'running' || purge.organizationId !== orgId) return
    try {
      await this.deps.storage.deletePrefix(`orgs/${orgId}/`)
    } catch (error) {
      await this.failPurge(purgeId, PURGE_ERROR_CODES.STORAGE_FAILED, error)
      return
    }
    let rowsDeleted
    try {
      rowsDeleted = await this.deps.db.system('data-control', (tx) =>
        repository.purgeOrganization(tx, orgId, purgeId),
      )
    } catch (error) {
      const code =
        sqlState(error) === FOREIGN_KEY_VIOLATION
          ? PURGE_ERROR_CODES.LEGAL_HOLD
          : PURGE_ERROR_CODES.DB_FAILED
      await this.failPurge(purgeId, code, error)
      return
    }
    const finishedAt = new Date()
    const certificate = createHash('sha256')
      .update(
        canonicalJson({
          purgeId,
          organizationId: orgId,
          reason: purge.reason,
          scheduledFor: purge.scheduledFor.toISOString(),
          finishedAt: finishedAt.toISOString(),
          rowsDeleted,
          objectsDeleted: null,
        }),
      )
      .digest()
    await this.deps.db.system('data-control', (tx) =>
      repository.finishPurge(tx, purgeId, {
        status: 'completed',
        finishedAt,
        certificateSha256: certificate,
        objectsDeleted: null, // the storage providers delete a prefix without counting it
      }),
    )
    this.deps.logger.info({ orgId, purgeId, rowsDeleted }, 'organization purged')
  }

  // ---- Private ------------------------------------------------------------------------------

  private async failPurge(purgeId: string, code: string, error: unknown): Promise<void> {
    this.deps.logger.error({ err: error, purgeId, code }, 'organization purge failed')
    await this.deps.db.system('data-control', (tx) =>
      this.deps.dataRetentionRepository.finishPurge(tx, purgeId, {
        status: 'failed',
        errorCode: code,
      }),
    )
  }

  /** Runs one batched statement until it deletes fewer rows than a batch. */
  private async loop(statement: (tx: DbExecutor) => Promise<number>): Promise<number> {
    let total = 0
    for (;;) {
      const removed = await this.deps.db.system('maintenance', statement)
      total += removed
      if (removed < CLEANUP_BATCH) return total
    }
  }

  /** Deletes the stored objects of expired rows, then applies `finish` to those rows. */
  private async expireObjects(
    list: (tx: DbExecutor) => Promise<ExpiredObject[]>,
    finish: (tx: DbExecutor, ids: readonly string[]) => Promise<void>,
  ): Promise<number> {
    let total = 0
    for (;;) {
      const rows = await this.deps.db.system('maintenance', list)
      for (const row of rows) {
        if (row.objectKey !== null) await this.deps.storage.delete(row.objectKey)
      }
      await this.deps.db.system('maintenance', (tx) =>
        finish(
          tx,
          rows.map((row) => row.id),
        ),
      )
      total += rows.length
      if (rows.length < CLEANUP_BATCH) return total
    }
  }
}
