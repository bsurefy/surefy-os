// SPDX-License-Identifier: AGPL-3.0-only
import { and, eq, sql } from 'drizzle-orm'
import { afterEach, describe, expect, it, vi } from 'vitest'

import { approvalAssignees, approvals, auditLogs, outboxEvents } from '@/database/tables/index.js'
import {
  APPROVALS_ERROR_CODES,
  approvalDetailDtoSchema,
  approvalDtoSchema,
  approvalSummaryDtoSchema,
  bulkDecideResultDtoSchema,
  ERROR_CODES,
} from '@surefy/contracts'

import {
  bridgePayload,
  guardWith,
  setupApprovals,
  type ApprovalsSetup,
} from './approvalsTestKit.js'
import { expectData, expectError, expectPage } from '../../../../test/helpers/request.js'

afterEach(() => {
  vi.useRealTimers()
})

const rowOf = async (setup: ApprovalsSetup, id: string) => {
  const [row] = await setup.db.tenant(setup.a.id, (tx) =>
    tx.select().from(approvals).where(eq(approvals.id, id)),
  )
  return row
}

const auditActions = async (setup: ApprovalsSetup, action: string) =>
  setup.db.system('test', (tx) =>
    tx
      .select()
      .from(auditLogs)
      .where(and(eq(auditLogs.organizationId, setup.a.id), eq(auditLogs.action, action))),
  )

const events = async (setup: ApprovalsSetup, topic: string) =>
  setup.db.system('test', (tx) =>
    tx
      .select()
      .from(outboxEvents)
      .where(and(eq(outboxEvents.organizationId, setup.a.id), eq(outboxEvents.topic, topic))),
  )

const assigneesOf = async (setup: ApprovalsSetup, id: string) =>
  setup.db.tenant(setup.a.id, (tx) =>
    tx.select().from(approvalAssignees).where(eq(approvalAssignees.approvalId, id)),
  )

const system = (setup: ApprovalsSetup) => ({
  orgId: setup.a.id,
  userId: null,
  via: 'system' as const,
  teamIds: [],
  access: { permissions: [] },
})

describe('creating an approval', () => {
  it('records the assignees, the audit entry and the event that tells them', async () => {
    const setup = await setupApprovals()
    const id = await setup.seed({ amountMicros: 340_000_000, risk: 'medium' })
    expect(await rowOf(setup, id)).toMatchObject({
      kind: 'ai_action',
      status: 'pending',
      risk: 'medium',
      amountMicros: 340_000_000,
      requiresStepUp: false,
      resolvedBy: null,
    })
    expect(await assigneesOf(setup, id)).toHaveLength(1)
    expect(await auditActions(setup, 'approval.requested')).toHaveLength(1)
    expect(await events(setup, 'approval.requested')).toHaveLength(1)
  })

  it('returns the first approval when a step is retried', async () => {
    const setup = await setupApprovals()
    const first = await setup.seed({ dedupeKey: 'agent_run:r1:4' })
    const second = await setup.seed({ dedupeKey: 'agent_run:r1:4' })
    expect(second).toBe(first)
    const rows = await setup.db.tenant(setup.a.id, (tx) => tx.select().from(approvals))
    expect(rows).toHaveLength(1)
    expect(await assigneesOf(setup, first)).toHaveLength(1)
    expect(await events(setup, 'approval.requested')).toHaveLength(1)
  })

  it('sends the request kinds to Admins and Owners whatever the caller names', async () => {
    const setup = await setupApprovals()
    const id = await setup.seed({
      kind: 'bridge_install',
      payload: bridgePayload(),
      title: 'Install Slack',
      assignees: [{ type: 'user', id: setup.a.members.uma.id }],
      requestedByUserId: setup.builders.bella.id,
    })
    const assignees = await assigneesOf(setup, id)
    expect(assignees.map((row) => [row.subjectType, row.role])).toEqual([['role', 'admin']])
  })

  it('fixes the step-up need and the wait when it is created', async () => {
    const setup = await setupApprovals({
      approvals: { guard: guardWith({ stepUpAmountMicros: 1_000_000_000 }) },
    })
    const small = await setup.seed({ amountMicros: 1_000_000_000 })
    const large = await setup.seed({
      amountMicros: 1_000_000_001,
      waitMinutes: 30,
      timeoutAction: 'escalate',
    })
    expect((await rowOf(setup, small))?.requiresStepUp).toBe(false)
    const row = await rowOf(setup, large)
    expect(row?.requiresStepUp).toBe(true)
    expect(row?.timeoutAction).toBe('escalate')
    expect(row?.expiresAt?.getTime()).toBeGreaterThan(Date.now() + 29 * 60_000)
  })
})

