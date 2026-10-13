// SPDX-License-Identifier: AGPL-3.0-only
import { and, eq, sql } from 'drizzle-orm'
import { describe, expect, it } from 'vitest'

import {
  approvalAssignees,
  approvals,
  auditLogs,
  notifications,
  outboxEvents,
} from '@/database/tables/index.js'
import { APPROVALS_ERROR_CODES, approvalDetailDtoSchema } from '@surefy/contracts'

import { bridgePayload, setupApprovals, type ApprovalsSetup } from './approvalsTestKit.js'
import { expectData, expectError } from '../../../../test/helpers/request.js'

const rowOf = async (setup: ApprovalsSetup, id: string) => {
  const [row] = await setup.db.tenant(setup.a.id, (tx) =>
    tx.select().from(approvals).where(eq(approvals.id, id)),
  )
  return row
}

const eventsOf = async (setup: ApprovalsSetup, topic: string) =>
  setup.db.system('test', (tx) =>
    tx
      .select()
      .from(outboxEvents)
      .where(and(eq(outboxEvents.organizationId, setup.a.id), eq(outboxEvents.topic, topic))),
  )

const auditOf = async (setup: ApprovalsSetup, action: string) =>
  setup.db.system('test', (tx) =>
    tx
      .select()
      .from(auditLogs)
      .where(and(eq(auditLogs.organizationId, setup.a.id), eq(auditLogs.action, action))),
  )

/** The 30 minute wait ran out one minute ago: the approval was created 31 minutes ago. */
const runOut = (setup: ApprovalsSetup, id: string) =>
  setup.ownerSql(sql`update approvals
    set created_at = now() - interval '31 minutes', expires_at = now() - interval '1 minute'
    where id = ${id}`)

