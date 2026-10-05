// SPDX-License-Identifier: AGPL-3.0-only
import { randomUUID } from 'node:crypto'

import { eq, inArray, sql } from 'drizzle-orm'
import { describe, expect, it } from 'vitest'

import { QUEUES } from '@/constants/queues.js'
import {
  chatAttachments,
  chats,
  knowledgeBases,
  knowledgeDocuments,
  knowledgeSources,
  outboxEvents,
} from '@/database/tables/index.js'

import { setupTwoOrgs, type TwoOrgSetup } from '../../../../test/helpers/orgSetup.js'
import { createOutboxModule } from '../index.js'
import { OUTBOX_MAX_ATTEMPTS } from '../outbox.constants.js'

import type { Queues } from '@/core/queue/index.js'

const DAY_MS = 86_400_000
const daysAgo = (days: number) => new Date(Date.now() - days * DAY_MS)

/** A chat of Uma's in A with one stored attachment, soft-deleted `deletedDaysAgo` days ago. */
async function seedDeletedChat(setup: TwoOrgSetup, deletedDaysAgo: number) {
  const orgId = setup.a.id
  const chatId = randomUUID()
  const attachmentId = randomUUID()
  const objectKey = `orgs/${orgId}/chats/${chatId}/attachments/${attachmentId}`
  await setup.container.integrations.storage.put(objectKey, Buffer.from('bytes'), {
    contentType: 'text/plain',
  })
  await setup.db.tenant(orgId, async (tx) => {
    await tx.insert(chats).values({
      id: chatId,
      organizationId: orgId,
      ownerUserId: setup.a.members.uma.id,
      title: 'Old chat',
      deletedAt: daysAgo(deletedDaysAgo),
    })
    await tx.insert(chatAttachments).values({
      id: attachmentId,
      organizationId: orgId,
      chatId,
      objectKey,
      fileName: 'notes.txt',
      contentType: 'text/plain',
      sizeBytes: 5,
      kind: 'document',
    })
  })
  return { chatId, attachmentId, objectKey }
}

/** A base of A with one link source and one stored document; the base is soft-deleted. */
async function seedDeletedBase(setup: TwoOrgSetup, deletedDaysAgo: number) {
  const orgId = setup.a.id
  const baseId = randomUUID()
  const sourceId = randomUUID()
  const documentId = randomUUID()
  const keys = [
    `orgs/${orgId}/knowledge/${documentId}/source`,
    `orgs/${orgId}/knowledge/${documentId}/parsed.json`,
  ]
  for (const key of keys) {
    await setup.container.integrations.storage.put(key, Buffer.from('{}'), {
      contentType: 'application/json',
    })
  }
  const deletedAt = daysAgo(deletedDaysAgo)
  await setup.db.tenant(orgId, async (tx) => {
    await tx
      .insert(knowledgeBases)
      .values({ id: baseId, organizationId: orgId, name: `Base ${baseId}`, deletedAt })
    await tx.insert(knowledgeSources).values({
      id: sourceId,
      organizationId: orgId,
      knowledgeBaseId: baseId,
      type: 'link',
      name: 'Handbook',
      status: 'queued',
      deletedAt,
    })
    await tx.insert(knowledgeDocuments).values({
      id: documentId,
      organizationId: orgId,
      knowledgeBaseId: baseId,
      sourceId,
      externalRef: 'https://acme.test/handbook',
      title: 'Handbook',
      objectKey: keys[0],
      parsedObjectKey: keys[1],
    })
  })
  return { baseId, sourceId, documentId, keys }
}

const eventsOf = (setup: TwoOrgSetup, topic: string) =>
  setup.db.system('test', (tx) =>
    tx.select().from(outboxEvents).where(eq(outboxEvents.topic, topic)),
  )

const exists = async (setup: TwoOrgSetup, key: string) =>
  (await setup.container.integrations.storage.stat(key)) !== null