describe('the queue', () => {
  it('shows people what they can decide and Admins everything, oldest first', async () => {
    const setup = await setupApprovals()
    const forUma = await setup.seed({ title: 'For Uma' })
    const forBella = await setup.seed({
      title: 'For Bella',
      assignees: [{ type: 'user', id: setup.builders.bella.id }],
    })

    const uma = expectPage(await setup.call('uma', 'GET', ''), approvalDtoSchema)
    expect(uma.data.map((item) => item.id)).toEqual([forUma])
    expect(uma.data[0]).toMatchObject({ canDecide: true, status: 'pending' })

    const adam = expectPage(await setup.call('adam', 'GET', ''), approvalDtoSchema)
    expect(adam.data.map((item) => item.id)).toEqual([forUma, forBella])
    expect(adam.data.every((item) => !item.canDecide)).toBe(true)
    expect(adam.data[0]?.assignees[0]?.user?.id).toBe(setup.a.members.uma.id)
  })

  it('matches teams and roles: a role and every role above it may decide', async () => {
    const setup = await setupApprovals()
    const team = await setup.addTeam('Finance', [setup.builders.ben])
    const byTeam = await setup.seed({ assignees: [{ type: 'team', id: team }] })
    const byRole = await setup.seed({ assignees: [{ type: 'role', id: 'builder' }] })

    const ben = expectPage(
      await setup.call('ben', 'GET', '', undefined, { canDecide: 'true' }),
      approvalDtoSchema,
    )
    expect(new Set(ben.data.map((item) => item.id))).toEqual(new Set([byTeam, byRole]))
    const bella = expectPage(
      await setup.call('bella', 'GET', '', undefined, { canDecide: 'true' }),
      approvalDtoSchema,
    )
    expect(bella.data.map((item) => item.id)).toEqual([byRole])
    const adam = expectPage(
      await setup.call('adam', 'GET', '', undefined, { canDecide: 'true' }),
      approvalDtoSchema,
    )
    expect(adam.data.map((item) => item.id)).toEqual([byRole])
    const uma = expectPage(await setup.call('uma', 'GET', ''), approvalDtoSchema)
    expect(uma.data).toEqual([])
  })

  it('pages with a cursor and filters by kind and search', async () => {
    const setup = await setupApprovals()
    for (let n = 1; n <= 3; n++) {
      await setup.seed({ title: `Refund ${n}`, assignees: [{ type: 'role', id: 'user' }] })
    }
    await setup.seed({
      title: 'Install Notion',
      kind: 'bridge_install',
      payload: bridgePayload(),
      risk: 'high',
    })
    const first = expectPage(
      await setup.call('adam', 'GET', '', undefined, { limit: '2' }),
      approvalDtoSchema,
    )
    expect(first.data.map((item) => item.title)).toEqual(['Refund 1', 'Refund 2'])
    expect(first.nextCursor).not.toBeNull()
    const second = expectPage(
      await setup.call('adam', 'GET', '', undefined, {
        limit: '2',
        cursor: first.nextCursor ?? '',
      }),
      approvalDtoSchema,
    )
    expect(second.data.map((item) => item.title)).toEqual(['Refund 3', 'Install Notion'])
    const kind = expectPage(
      await setup.call('adam', 'GET', '', undefined, { kind: 'bridge_install' }),
      approvalDtoSchema,
    )
    expect(kind.data.map((item) => item.title)).toEqual(['Install Notion'])
    const search = expectPage(
      await setup.call('adam', 'GET', '', undefined, { q: 'refund 2' }),
      approvalDtoSchema,
    )
    expect(search.data.map((item) => item.title)).toEqual(['Refund 2'])
  })

  it('counts what waits, what is late and what was decided today', async () => {
    const setup = await setupApprovals({
      approvals: { guard: guardWith({ targetDecisionMinutes: 60 }) },
    })
    const toAdam = [{ type: 'user' as const, id: setup.a.members.adam.id }]
    const late = await setup.seed({ assignees: toAdam })
    await setup.seed({ assignees: toAdam })
    const done = await setup.seed({ assignees: toAdam })
    await setup.ownerSql(
      sql`update approvals set created_at = now() - interval '2 hours' where id = ${late}`,
    )
    expectData(
      await setup.call('adam', 'POST', `/${done}/approve`, {}),
      200,
      approvalDetailDtoSchema,
    )
    const summary = expectData(
      await setup.call('adam', 'GET', '/summary'),
      200,
      approvalSummaryDtoSchema,
    )
    expect(summary).toEqual({ pending: 2, pendingForMe: 2, overdue: 1, decidedToday: 1 })

    const decided = expectPage(
      await setup.call('adam', 'GET', '', undefined, { decidedToday: 'true' }),
      approvalDtoSchema,
    )
    expect(decided.data.map((item) => [item.id, item.status])).toEqual([[done, 'approved']])
    expect(decided.data[0]?.decidedBy?.id).toBe(setup.a.members.adam.id)
  })

  it('shows the detail to people who see it and hides it from others', async () => {
    const setup = await setupApprovals()
    const id = await setup.seed()
    const detail = expectData(
      await setup.call('uma', 'GET', `/${id}`),
      200,
      approvalDetailDtoSchema,
    )
    expect(detail.payload).toMatchObject({ kind: 'ai_action' })
    expect(detail.editedPayload).toBeNull()
    expectError(
      await setup.call('bella', 'GET', `/${id}`),
      404,
      APPROVALS_ERROR_CODES.APPROVAL_NOT_FOUND,
    )
  })
})

