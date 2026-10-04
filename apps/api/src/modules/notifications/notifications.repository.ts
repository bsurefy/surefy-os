// SPDX-License-Identifier: AGPL-3.0-only
import { and, asc, count, desc, eq, isNull, sql } from 'drizzle-orm'

import { notifications } from '@/database/tables/index.js'

import type { DbExecutor } from '@/core/database/index.js'

export type NotificationRow = typeof notifications.$inferSelect
export type NewNotificationRow = typeof notifications.$inferInsert

export interface NotificationPageParams {
  limit: number
  /** The id of the last row of the previous page. */
  afterId?: string
  unreadOnly: boolean
}

/** Every query filters by organization and recipient; RLS adds the organization again. */
export class NotificationsRepository {
  /**
   * The feed, newest first, on `notifications_user_feed_idx`. The cursor row's own `created_at`
   * is read in SQL, so the microseconds a JavaScript date would drop never shift a page.
   */
  async listPage(tx: DbExecutor, orgId: string, userId: string, page: NotificationPageParams) {
    const t = notifications
    const cursorCreatedAt =
      page.afterId === undefined
        ? undefined
        : sql`(select c.created_at from notifications c where c.organization_id = ${orgId} and c.id = ${page.afterId})`
    const rows = await tx
      .select()
      .from(t)
      .where(
        and(
          eq(t.organizationId, orgId),
          eq(t.userId, userId),
          page.unreadOnly ? isNull(t.readAt) : undefined,
          cursorCreatedAt === undefined
            ? undefined
            : sql`(${t.createdAt} < ${cursorCreatedAt} or (${t.createdAt} = ${cursorCreatedAt} and ${t.id} > ${page.afterId}))`,
        ),
      )
      .orderBy(desc(t.createdAt), asc(t.id))
      .limit(page.limit + 1)
    return { rows: rows.slice(0, page.limit), hasMore: rows.length > page.limit }
  }

  findById(tx: DbExecutor, orgId: string, userId: string, notificationId: string) {
    return tx.query.notifications.findFirst({
      where: and(
        eq(notifications.organizationId, orgId),
        eq(notifications.userId, userId),
        eq(notifications.id, notificationId),
      ),
    })
  }

  /** On `notifications_unread_idx`. */
  async countUnread(tx: DbExecutor, orgId: string, userId: string): Promise<number> {
    const [row] = await tx
      .select({ n: count() })
      .from(notifications)
      .where(
        and(
          eq(notifications.organizationId, orgId),
          eq(notifications.userId, userId),
          isNull(notifications.readAt),
        ),
      )
    return row?.n ?? 0
  }

  /** Keeps the first `read_at`; returns undefined when the row is not the recipient's. */
  async markRead(tx: DbExecutor, orgId: string, userId: string, notificationId: string) {
    const [row] = await tx
      .update(notifications)
      .set({ readAt: sql`coalesce(${notifications.readAt}, now())` })
      .where(
        and(
          eq(notifications.organizationId, orgId),
          eq(notifications.userId, userId),
          eq(notifications.id, notificationId),
        ),
      )
      .returning()
    return row
  }

  /** One `UPDATE … WHERE read_at is null` on the unread index; returns the rows changed. */
  async markAllRead(tx: DbExecutor, orgId: string, userId: string): Promise<number> {
    const rows = await tx
      .update(notifications)
      .set({ readAt: sql`now()` })
      .where(
        and(
          eq(notifications.organizationId, orgId),
          eq(notifications.userId, userId),
          isNull(notifications.readAt),
        ),
      )
      .returning({ id: notifications.id })
    return rows.length
  }

  /** Returns undefined when the recipient already has a row with the same `dedupe_key`. */
  async insert(tx: DbExecutor, values: NewNotificationRow) {
    const [row] = await tx.insert(notifications).values(values).onConflictDoNothing().returning()
    return row
  }
}