describe('outbox events', () => {
  it('writes events in the tenant transaction, validated and deduplicated', async () => {
    const setup = await setupTwoOrgs()
    const outbox = setup.container.modules.outbox.service
    const id = randomUUID()
    const event = {
      orgId: setup.a.id,
      topic: 'chat.purged' as const,
      payload: { version: 1 as const, id },
      dedupeKey: `chat.purged:${id}`,
    }
    expect(await setup.db.tenant(setup.a.id, (tx) => outbox.write(tx, event))).toBe(true)
    expect(await setup.db.tenant(setup.a.id, (tx) => outbox.write(tx, event))).toBe(false)
    expect(await eventsOf(setup, 'chat.purged')).toMatchObject([
      { organizationId: setup.a.id, status: 'pending', payload: { version: 1, id } },
    ])

    // a payload outside the topic's schema never reaches the table
    await expect(
      setup.db.tenant(setup.a.id, (tx) =>
        outbox.write(tx, { ...event, dedupeKey: undefined, payload: { version: 1, id: 'nope' } }),
      ),
    ).rejects.toThrow()
    // a tenant cannot write an event of another organization (RLS owned-or-system)
    await expect(
      setup.db.tenant(setup.a.id, (tx) =>
        outbox.write(tx, { ...event, orgId: setup.b.id, dedupeKey: undefined }),
      ),
    ).rejects.toThrow()
  })

  it('relays due events to the outbox queue once, and backs off when the enqueue fails', async () => {
    const setup = await setupTwoOrgs()
    const { container } = setup
    const outbox = container.modules.outbox.service
    const write = (id: string) =>
      setup.db.tenant(setup.a.id, async (tx) => {
        await outbox.write(tx, {
          orgId: setup.a.id,
          topic: 'chat.purged',
          payload: { version: 1, id },
        })
      })
    const first = randomUUID()
    await write(first)

    expect(await outbox.relay()).toMatchObject({ dispatched: 1, retried: 0, failed: 0 })
    const [row] = await eventsOf(setup, 'chat.purged')
    expect(row).toMatchObject({ status: 'dispatched' })
    expect(row?.dispatchedAt).toBeInstanceOf(Date)
    const job = await container.queues.get(QUEUES.OUTBOX).getJob(`outbox-${row?.id ?? ''}`)
    expect(job?.name).toBe('deliverOutboxEvent')
    expect(job?.data).toEqual({
      eventId: row?.id,
      orgId: setup.a.id,
      topic: 'chat.purged',
      payload: { version: 1, id: first },
    })
    // nothing left to relay
    expect(await outbox.relay()).toMatchObject({ dispatched: 0 })

    // a failing queue: the row stays pending with a later available_at, then fails for good
    const broken: Queues = {
      ...container.queues,
      enqueue: () => Promise.reject(new Error('redis down')),
    }
    const failing = createOutboxModule({
      db: container.db,
      queues: broken,
      logger: container.logger,
      handlers: [],
      hooks: { outboxHandlers: () => [] },
    }).service
    const second = randomUUID()
    await write(second)
    expect(await failing.relay()).toMatchObject({ dispatched: 0, retried: 1 })
    const retried = (await eventsOf(setup, 'chat.purged')).find(
      (event) => event.payload.id === second,
    )
    expect(retried).toMatchObject({
      status: 'pending',
      attempts: 1,
      lastError: 'Error: redis down',
    })
    expect(retried?.availableAt.getTime()).toBeGreaterThan(Date.now())

    await setup.db.system('test', (tx) =>
      tx
        .update(outboxEvents)
        .set({ attempts: OUTBOX_MAX_ATTEMPTS - 1, availableAt: new Date(0) })
        .where(eq(outboxEvents.id, retried?.id ?? '')),
    )
    expect(await failing.relay()).toMatchObject({ failed: 1 })
    const [failed] = await setup.db.system('test', (tx) =>
      tx
        .select()
        .from(outboxEvents)
        .where(eq(outboxEvents.id, retried?.id ?? '')),
    )
    expect(failed).toMatchObject({ status: 'failed', attempts: OUTBOX_MAX_ATTEMPTS })
  })

  it('delivers an event to the core handlers and the extensions’ handlers', async () => {
    const setup = await setupTwoOrgs()
    const seen: string[] = []
    setup.container.hooks.onEvent('chat.purged', (delivery) => {
      seen.push(delivery.payload.id)
      return Promise.resolve()
    })
    const { chatId, objectKey } = await seedDeletedChat(setup, 0)
    await setup.container.modules.outbox.service.deliver({
      eventId: randomUUID(),
      orgId: setup.a.id,
      topic: 'chat.purged',
      payload: { version: 1, id: chatId },
    })
    expect(await exists(setup, objectKey)).toBe(false)
    expect(seen).toEqual([chatId])

    await expect(
      setup.container.modules.outbox.service.deliver({
        eventId: randomUUID(),
        orgId: setup.a.id,
        topic: 'chat.purged',
        payload: { version: 1 },
      }),
    ).rejects.toThrow('invalid payload')
  })
})