describe('deciding', () => {
  it('approves for an assignee: audit entry, event, and the decision is final', async () => {
    const setup = await setupApprovals()
    const id = await setup.seed()
    const decided = expectData(
      await setup.call('uma', 'POST', `/${id}/approve`, { via: 'popover' }),
      200,
      approvalDetailDtoSchema,
    )
    expect(decided).toMatchObject({ status: 'approved', resolvedBy: 'user', canDecide: false })
    expect(decided.decidedBy?.id).toBe(setup.a.members.uma.id)
    const [entry] = await auditActions(setup, 'approval.decided')
    expect(JSON.stringify(entry)).toContain('popover')
    expect(await events(setup, 'approval.decided')).toHaveLength(1)

    const again = expectError(
      await setup.call('uma', 'POST', `/${id}/approve`, {}),
      409,
      APPROVALS_ERROR_CODES.APPROVAL_ALREADY_DECIDED,
    )
    expect(JSON.stringify(again.details)).toContain('"status":"approved"')
    expect(await events(setup, 'approval.decided')).toHaveLength(1)
  })

  it('refuses people who are not assigned, even Admins', async () => {
    const setup = await setupApprovals()
    const id = await setup.seed()
    expectError(
      await setup.call('adam', 'POST', `/${id}/approve`, {}),
      403,
      APPROVALS_ERROR_CODES.APPROVAL_NOT_ASSIGNED,
    )
    expectError(
      await setup.call('bella', 'POST', `/${id}/reject`, { reason: 'wrong_team' }),
      404,
      APPROVALS_ERROR_CODES.APPROVAL_NOT_FOUND,
    )
    expect((await rowOf(setup, id))?.status).toBe('pending')
  })

  it('lets Admins decide a request kind, and not the Builder who asked', async () => {
    const setup = await setupApprovals()
    const id = await setup.seed({
      kind: 'channel_publish',
      title: 'Publish Support agent to WhatsApp',
      payload: {
        version: 1,
        kind: 'channel_publish',
        agentId: '0198f3a0-0000-7000-8000-000000000003',
        channelId: '0198f3a0-0000-7000-8000-000000000004',
        channelType: 'whatsapp',
        exposure: 'Anyone with the number',
      },
      requestedByUserId: setup.builders.bella.id,
    })
    expectError(
      await setup.call('bella', 'POST', `/${id}/approve`, {}),
      403,
      APPROVALS_ERROR_CODES.APPROVAL_NOT_ASSIGNED,
    )
    expectData(await setup.call('adam', 'POST', `/${id}/approve`, {}), 200, approvalDetailDtoSchema)
  })

  it('lets exactly one of two simultaneous approvers win', async () => {
    const setup = await setupApprovals()
    const id = await setup.seed({
      assignees: [
        { type: 'user', id: setup.builders.bella.id },
        { type: 'user', id: setup.builders.ben.id },
      ],
    })
    const [one, two] = await Promise.all([
      setup.call('bella', 'POST', `/${id}/approve`, {}),
      setup.call('ben', 'POST', `/${id}/reject`, { reason: 'not_eligible' }),
    ])
    expect([one.statusCode, two.statusCode].sort((x, y) => x - y)).toEqual([200, 409])
    expect(['approved', 'rejected']).toContain((await rowOf(setup, id))?.status)
    expect(await events(setup, 'approval.decided')).toHaveLength(1)
    expect(await auditActions(setup, 'approval.decided')).toHaveLength(1)
  })

  it('rejects with a reason, and needs a note for "other"', async () => {
    const setup = await setupApprovals()
    const id = await setup.seed()
    expectError(
      await setup.call('uma', 'POST', `/${id}/reject`, {}),
      422,
      ERROR_CODES.VALIDATION_FAILED,
    )
    expectError(
      await setup.call('uma', 'POST', `/${id}/reject`, { reason: 'other' }),
      422,
      ERROR_CODES.VALIDATION_FAILED,
    )
    const rejected = expectData(
      await setup.call('uma', 'POST', `/${id}/reject`, {
        reason: 'other',
        note: 'Duplicate request',
      }),
      200,
      approvalDetailDtoSchema,
    )
    expect(rejected).toMatchObject({
      status: 'rejected',
      decisionReason: 'other',
      decisionNote: 'Duplicate request',
      resolvedBy: 'user',
    })
  })

  it('edits and approves: the edited fields join the original input', async () => {
    const setup = await setupApprovals()
    const id = await setup.seed()
    expectError(
      await setup.call('uma', 'POST', `/${id}/approve`, { editedInput: { discount: 5 } }),
      422,
      ERROR_CODES.VALIDATION_FAILED,
    )
    expect((await rowOf(setup, id))?.status).toBe('pending')
    const decided = expectData(
      await setup.call('uma', 'POST', `/${id}/approve`, { editedInput: { amount: 120 } }),
      200,
      approvalDetailDtoSchema,
    )
    expect(decided.payload).toMatchObject({ action: { input: { amount: 340, orderId: '1182' } } })
    expect(decided.editedPayload).toMatchObject({
      action: { input: { amount: 120, orderId: '1182' } },
    })
    expect(JSON.stringify((await auditActions(setup, 'approval.decided'))[0])).toContain(
      '"edited":true',
    )
  })

  it('has no editable fields on a request kind', async () => {
    const setup = await setupApprovals()
    const id = await setup.seed({
      kind: 'bridge_install',
      payload: bridgePayload(),
      title: 'Install',
    })
    expectError(
      await setup.call('adam', 'POST', `/${id}/approve`, { editedInput: { x: 1 } }),
      422,
      APPROVALS_ERROR_CODES.APPROVAL_EDIT_NOT_ALLOWED,
    )
  })

  it('answers "expired" for a wait that ran out before the sweeper took its action', async () => {
    const setup = await setupApprovals()
    const id = await setup.seed({ waitMinutes: 30, timeoutAction: 'continue' })
    await setup.ownerSql(
      sql`update approvals set expires_at = now() - interval '1 minute' where id = ${id}`,
    )
    const error = expectError(
      await setup.call('uma', 'POST', `/${id}/approve`, {}),
      409,
      APPROVALS_ERROR_CODES.APPROVAL_EXPIRED,
    )
    expect(JSON.stringify(error.details)).toContain('continue')
    expect((await rowOf(setup, id))?.status).toBe('pending')
  })
})

