// SPDX-License-Identifier: AGPL-3.0-only
import { eq, sql } from 'drizzle-orm'
import { describe, expect, it } from 'vitest'

import { approvalAssignees, approvals } from '@/database/tables/index.js'
import { approvalDtoSchema, GUARD_ERROR_CODES } from '@surefy/contracts'
import type { AgentGuard } from '@surefy/contracts'

import { expectPage, request } from '../../../../test/helpers/request.js'
import { EMPTY_SUBJECTS } from '../guard.types.js'
import {
  approvalRuleBody,
  GUARD_AGENT_ID,
  makeRule,
  setupGuard,
  type GuardSetup,
} from './guardTestKit.js'

import type { GuardCheckInput } from '../guard.types.js'

const AGENT = { id: GUARD_AGENT_ID, version: 1 }
const NO_RULES: AgentGuard = {
  thresholds: null,
  approvalRules: [],
  actionLimits: [],
  blockedActions: [],
}

const refundCheck = (
  setup: GuardSetup,
  overrides: Partial<GuardCheckInput> = {},
): GuardCheckInput => ({
  agent: AGENT,
  guard: NO_RULES,
  doubleCheckModelKey: null,
  confidence: 0.95,
  teamIds: [],
  runId: '0198f3a0-0000-7000-8000-0000000000c1',
  seq: 1,
  modelContext: {
    orgId: setup.a.id,
    userId: null,
    teamIds: [],
    primaryTeamId: null,
    allowedModelIds: 'all',
    caller: 'agent',
  },
  action: {
    name: 'payments.refund',
    input: { amount: 340 },
    permission: 'can_act',
    amountMicros: 340_000_000,
    currency: 'USD',
  },
  ...overrides,
})

describe('what approvals reads from Guard', () => {
  it('asks for re-authentication above the step-up amount the organization saved', async () => {
    const setup = await setupGuard()
    await makeRule(setup, approvalRuleBody('Refunds need approval', 'payments.refund'))
    const engine = setup.engine()
    await engine.check({ orgId: setup.a.id }, refundCheck(setup))
    const saved = await setup.call('adam', 'PUT', '/defaults', {
      autoThresholdBp: 9000,
      reviewThresholdBp: 6000,
      quickApproveMaxAmountMicros: 0,
      quickApproveMaxRisk: 'low',
      stepUpAmountMicros: 100_000_000,
      targetDecisionMinutes: 60,
      reason: 'Test',
    })
    expect(saved.statusCode).toBe(200)
    await engine.check({ orgId: setup.a.id }, refundCheck(setup, { seq: 2 }))
    const rows = await setup.db.tenant(setup.a.id, (tx) =>
      tx.select().from(approvals).orderBy(approvals.createdAt),
    )
    expect(rows.map((row) => row.requiresStepUp)).toEqual([false, true])
  })

  it('shows the name of the rule an approval came from', async () => {
    const setup = await setupGuard()
    const ruleId = await makeRule(
      setup,
      approvalRuleBody('Finance approves refunds', 'payments.refund'),
    )
    await setup.engine().check({ orgId: setup.a.id }, refundCheck(setup))
    const list = await request(setup.app, 'GET', `/api/v1/orgs/${setup.a.id}/approvals`, {
      headers: setup.sessionOf(setup.a.members.adam),
    })
    const { data } = expectPage(list, approvalDtoSchema)
    expect(data[0]).toMatchObject({ ruleRef: ruleId, ruleName: 'Finance approves refunds' })
  })

  it('escalates to the people the rule names when the wait runs out', async () => {
    const setup = await setupGuard()
    const finance = await setup.addTeam('Finance', [])
    const ruleId = await makeRule(
      setup,
      approvalRuleBody('Refunds', 'payments.refund', [{ type: 'role', id: 'admin' }], {
        waitMinutes: 5,
        onTimeout: 'escalate',
        escalateTo: [{ type: 'team', id: finance }],
      }),
    )
    const result = await setup.engine().check({ orgId: setup.a.id }, refundCheck(setup))
    expect(result.approvalId).not.toBeNull()
    await setup.ownerSql(
      sql`update approvals set expires_at = now() - interval '1 minute' where id = ${result.approvalId}`,
    )
    const run = await setup.container.modules.approvals.timeouts.run()
    expect(run).toMatchObject({ due: 1, escalated: 1 })
    const assignees = await setup.db.tenant(setup.a.id, (tx) =>
      tx
        .select()
        .from(approvalAssignees)
        .where(eq(approvalAssignees.approvalId, result.approvalId ?? '')),
    )
    expect(assignees.find((row) => row.source === 'escalation')?.teamId).toBe(finance)
    expect(ruleId).toBeTruthy()
  })

  it('escalates to Admins when the rule names nobody', async () => {
    const setup = await setupGuard()
    await makeRule(
      setup,
      approvalRuleBody('Refunds', 'payments.refund', [{ type: 'role', id: 'owner' }], {
        waitMinutes: 5,
        onTimeout: 'escalate',
      }),
    )
    const result = await setup.engine().check({ orgId: setup.a.id }, refundCheck(setup))
    await setup.ownerSql(
      sql`update approvals set expires_at = now() - interval '1 minute' where id = ${result.approvalId}`,
    )
    await setup.container.modules.approvals.timeouts.run()
    const assignees = await setup.db.tenant(setup.a.id, (tx) =>
      tx
        .select()
        .from(approvalAssignees)
        .where(eq(approvalAssignees.approvalId, result.approvalId ?? '')),
    )
    expect(
      assignees
        .filter((row) => row.source === 'escalation')
        .map((row) => [row.subjectType, row.role]),
    ).toEqual([['role', 'admin']])
  })
})

