// SPDX-License-Identifier: AGPL-3.0-only
import { and, eq, inArray, lte, sql } from 'drizzle-orm'

import { dataRequests, organizationPurges } from '@/database/tables/index.js'

import type { DbExecutor } from '@/core/database/index.js'
import type { OrganizationPurgeStatus, PurgeCounts } from '@/database/tables/index.js'

export type OrganizationPurgeRow = typeof organizationPurges.$inferSelect

/** A stored file whose row expired: delete the object, then mark the row. */
export interface ExpiredObject {
  organizationId: string
  id: string
  objectKey: string | null
}

const count = (result: { rowCount: number | null }): number => result.rowCount ?? 0

/**
 * The retention and purge statements of the `maintenance` and `data-control` queues
 * (conventions-and-security.md, §9). They run under `db.system` (Better Auth tables through
 * `db.global`), delete in batches and touch other modules' tables only to apply their retention.
 */
export class DataRetentionRepository {
  /** Notifications older than the retention (notifications_created_at_idx). */
  async deleteOldNotifications(tx: DbExecutor, days: number, limit: number): Promise<number> {
    return count(
      await tx.execute(sql`
        delete from notifications where id in (
          select id from notifications
          where created_at < now() - make_interval(days => ${days}) limit ${limit})`),
    )
  }

  /** Invitations resolved (accepted, revoked or expired) longer ago than the retention. */
  async deleteResolvedInvitations(tx: DbExecutor, days: number, limit: number): Promise<number> {
    return count(
      await tx.execute(sql`
        delete from invitations where id in (
          select id from invitations
          where coalesce(accepted_at, revoked_at, expires_at) < now() - make_interval(days => ${days})
            and (status <> 'pending' or expires_at < now())
          limit ${limit})`),
    )
  }

  /** Retired slugs that no longer redirect. */
  async deleteExpiredSlugHistory(tx: DbExecutor, limit: number): Promise<number> {
    return count(
      await tx.execute(sql`
        delete from organization_slug_history where id in (
          select id from organization_slug_history where redirect_until < now() limit ${limit})`),
    )
  }

  /** Dispatched outbox events and failed ones past their retention (outbox_events_cleanup_idx). */
  async deleteOldOutboxEvents(
    tx: DbExecutor,
    dispatchedDays: number,
    failedDays: number,
    limit: number,
  ): Promise<number> {
    return count(
      await tx.execute(sql`
        delete from outbox_events where id in (
          select id from outbox_events
          where (status = 'dispatched' and updated_at < now() - make_interval(days => ${dispatchedDays}))
             or (status = 'failed' and updated_at < now() - make_interval(days => ${failedDays}))
          limit ${limit})`),
    )
  }

  /** Sessions and verification links expired longer ago than the grace (`db.global`). */
  async deleteExpiredAuthRows(executor: DbExecutor, days: number, limit: number): Promise<number> {
    const sessions = count(
      await executor.execute(sql`
        delete from sessions where id in (
          select id from sessions
          where expires_at < now() - make_interval(days => ${days}) limit ${limit})`),
    )
    const verifications = count(
      await executor.execute(sql`
        delete from verifications where id in (
          select id from verifications
          where expires_at < now() - make_interval(days => ${days}) limit ${limit})`),
    )
    return sessions + verifications
  }

  /** Ready export files past their expiry (exports_expires_at_idx). */
  async listExpiredExports(tx: DbExecutor, limit: number): Promise<ExpiredObject[]> {
    const result = await tx.execute<{
      organization_id: string
      id: string
      object_key: string | null
    }>(
      sql`select organization_id, id, object_key from exports
          where status = 'ready' and expires_at < now() order by expires_at limit ${limit}`,
    )
    return result.rows.map((row) => ({
      organizationId: row.organization_id,
      id: row.id,
      objectKey: row.object_key,
    }))
  }

  async markExportsExpired(tx: DbExecutor, ids: readonly string[]): Promise<void> {
    if (ids.length === 0) return
    await tx.execute(sql`
      update exports set status = 'expired', object_key = null, updated_at = now()
      where id = any(${sql.param([...ids])}::uuid[]) and status = 'ready'`)
  }

  /** Export rows past their 30 days, whatever their state (exports_cleanup_idx). */
  async listOldExports(tx: DbExecutor, days: number, limit: number): Promise<ExpiredObject[]> {
    const result = await tx.execute<{
      organization_id: string
      id: string
      object_key: string | null
    }>(
      sql`select organization_id, id, object_key from exports
          where created_at < now() - make_interval(days => ${days}) order by created_at limit ${limit}`,
    )
    return result.rows.map((row) => ({
      organizationId: row.organization_id,
      id: row.id,
      objectKey: row.object_key,
    }))
  }

  async deleteExports(tx: DbExecutor, ids: readonly string[]): Promise<void> {
    if (ids.length === 0) return
    await tx.execute(sql`delete from exports where id = any(${sql.param([...ids])}::uuid[])`)
  }

  /** Full-export archives past their expiry, downloaded or not. */
  async listExpiredArchives(tx: DbExecutor, limit: number): Promise<ExpiredObject[]> {
    const rows = await tx
      .select({
        organizationId: dataRequests.organizationId,
        id: dataRequests.id,
        objectKey: dataRequests.objectKey,
      })
      .from(dataRequests)
      .where(
        and(
          eq(dataRequests.type, 'export'),
          inArray(dataRequests.status, ['ready', 'delivered']),
          lte(dataRequests.expiresAt, new Date()),
        ),
      )
      .limit(limit)
    return rows
  }