describe('step-up', () => {
  const stepUp = () =>
    setupApprovals({ approvals: { guard: guardWith({ stepUpAmountMicros: 500_000_000 }) } })

  it('asks for a recent sign-in above the amount and records nothing without it', async () => {
    const setup = await stepUp()
    const id = await setup.seed({ amountMicros: 900_000_000 })
    // the session was created now; twenty minutes later it is older than the fresh age
    vi.useFakeTimers({ toFake: ['Date'], now: Date.now() + 20 * 60_000 })
    expectError(
      await setup.call('uma', 'POST', `/${id}/approve`, {}),
      403,
      ERROR_CODES.AUTH_SESSION_NOT_FRESH,
    )
    expect((await rowOf(setup, id))?.status).toBe('pending')
    expect(await events(setup, 'approval.decided')).toHaveLength(0)
    // rejecting never needs it
    expectData(
      await setup.call('uma', 'POST', `/${id}/reject`, { reason: 'wrong_amount' }),
      200,
      approvalDetailDtoSchema,
    )
  })

  it('approves with a fresh session and notes it in the audit entry', async () => {
    const setup = await stepUp()
    const id = await setup.seed({ amountMicros: 900_000_000 })
    expectData(await setup.call('uma', 'POST', `/${id}/approve`, {}), 200, approvalDetailDtoSchema)
    expect(JSON.stringify((await auditActions(setup, 'approval.decided'))[0])).toContain(
      '"stepUp":true',
    )
  })
})

