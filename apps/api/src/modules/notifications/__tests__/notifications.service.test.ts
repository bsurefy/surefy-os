// SPDX-License-Identifier: AGPL-3.0-only
import { describe, expect, it, vi } from 'vitest'

import { BadRequestError } from '@/core/errors/index.js'

import {
  NotificationNotFoundError,
  NotificationsPersonRequiredError,
} from '../notifications.errors.js'
import { NotificationsService } from '../notifications.service.js'

import type { SendEmailJob } from '../notifications.jobs.js'
import type { NotificationRow, NotificationsRepository } from '../notifications.repository.js'
import type { Database } from '@/core/database/index.js'
import type { Queues } from '@/core/queue/index.js'

const orgId = '0199b2c4-0000-7000-8000-00000000000a'
const userId = '0199b2c4-0000-7000-8000-00000000000b'
const actorId = '0199b2c4-0000-7000-8000-00000000000c'
const member = { orgId, userId }
const apiKey = { orgId, userId: null }

const row = (overrides: Partial<NotificationRow> = {}): NotificationRow => ({
  id: '0199b2c4-0000-7000-8000-000000000001',
  organizationId: orgId,
  userId,
  type: 'export.ready',
  params: { version: 1 },
  targetType: 'export',
  targetId: '0199b2c4-0000-7000-8000-000000000002',
  actorUserId: null,
  dedupeKey: null,
  readAt: null,
  emailedAt: null,
  createdAt: new Date('2026-10-01T10:00:00.000Z'),
  updatedAt: new Date('2026-10-01T10:00:00.000Z'),
  ...overrides,
})

const setup = (repository: Partial<NotificationsRepository> = {}) => {
  const db = { tenant: (_orgId: string, fn: (tx: unknown) => Promise<unknown>) => fn({}) }
  const queues = { enqueue: vi.fn(() => Promise.resolve('job-1')) }
  const users = {
    findUserRefs: vi.fn((ids: readonly string[]) =>
      Promise.resolve(
        new Map(
          ids.map((id) => [id, { id, name: 'Maya', email: 'maya@example.test', imageUrl: null }]),
        ),
      ),
    ),
  }
  const sendEmailJob = { name: 'sendEmail' } as unknown as SendEmailJob
  const service = new NotificationsService({
    db: db as unknown as Database,
    queues: queues as unknown as Queues,
    notificationsRepository: repository as NotificationsRepository,
    sendEmailJob,
    users,
  })
  return { service, queues, users, sendEmailJob }
}

describe('NotificationsService', () => {
  it('serves notifications to people only, never to API keys', async () => {
    const { service } = setup()
    await expect(service.list(apiKey, { limit: 25 })).rejects.toBeInstanceOf(
      NotificationsPersonRequiredError,
    )
    await expect(service.unreadCount(apiKey)).rejects.toBeInstanceOf(
      NotificationsPersonRequiredError,
    )
    await expect(service.markRead(apiKey, row().id)).rejects.toBeInstanceOf(
      NotificationsPersonRequiredError,
    )
    await expect(service.markAllRead(apiKey)).rejects.toBeInstanceOf(
      NotificationsPersonRequiredError,
    )
  })

  it('refuses a cursor it did not issue', async () => {
    const { service } = setup({ listPage: vi.fn() })
    await expect(
      service.list(member, { limit: 25, cursor: 'not-a-cursor' }),
    ).rejects.toBeInstanceOf(BadRequestError)
  })

  it('returns a cursor only when there is a next page, and resolves actors in one call', async () => {
    const rows = [
      row({ actorUserId: actorId }),
      row({ id: '0199b2c4-0000-7000-8000-000000000003', actorUserId: actorId }),
    ]
    const listPage = vi.fn(() => Promise.resolve({ rows, hasMore: true }))
    const { service, users } = setup({ listPage })
    const page = await service.list(member, { limit: 2, unreadOnly: true })
    expect(page.items.map((item) => item.actor?.name)).toEqual(['Maya', 'Maya'])
    expect(users.findUserRefs).toHaveBeenCalledExactlyOnceWith([actorId])
    expect(page.nextCursor).not.toBeNull()

    await service.list(member, { limit: 2, cursor: page.nextCursor ?? '' })
    expect(listPage).toHaveBeenLastCalledWith({}, orgId, userId, {
      limit: 2,
      unreadOnly: false,
      afterId: rows[1]?.id,
    })

    listPage.mockResolvedValueOnce({ rows, hasMore: false })
    expect((await service.list(member, { limit: 2 })).nextCursor).toBeNull()
  })

  it('answers not found when the notification is not the member’s', async () => {
    const { service } = setup({ markRead: vi.fn(() => Promise.resolve(undefined)) })
    await expect(service.markRead(member, row().id)).rejects.toBeInstanceOf(
      NotificationNotFoundError,
    )
  })

  it('validates params and returns null for a duplicate dedupe key', async () => {
    const insert = vi.fn(() => Promise.resolve(undefined))
    const { service } = setup({ insert })
    const input = {
      userId,
      type: 'export.ready' as const,
      params: { version: 1 as const },
      dedupeKey: 'export-1',
    }
    await expect(service.notify({ orgId }, input)).resolves.toBeNull()
    await expect(
      service.notify(
        { orgId },
        { ...input, params: { version: 2 } as unknown as typeof input.params },
      ),
    ).rejects.toThrow()
    expect(insert).toHaveBeenCalledOnce()
  })

  it('queues emails on the sendEmail job with the caller’s job ID', async () => {
    const { service, queues, sendEmailJob } = setup()
    const payload = {
      template: 'verifyEmail' as const,
      to: 'a@example.test',
      url: 'https://app.example.test/v',
    }
    await expect(service.queueEmail(payload, { jobId: 'verify-1' })).resolves.toBe('job-1')
    expect(queues.enqueue).toHaveBeenCalledExactlyOnceWith(sendEmailJob, payload, {
      jobId: 'verify-1',
    })
  })
})