  async markArchivesExpired(tx: DbExecutor, ids: readonly string[]): Promise<void> {
    if (ids.length === 0) return
    await tx
      .update(dataRequests)
      .set({ status: 'expired', objectKey: null })
      .where(
        and(
          inArray(dataRequests.id, [...ids]),
          inArray(dataRequests.status, ['ready', 'delivered']),
        ),
      )
  }

  /**
   * `purge_soft_deleted(table, before, null, limit)`: deletes up to `limit` rows soft-deleted
   * before the window and writes their `*.purged` outbox events. Returns how many it deleted.
   */
  async purgeSoftDeleted(
    tx: DbExecutor,
    table: string,
    windowDays: number,
    limit: number,
  ): Promise<number> {
    return count(
      await tx.execute(sql`
        select organization_id, id from purge_soft_deleted(
          ${table}::regclass, now() - make_interval(days => ${windowDays}), null, ${limit}::integer)`),
    )
  }

  /** `ensure_partitions(parent, months)`: partitions created, rows sitting in the default one. */
  async ensurePartitions(
    tx: DbExecutor,
    table: string,
    monthsAhead: number,
  ): Promise<{ created: number; defaultRows: number }> {
    const result = await tx.execute<{ created: number; default_rows: string }>(
      sql`select created, default_rows from ensure_partitions(${table}::regclass, ${monthsAhead}::integer)`,
    )
    const row = result.rows[0]
    return { created: row?.created ?? 0, defaultRows: Number(row?.default_rows ?? 0) }
  }

  /** `drop_expired_partitions(parent, keep)`: the dropped partitions' names. */
  async dropExpiredPartitions(tx: DbExecutor, table: string, keep: string): Promise<string[]> {
    const result = await tx.execute<{ name: string }>(
      sql`select drop_expired_partitions(${table}::regclass, ${keep}::interval) as name`,
    )
    return result.rows.map((row) => row.name)
  }

  // ---- Organization purges (system scope) ---------------------------------------------------

  /**
   * Records a scheduled purge for every organization in its deletion hold that has none yet
   * (scheduled, running or failed), and links it from the deletion request. Returns how many.
   */
  async recordScheduledPurges(tx: DbExecutor): Promise<number> {
    const result = await tx.execute(sql`
      with inserted as (
        insert into organization_purges
          (organization_id, reason, status, data_request_id, requested_by_user_id, scheduled_for)
        select o.id, 'owner_request', 'scheduled', d.id, o.deletion_requested_by_user_id,
          o.deletion_scheduled_for
        from organizations o
        left join data_requests d
          on d.organization_id = o.id and d.type = 'deletion' and d.status in ('requested', 'scheduled')
        where o.status = 'deletion_scheduled'
          and not exists (
            select 1 from organization_purges p
            where p.organization_id = o.id and p.status in ('scheduled', 'running', 'failed'))
        returning id, organization_id, data_request_id
      )
      update data_requests d set organization_purge_id = i.id, updated_at = now()
      from inserted i
      where d.organization_id = i.organization_id and d.id = i.data_request_id`)
    return count(result)
  }

  /** Purges whose organization left its hold (deletion canceled) are canceled too. */
  async cancelAbandonedPurges(tx: DbExecutor): Promise<number> {
    return count(
      await tx.execute(sql`
        update organization_purges p
        set status = 'canceled', canceled_at = now(), updated_at = now()
        where p.status in ('scheduled', 'failed')
          and not exists (
            select 1 from organizations o
            where o.id = p.organization_id and o.status = 'deletion_scheduled')`),
    )
  }

  /** Due purges (organization_purges_due_idx, and failed ones again): set `running`. */
  async startDuePurges(tx: DbExecutor): Promise<OrganizationPurgeRow[]> {
    return tx
      .update(organizationPurges)
      .set({
        status: 'running',
        attempt: sql`${organizationPurges.attempt} + 1`,
        startedAt: new Date(),
        errorCode: null,
      })
      .where(
        and(
          inArray(organizationPurges.status, ['scheduled', 'failed']),
          lte(organizationPurges.scheduledFor, new Date()),
          sql`exists (select 1 from organizations o where o.id = ${organizationPurges.organizationId}
            and o.status = 'deletion_scheduled' and o.deletion_scheduled_for <= now())`,
        ),
      )
      .returning()
  }

  async findPurge(tx: DbExecutor, id: string): Promise<OrganizationPurgeRow | undefined> {
    const [row] = await tx.select().from(organizationPurges).where(eq(organizationPurges.id, id))
    return row
  }

  /** `purge_organization`: deletes the organization's rows; returns the counts it recorded. */
  async purgeOrganization(tx: DbExecutor, orgId: string, purgeId: string): Promise<PurgeCounts> {
    const result = await tx.execute<{ counts: PurgeCounts }>(
      sql`select purge_organization(${orgId}::uuid, ${purgeId}::uuid) as counts`,
    )
    const counts = result.rows[0]?.counts
    if (counts === undefined) throw new Error('purge_organization returned no counts')
    return counts
  }

  async finishPurge(
    tx: DbExecutor,
    id: string,
    patch: {
      status: OrganizationPurgeStatus
      errorCode?: string | null
      objectsDeleted?: number | null
      certificateSha256?: Buffer | null
      finishedAt?: Date | null
    },
  ): Promise<void> {
    await tx.update(organizationPurges).set(patch).where(eq(organizationPurges.id, id))
  }
}