describe('bulk decisions', () => {
  const limits = () =>
    setupApprovals({
      approvals: {
        guard: guardWith({
          quickApproveMaxAmountMicros: 100_000_000,
          stepUpAmountMicros: 500_000_000,
        }),
      },
    })

  it('decides items of one rule within the limits and skips the rest with the reason', async () => {
    const setup = await limits()
    const one = await setup.seed({ amountMicros: 50_000_000 })
    const two = await setup.seed({ amountMicros: 80_000_000 })
    const tooBig = await setup.seed({ amountMicros: 200_000_000 })
    const otherRule = await setup.seed({ ruleRef: 'guardrail-other' })
    const risky = await setup.seed({ risk: 'high' })
    const taken = await setup.seed()
    expectData(
      await setup.call('uma', 'POST', `/${taken}/approve`, {}),
      200,
      approvalDetailDtoSchema,
    )

    const result = expectData(
      await setup.call('uma', 'POST', '/bulk-decide', {
        ids: [one, two, tooBig, otherRule, risky, taken],
        decision: 'approve',
      }),
      200,
      bulkDecideResultDtoSchema,
    )
    const quick = APPROVALS_ERROR_CODES.APPROVAL_NOT_QUICK_APPROVABLE
    expect(result.results).toEqual([
      { id: one, outcome: 'decided', errorCode: null },
      { id: two, outcome: 'decided', errorCode: null },
      { id: tooBig, outcome: 'skipped', errorCode: quick },
      { id: otherRule, outcome: 'skipped', errorCode: quick },
      { id: risky, outcome: 'skipped', errorCode: quick },
      {
        id: taken,
        outcome: 'skipped',
        errorCode: APPROVALS_ERROR_CODES.APPROVAL_ALREADY_DECIDED,
      },
    ])
    expect((await rowOf(setup, one))?.status).toBe('approved')
    expect((await rowOf(setup, tooBig))?.status).toBe('pending')
  })

  it('never takes an item that needs step-up, and rejects need a reason', async () => {
    const setup = await setupApprovals({
      approvals: {
        guard: guardWith({
          quickApproveMaxAmountMicros: 900_000_000,
          stepUpAmountMicros: 500_000_000,
        }),
      },
    })
    const stepUpItem = await setup.seed({ amountMicros: 600_000_000 })
    const result = expectData(
      await setup.call('uma', 'POST', '/bulk-decide', { ids: [stepUpItem], decision: 'approve' }),
      200,
      bulkDecideResultDtoSchema,
    )
    expect(result.results[0]).toMatchObject({ outcome: 'skipped' })
    expectError(
      await setup.call('uma', 'POST', '/bulk-decide', { ids: [stepUpItem], decision: 'reject' }),
      422,
      ERROR_CODES.VALIDATION_FAILED,
    )
  })

  it('marks which queue items fit the quick-approve limits', async () => {
    const setup = await limits()
    const fits = await setup.seed({ amountMicros: 10_000_000 })
    await setup.seed({ amountMicros: 400_000_000 })
    const quick = expectPage(
      await setup.call('uma', 'GET', '', undefined, { quickApprovable: 'true' }),
      approvalDtoSchema,
    )
    expect(quick.data.map((item) => item.id)).toEqual([fits])
    expect(quick.data[0]?.quickApprovable).toBe(true)
  })
})

