// SPDX-License-Identifier: AGPL-3.0-only
import { z } from 'zod'

import { BadRequestError } from '@/core/errors/index.js'
import {
  notificationParamsSchema,
  type ListNotificationsQuery,
  type MarkAllReadResultDto,
  type NotificationDto,
  type UnreadCountDto,
  type UserRefDto,
} from '@surefy/contracts'

import {
  NotificationNotFoundError,
  NotificationsPersonRequiredError,
} from './notifications.errors.js'
import { toNotificationDto } from './notifications.mapper.js'

import type { SendEmailJob } from './notifications.jobs.js'
import type { NotificationRow, NotificationsRepository } from './notifications.repository.js'
import type { SendEmailPayload } from './notifications.schema.js'
import type { NotificationsContext, NotifyInput, UserRefLookup } from './notifications.types.js'
import type { Database } from '@/core/database/index.js'
import type { EnqueueOptions, Queues } from '@/core/queue/index.js'

interface NotificationsServiceDeps {
  db: Database
  queues: Queues
  notificationsRepository: NotificationsRepository
  sendEmailJob: SendEmailJob
  /** Resolves `actor`; until a lookup is wired every actor reads as null. */
  users?: UserRefLookup
}

const cursorSchema = z.object({ id: z.uuid() })

const encodeCursor = (row: NotificationRow): string =>
  Buffer.from(JSON.stringify({ id: row.id })).toString('base64url')

const decodeCursor = (cursor: string): string => {
  try {
    return cursorSchema.parse(JSON.parse(Buffer.from(cursor, 'base64url').toString('utf8'))).id
  } catch {
    throw new BadRequestError(undefined, 'Invalid cursor')
  }
}

const NO_ACTORS: ReadonlyMap<string, UserRefDto> = new Map()

/** The signed-in person: only they read or mark their notifications. */
const recipientOf = (ctx: NotificationsContext): string => {
  if (ctx.userId === null) throw new NotificationsPersonRequiredError()
  return ctx.userId
}

/**
 * In-app notifications of one member in one organization, and the entry point other modules use
 * to queue emails. Notifications are written after the producer's change commits.
 */
export class NotificationsService {
  constructor(private readonly deps: NotificationsServiceDeps) {}

  async list(
    ctx: NotificationsContext,
    query: ListNotificationsQuery,
  ): Promise<{ items: NotificationDto[]; nextCursor: string | null }> {
    const userId = recipientOf(ctx)
    const afterId = query.cursor === undefined ? undefined : decodeCursor(query.cursor)
    const { rows, hasMore } = await this.deps.db.tenant(ctx.orgId, (tx) =>
      this.deps.notificationsRepository.listPage(tx, ctx.orgId, userId, {
        limit: query.limit,
        unreadOnly: query.unreadOnly ?? false,
        ...(afterId === undefined ? {} : { afterId }),
      }),
    )
    const actors = await this.actorsOf(rows)
    const last = rows.at(-1)
    return {
      items: rows.map((row) => toNotificationDto(row, actors)),
      nextCursor: hasMore && last !== undefined ? encodeCursor(last) : null,
    }
  }

  async unreadCount(ctx: NotificationsContext): Promise<UnreadCountDto> {
    const userId = recipientOf(ctx)
    const count = await this.deps.db.tenant(ctx.orgId, (tx) =>
      this.deps.notificationsRepository.countUnread(tx, ctx.orgId, userId),
    )
    return { count }
  }

  /** Idempotent: an already read notification keeps its first `readAt`. */
  async markRead(ctx: NotificationsContext, notificationId: string): Promise<NotificationDto> {
    const userId = recipientOf(ctx)
    const row = await this.deps.db.tenant(ctx.orgId, (tx) =>
      this.deps.notificationsRepository.markRead(tx, ctx.orgId, userId, notificationId),
    )
    if (row === undefined) throw new NotificationNotFoundError()
    return toNotificationDto(row, await this.actorsOf([row]))
  }

  async markAllRead(ctx: NotificationsContext): Promise<MarkAllReadResultDto> {
    const userId = recipientOf(ctx)
    const affected = await this.deps.db.tenant(ctx.orgId, (tx) =>
      this.deps.notificationsRepository.markAllRead(tx, ctx.orgId, userId),
    )
    return { affected }
  }

  /**
   * Writes one in-app notification for a member of `ctx.orgId`. Producers call it after their own
   * change commits; the same `dedupeKey` for the same recipient writes nothing and returns null.
   */
  async notify(
    ctx: Pick<NotificationsContext, 'orgId'>,
    input: NotifyInput,
  ): Promise<NotificationDto | null> {
    const params = notificationParamsSchema.parse(input.params)
    const row = await this.deps.db.tenant(ctx.orgId, (tx) =>
      this.deps.notificationsRepository.insert(tx, {
        organizationId: ctx.orgId,
        userId: input.userId,
        type: input.type,
        params,
        targetType: input.target?.type ?? null,
        targetId: input.target?.id ?? null,
        actorUserId: input.actorUserId ?? null,
        dedupeKey: input.dedupeKey ?? null,
      }),
    )
    if (row === undefined) return null
    return toNotificationDto(row, await this.actorsOf([row]))
  }

  /**
   * Queues one email on the `email` queue; the worker renders and sends it. Call it after the
   * transaction that made the email necessary has committed. Returns the job ID.
   */
  queueEmail(payload: SendEmailPayload, options: EnqueueOptions = {}): Promise<string> {
    return this.deps.queues.enqueue(this.deps.sendEmailJob, payload, options)
  }

  private async actorsOf(
    rows: readonly NotificationRow[],
  ): Promise<ReadonlyMap<string, UserRefDto>> {
    const ids = [
      ...new Set(rows.flatMap((row) => (row.actorUserId === null ? [] : [row.actorUserId]))),
    ]
    if (ids.length === 0 || this.deps.users === undefined) return NO_ACTORS
    return this.deps.users.findUserRefs(ids)
  }
}