describe('purge_soft_deleted', () => {
  it('purges rows past the restore window and removes their stored files', async () => {
    const setup = await setupTwoOrgs()
    const { container } = setup
    const old = await seedDeletedChat(setup, 31)
    const recent = await seedDeletedChat(setup, 2)
    const base = await seedDeletedBase(setup, 31)

    expect(await container.modules.dataControl.retention.purgeSoftDeleted()).toEqual({
      chats: 1,
      knowledge_sources: 1,
      knowledge_bases: 1,
    })

    // rows: the old chat and its attachment are gone, the recent one stays for its restore window
    const remaining = await setup.db.system('test', (tx) =>
      tx
        .select({ id: chats.id })
        .from(chats)
        .where(inArray(chats.id, [old.chatId, recent.chatId])),
    )
    expect(remaining).toEqual([{ id: recent.chatId }])
    const documents = await setup.db.system('test', (tx) =>
      tx.select().from(knowledgeDocuments).where(eq(knowledgeDocuments.id, base.documentId)),
    )
    expect(documents).toEqual([])

    // events: ids only, the knowledge ones with the documents listed before the delete
    expect(await eventsOf(setup, 'chat.purged')).toMatchObject([
      {
        organizationId: setup.a.id,
        payload: { version: 1, id: old.chatId },
        dedupeKey: `chat.purged:${old.chatId}`,
      },
    ])
    expect(await eventsOf(setup, 'knowledge_source.purged')).toMatchObject([
      { payload: { version: 1, id: base.sourceId, documentIds: [base.documentId] } },
    ])
    expect(await eventsOf(setup, 'knowledge_base.purged')).toMatchObject([
      { payload: { version: 1, id: base.baseId, documentIds: [] } },
    ])

    // the relay hands them to the queue; delivering them removes the stored files
    expect(await container.modules.outbox.service.relay()).toMatchObject({ dispatched: 3 })
    const jobs = await container.queues.get(QUEUES.OUTBOX).getJobs(['waiting'])
    for (const job of jobs) {
      await container.modules.outbox.service.deliver(
        job.data as Parameters<typeof container.modules.outbox.service.deliver>[0],
      )
    }
    expect(await exists(setup, old.objectKey)).toBe(false)
    expect(await exists(setup, recent.objectKey)).toBe(true)
    for (const key of base.keys) expect(await exists(setup, key)).toBe(false)

    // a second run finds nothing
    expect(await container.modules.dataControl.retention.purgeSoftDeleted()).toEqual({
      chats: 0,
      knowledge_sources: 0,
      knowledge_bases: 0,
    })
  })

  it('refuses a table that is not soft-deleted and a cutoff inside the window', async () => {
    const setup = await setupTwoOrgs()
    // drizzle wraps the database error; the function's message is its cause
    const call = (table: string, before: Date) =>
      setup.db
        .system('test', (tx) =>
          tx.execute(
            sql`select * from purge_soft_deleted(${table}::regclass, ${before.toISOString()}::timestamptz)`,
          ),
        )
        .then(
          () => 'purged',
          (error: unknown) => (error instanceof Error ? String(error.cause) : String(error)),
        )
    expect(await call('organizations', daysAgo(40))).toMatch(/not a soft-delete table/)
    expect(await call('chats', daysAgo(1))).toMatch(/inside the restore window/)
  })

  it('removes dispatched events after 7 days and failed ones after 30 in the daily cleanup', async () => {
    const setup = await setupTwoOrgs()
    const ids = await setup.db.system('test', async (tx) => {
      const rows = await tx
        .insert(outboxEvents)
        .values(
          (['dispatched', 'dispatched', 'failed', 'failed'] as const).map((status) => ({
            organizationId: setup.a.id,
            topic: 'chat.purged',
            payload: { version: 1, id: randomUUID() },
            status,
          })),
        )
        .returning({ id: outboxEvents.id })
      return rows.map((row) => row.id)
    })
    const [oldDispatched, newDispatched, oldFailed, newFailed] = ids
    await setup.db.system('test', (tx) =>
      tx.execute(sql`
        update outbox_events set updated_at = case id
          when ${oldDispatched}::uuid then now() - interval '8 days'
          when ${newDispatched}::uuid then now() - interval '6 days'
          when ${oldFailed}::uuid then now() - interval '31 days'
          else now() - interval '29 days' end
        where id = any(${sql.param(ids)}::uuid[])`),
    )
    const removed = await setup.container.modules.dataControl.retention.cleanup()
    expect(removed.outboxEvents).toBe(2)
    const left = await setup.db.system('test', (tx) =>
      tx.select({ id: outboxEvents.id }).from(outboxEvents).where(inArray(outboxEvents.id, ids)),
    )
    expect(left.map((row) => row.id)).toEqual(expect.arrayContaining([newDispatched, newFailed]))
    expect(left).toHaveLength(2)
  })
})