describe('withdrawing a request', () => {
  it('lets the requester take it back, and nobody else', async () => {
    const setup = await setupApprovals()
    const id = await setup.seed({
      kind: 'bridge_install',
      payload: bridgePayload(),
      title: 'Install Slack',
      requestedByUserId: setup.builders.bella.id,
    })
    expectError(
      await setup.call('ben', 'POST', `/${id}/cancel`),
      404,
      APPROVALS_ERROR_CODES.APPROVAL_NOT_FOUND,
    )
    expectError(
      await setup.call('adam', 'POST', `/${id}/cancel`),
      409,
      APPROVALS_ERROR_CODES.APPROVAL_NOT_CANCELABLE,
    )
    const canceled = expectData(
      await setup.call('bella', 'POST', `/${id}/cancel`),
      200,
      approvalDetailDtoSchema,
    )
    expect(canceled).toMatchObject({ status: 'canceled', resolvedBy: 'user' })
    expect(await auditActions(setup, 'approval.canceled')).toHaveLength(1)
    expectError(
      await setup.call('bella', 'POST', `/${id}/cancel`),
      409,
      APPROVALS_ERROR_CODES.APPROVAL_NOT_CANCELABLE,
    )
  })

  it('does not let anyone withdraw an AI action', async () => {
    const setup = await setupApprovals()
    const id = await setup.seed({
      requestedByUserId: setup.builders.bella.id,
      assignees: [{ type: 'user', id: setup.builders.bella.id }],
    })
    expectError(
      await setup.call('bella', 'POST', `/${id}/cancel`),
      409,
      APPROVALS_ERROR_CODES.APPROVAL_NOT_CANCELABLE,
    )
  })
})

describe('what the other modules call', () => {
  it('cancels what a run left waiting, as the system', async () => {
    const setup = await setupApprovals()
    const runId = '0198f3a0-0000-7000-8000-0000000000aa'
    const waiting = await setup.seed({ agentRunId: runId, dedupeKey: 'agent_run:aa:1' })
    const other = await setup.seed({ dedupeKey: 'agent_run:bb:1' })
    const canceled = await setup.db.tenant(setup.a.id, (tx) =>
      setup.container.modules.approvals.service.cancelPending(tx, system(setup), {
        agentRunId: runId,
      }),
    )
    expect(canceled).toEqual([waiting])
    expect(await rowOf(setup, waiting)).toMatchObject({ status: 'canceled', resolvedBy: 'system' })
    expect((await rowOf(setup, other))?.status).toBe('pending')
  })

  it('adds Admins when the last person who could decide is removed', async () => {
    const setup = await setupApprovals()
    const alone = await setup.seed({ assignees: [{ type: 'user', id: setup.builders.bella.id }] })
    const shared = await setup.seed({
      assignees: [
        { type: 'user', id: setup.builders.bella.id },
        { type: 'user', id: setup.builders.ben.id },
      ],
    })
    const removal = await setup.app.inject({
      method: 'DELETE',
      url: `/api/v1/orgs/${setup.a.id}/members/${setup.builders.bella.memberId}`,
      headers: setup.sessionOf(setup.a.members.olivia),
    })
    expect(removal.statusCode, removal.body).toBe(204)
    expect((await assigneesOf(setup, alone)).map((row) => row.role)).toEqual(['admin'])
    // Ben can still decide the other one
    expect((await assigneesOf(setup, shared)).map((row) => row.userId)).toEqual([
      setup.builders.ben.id,
    ])
  })

  it('adds Admins when a team that alone could decide is deleted', async () => {
    const setup = await setupApprovals()
    const team = await setup.addTeam('Finance', [setup.builders.ben])
    const id = await setup.seed({ assignees: [{ type: 'team', id: team }] })
    const deletion = await setup.app.inject({
      method: 'DELETE',
      url: `/api/v1/orgs/${setup.a.id}/teams/${team}`,
      headers: setup.sessionOf(setup.a.members.olivia),
    })
    expect(deletion.statusCode, deletion.body).toBe(204)
    expect((await assigneesOf(setup, id)).map((row) => row.role)).toEqual(['admin'])
  })
})