describe('approval timeouts', () => {
  it('expires an approval whose wait ran out and tells the run', async () => {
    const setup = await setupApprovals()
    const rejecting = await setup.seed({ waitMinutes: 30, timeoutAction: 'reject' })
    const continuing = await setup.seed({ waitMinutes: 30, timeoutAction: 'continue' })
    const waiting = await setup.seed({ waitMinutes: 30, timeoutAction: 'reject' })
    const forever = await setup.seed()
    await runOut(setup, rejecting)
    await runOut(setup, continuing)

    const run = await setup.container.modules.approvals.timeouts.run()
    expect(run).toMatchObject({ due: 2, expired: 2, escalated: 0, failed: 0 })

    expect(await rowOf(setup, rejecting)).toMatchObject({
      status: 'expired',
      resolvedBy: 'timeout',
      timeoutAction: 'reject',
    })
    expect(await rowOf(setup, continuing)).toMatchObject({
      status: 'expired',
      resolvedBy: 'timeout',
      timeoutAction: 'continue',
    })
    expect((await rowOf(setup, waiting))?.status).toBe('pending')
    expect((await rowOf(setup, forever))?.status).toBe('pending')
    expect(await eventsOf(setup, 'approval.expired')).toHaveLength(2)
    expect(await auditOf(setup, 'approval.expired')).toHaveLength(2)

    // a second run finds nothing, and writes nothing again
    expect(await setup.container.modules.approvals.timeouts.run()).toMatchObject({ due: 0 })
    expect(await eventsOf(setup, 'approval.expired')).toHaveLength(2)
  })

  it('answers "expired" to a person once the timeout acted', async () => {
    const setup = await setupApprovals()
    const id = await setup.seed({ waitMinutes: 30, timeoutAction: 'reject' })
    await runOut(setup, id)
    await setup.container.modules.approvals.timeouts.run()
    expectError(
      await setup.call('uma', 'POST', `/${id}/approve`, {}),
      409,
      APPROVALS_ERROR_CODES.APPROVAL_EXPIRED,
    )
  })

  it('escalates once: stays pending, adds the escalation approvers and waits again', async () => {
    const setup = await setupApprovals()
    const id = await setup.seed({ waitMinutes: 30, timeoutAction: 'escalate' })
    await runOut(setup, id)

    expect(await setup.container.modules.approvals.timeouts.run()).toMatchObject({
      due: 1,
      escalated: 1,
      expired: 0,
    })
    const row = await rowOf(setup, id)
    expect(row?.status).toBe('pending')
    expect(row?.escalatedAt).not.toBeNull()
    expect(row?.expiresAt?.getTime()).toBeGreaterThan(Date.now() + 25 * 60_000)
    const assignees = await setup.db.tenant(setup.a.id, (tx) =>
      tx.select().from(approvalAssignees).where(eq(approvalAssignees.approvalId, id)),
    )
    expect(assignees).toHaveLength(2)
    expect(assignees.filter((a) => a.source === 'escalation').map((a) => a.role)).toEqual(['admin'])
    expect(await eventsOf(setup, 'approval.escalated')).toHaveLength(1)
    expect(await auditOf(setup, 'approval.escalated')).toHaveLength(1)

    // an Admin can now decide it
    expectData(await setup.call('adam', 'POST', `/${id}/approve`, {}), 200, approvalDetailDtoSchema)
  })

  it('treats a second timeout of an escalated approval as a rejection', async () => {
    const setup = await setupApprovals()
    const id = await setup.seed({ waitMinutes: 30, timeoutAction: 'escalate' })
    await runOut(setup, id)
    await setup.container.modules.approvals.timeouts.run()
    await runOut(setup, id)
    expect(await setup.container.modules.approvals.timeouts.run()).toMatchObject({
      expired: 1,
      escalated: 0,
    })
    expect(await rowOf(setup, id)).toMatchObject({ status: 'expired', resolvedBy: 'timeout' })
    expect(JSON.stringify((await auditOf(setup, 'approval.expired'))[0])).toContain('"reject"')
  })

  it('leaves an approval a person decided at the same moment', async () => {
    const setup = await setupApprovals()
    const id = await setup.seed({ waitMinutes: 30, timeoutAction: 'reject' })
    // decided, then its wait is made to look over: the sweeper's predicate no longer matches
    expectData(await setup.call('uma', 'POST', `/${id}/approve`, {}), 200, approvalDetailDtoSchema)
    await runOut(setup, id)
    expect(await setup.container.modules.approvals.timeouts.run()).toMatchObject({ due: 0 })
    expect((await rowOf(setup, id))?.status).toBe('approved')
    expect(await eventsOf(setup, 'approval.expired')).toHaveLength(0)
  })

  it('works through every organization in one run', async () => {
    const setup = await setupApprovals()
    const id = await setup.seed({ waitMinutes: 30, timeoutAction: 'reject' })
    await runOut(setup, id)
    const other = await setup.db.tenant(setup.b.id, (tx) =>
      setup.container.modules.approvals.service.create(
        tx,
        {
          orgId: setup.b.id,
          userId: null,
          via: 'system',
          teamIds: [],
          access: { permissions: [] },
        },
        {
          kind: 'bridge_install',
          title: 'Install',
          payload: bridgePayload(),
          waitMinutes: 10,
          timeoutAction: 'reject',
        },
      ),
    )
    await setup.ownerSql(
      sql`update approvals set expires_at = now() - interval '1 minute' where id = ${other.id}`,
    )
    expect(await setup.container.modules.approvals.timeouts.run()).toMatchObject({
      due: 2,
      expired: 2,
    })
  })
})