describe('an agent may be stricter than the organization, never looser', () => {
  it('rejects thresholds below the organization’s and accepts equal or higher ones', async () => {
    const setup = await setupGuard()
    const { settings } = setup.container.modules.guard
    const ctx = { orgId: setup.a.id }
    await settings.assertNotLooser(ctx, { thresholds: null })
    await settings.assertNotLooser(ctx, { thresholds: { autoBp: 9000, reviewBp: 6000 } })
    await settings.assertNotLooser(ctx, { thresholds: { autoBp: 9800, reviewBp: 9000 } })
    await expect(
      settings.assertNotLooser(ctx, { thresholds: { autoBp: 8000, reviewBp: 6000 } }),
    ).rejects.toMatchObject({
      code: GUARD_ERROR_CODES.GUARD_LOOSER_THAN_PARENT,
      options: { details: [{ field: 'guard.thresholds.autoBp' }] },
    })
    await expect(
      settings.assertNotLooser(ctx, { thresholds: { autoBp: 9000, reviewBp: 5000 } }),
    ).rejects.toMatchObject({ code: GUARD_ERROR_CODES.GUARD_LOOSER_THAN_PARENT })
  })

  it('judges against the raised values at once', async () => {
    const setup = await setupGuard()
    await setup.call('adam', 'PUT', '/defaults', {
      autoThresholdBp: 9500,
      reviewThresholdBp: 7500,
      quickApproveMaxAmountMicros: 0,
      quickApproveMaxRisk: 'low',
      stepUpAmountMicros: null,
      targetDecisionMinutes: 60,
    })
    await expect(
      setup.container.modules.guard.settings.assertNotLooser(
        { orgId: setup.a.id },
        { thresholds: { autoBp: 9000, reviewBp: 6000 } },
      ),
    ).rejects.toMatchObject({ code: GUARD_ERROR_CODES.GUARD_LOOSER_THAN_PARENT })
  })
})

describe('the statistics rollup', () => {
  it('counts approvals by the day they were requested and decided, with the decision time', async () => {
    const setup = await setupGuard()
    const create = (title: string) =>
      setup.db.tenant(setup.a.id, (tx) =>
        setup.container.modules.approvals.service.create(
          tx,
          {
            orgId: setup.a.id,
            userId: null,
            via: 'system',
            teamIds: [],
            access: { permissions: [] },
          },
          {
            kind: 'ai_action',
            title,
            payload: {
              version: 1,
              kind: 'ai_action',
              action: { name: 'payments.refund', input: {} },
              reasoning: [],
              sources: [],
              stepRef: { seq: 1 },
            },
            assignees: [{ type: 'user', id: setup.a.members.uma.id }],
          },
        ),
      )
    const one = await create('One')
    const two = await create('Two')
    await create('Three')
    await setup.ownerSql(sql`
      update approvals set status = 'approved', resolved_by = 'user', decided_by_user_id = ${setup.a.members.uma.id},
        decided_at = created_at + interval '90 seconds' where id = ${one.id}`)
    await setup.ownerSql(sql`
      update approvals set status = 'expired', resolved_by = 'timeout', decided_at = now() where id = ${two.id}`)
    await setup.container.modules.guard.stats.rollup('nightly')
    const today = new Date().toISOString().slice(0, 10)
    const rows = await setup.db.tenant(setup.a.id, (tx) =>
      tx.execute<Record<string, string>>(sql`
        select approvals_requested, approvals_approved, approvals_rejected, approvals_expired,
               approval_decision_seconds_sum
        from guard_stats_daily where day = ${today}::date`),
    )
    expect(rows.rows).toEqual([
      {
        approvals_requested: '3',
        approvals_approved: '1',
        approvals_rejected: '0',
        approvals_expired: '1',
        approval_decision_seconds_sum: '90',
      },
    ])
  })

  it('takes the checked steps from the run modules and survives being run twice', async () => {
    const holder = { orgId: '' }
    const setup = await setupGuard({
      guard: {
        subjects: {
          ...EMPTY_SUBJECTS,
          actionCounts: (_tx, day) =>
            Promise.resolve(
              day === new Date().toISOString().slice(0, 10)
                ? [
                    {
                      organizationId: holder.orgId,
                      auto: 40,
                      doubleCheck: 6,
                      human: 3,
                      blockedRule: 2,
                      blockedLimit: 1,
                    },
                  ]
                : [],
            ),
        },
      },
    })
    holder.orgId = setup.a.id
    await setup.container.modules.guard.stats.rollup('hourly')
    await setup.container.modules.guard.stats.rollup('hourly')
    const today = new Date().toISOString().slice(0, 10)
    const rows = await setup.db.tenant(setup.a.id, (tx) =>
      tx.execute<Record<string, string>>(sql`
        select actions_auto, actions_double_check, actions_human, actions_blocked_rule,
               actions_blocked_limit from guard_stats_daily where day = ${today}::date`),
    )
    expect(rows.rows).toEqual([
      {
        actions_auto: '40',
        actions_double_check: '6',
        actions_human: '3',
        actions_blocked_rule: '2',
        actions_blocked_limit: '1',
      },
    ])
  })
})