describe('approval notifications', () => {
  const handler = (setup: ApprovalsSetup, topic: string) => {
    const found = setup.container.modules.approvals.outboxHandlers.find((h) => h.topic === topic)
    if (found === undefined) throw new Error(`no handler for ${topic}`)
    return (id: string, eventId = 'event-1') =>
      found.handle({
        eventId,
        orgId: setup.a.id,
        topic: topic as never,
        payload: { version: 1, id } as never,
      })
  }
  const notified = async (setup: ApprovalsSetup, type: string) =>
    setup.db.tenant(setup.a.id, (tx) =>
      tx
        .select()
        .from(notifications)
        .where(eq(notifications.type, type as never)),
    )

  it('tells every person who can decide, once, and not the one who asked', async () => {
    const setup = await setupApprovals()
    const team = await setup.addTeam('Finance', [setup.builders.ben])
    const id = await setup.seed({
      assignees: [
        { type: 'user', id: setup.a.members.uma.id },
        { type: 'team', id: team },
        { type: 'role', id: 'admin' },
      ],
    })
    await handler(setup, 'approval.requested')(id)
    await handler(setup, 'approval.requested')(id) // delivered twice
    const rows = await notified(setup, 'approval.requested')
    expect(new Set(rows.map((row) => row.userId))).toEqual(
      new Set([
        setup.a.members.uma.id,
        setup.builders.ben.id,
        setup.a.members.adam.id,
        setup.a.members.olivia.id,
      ]),
    )
    expect(rows).toHaveLength(4)
    expect(rows[0]).toMatchObject({ targetType: 'approval', targetId: id })
    expect(rows[0]?.params).toMatchObject({
      title: 'Refund $340 to order #1182',
      kind: 'ai_action',
    })
  })

  it('says nothing about an approval that was decided before the event was delivered', async () => {
    const setup = await setupApprovals()
    const id = await setup.seed()
    expectData(await setup.call('uma', 'POST', `/${id}/approve`, {}), 200, approvalDetailDtoSchema)
    await handler(setup, 'approval.requested')(id)
    expect(await notified(setup, 'approval.requested')).toHaveLength(0)
  })

  it('tells the escalation approvers only', async () => {
    const setup = await setupApprovals()
    const id = await setup.seed({ waitMinutes: 30, timeoutAction: 'escalate' })
    await runOut(setup, id)
    await setup.container.modules.approvals.timeouts.run()
    await handler(setup, 'approval.escalated')(id)
    const rows = await notified(setup, 'approval.requested')
    expect(new Set(rows.map((row) => row.userId))).toEqual(
      new Set([setup.a.members.adam.id, setup.a.members.olivia.id]),
    )
  })

  it('tells the Builder who asked how their request ended, and nobody for an AI action', async () => {
    const setup = await setupApprovals()
    const request = await setup.seed({
      kind: 'bridge_install',
      payload: bridgePayload(),
      title: 'Install Slack',
      requestedByUserId: setup.builders.bella.id,
    })
    const ai = await setup.seed()
    expectData(
      await setup.call('adam', 'POST', `/${request}/reject`, { reason: 'wrong_team' }),
      200,
      approvalDetailDtoSchema,
    )
    expectData(await setup.call('uma', 'POST', `/${ai}/approve`, {}), 200, approvalDetailDtoSchema)
    await handler(setup, 'approval.decided')(request)
    await handler(setup, 'approval.decided')(ai)
    const rows = await notified(setup, 'approval.decided')
    expect(rows).toHaveLength(1)
    expect(rows[0]).toMatchObject({
      userId: setup.builders.bella.id,
      actorUserId: setup.a.members.adam.id,
    })
    expect(rows[0]?.params).toMatchObject({ outcome: 'rejected', reason: 'wrong_team' })
  })

  it('tells the requester when a request expired', async () => {
    const setup = await setupApprovals()
    const id = await setup.seed({
      kind: 'channel_publish',
      title: 'Publish to WhatsApp',
      payload: {
        version: 1,
        kind: 'channel_publish',
        agentId: '0198f3a0-0000-7000-8000-000000000003',
        channelId: '0198f3a0-0000-7000-8000-000000000004',
        channelType: 'whatsapp',
        exposure: 'Anyone with the number',
      },
      requestedByUserId: setup.builders.bella.id,
      waitMinutes: 30,
      timeoutAction: 'reject',
    })
    await runOut(setup, id)
    await setup.container.modules.approvals.timeouts.run()
    await handler(setup, 'approval.expired')(id)
    const rows = await notified(setup, 'approval.decided')
    expect(rows.map((row) => row.userId)).toEqual([setup.builders.bella.id])
    expect(rows[0]?.params).toMatchObject({ outcome: 'expired' })
  })
})
