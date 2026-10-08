// SPDX-License-Identifier: AGPL-3.0-only
import { and, eq } from 'drizzle-orm'
import { describe, expect, it } from 'vitest'

import { approvalAssignees, approvals, auditLogs } from '@/database/tables/index.js'
import { guardCheckResultSchema } from '@surefy/contracts'
import type { AgentGuard } from '@surefy/contracts'

import { agentRuleRef } from '../guard.engine.js'
import {
  approvalRuleBody,
  blockedBody,
  makeRule,
  setupGuard,
  type GuardSetup,
} from './guardTestKit.js'

import type { GuardCheckInput, GuardModelDecider } from '../guard.types.js'

const AGENT = { id: '0198f3a0-0000-7000-8000-0000000000a9', version: 3 }
const NO_RULES: AgentGuard = {
  thresholds: null,
  approvalRules: [],
  actionLimits: [],
  blockedActions: [],
}
let runs = 0
const runId = () => `0198f3a0-0000-7000-8000-${String(++runs).padStart(12, '0')}`

const inputFor = (
  setup: GuardSetup,
  overrides: Omit<Partial<GuardCheckInput>, 'action'> & {
    action?: Partial<GuardCheckInput['action']>
  } = {},
): GuardCheckInput => {
  const { action, ...rest } = overrides
  return {
    agent: AGENT,
    guard: NO_RULES,
    doubleCheckModelKey: 'openai/gpt-4.1-mini',
    confidence: 0.95,
    teamIds: [],
    runId: runId(),
    seq: 1,
    modelContext: {
      orgId: setup.a.id,
      userId: null,
      teamIds: [],
      primaryTeamId: null,
      allowedModelIds: 'all',
      caller: 'agent',
    },
    ...rest,
    action: {
      name: 'payments.refund',
      input: { amount: 340 },
      permission: 'can_act',
      amountMicros: 340_000_000,
      currency: 'USD',
      title: 'Refund $340 to order #1182',
      ...action,
    },
  }
}

const reviewer = (agreed: boolean): GuardModelDecider => ({
  decide: () => Promise.resolve({ value: agreed, confidence: 0.8, reasoning: 'Looks right' }),
})

const approvalsOf = (setup: GuardSetup) =>
  setup.db.tenant(setup.a.id, (tx) => tx.select().from(approvals))

const triggered = (setup: GuardSetup) =>
  setup.db.system('test', (tx) =>
    tx
      .select()
      .from(auditLogs)
      .where(
        and(eq(auditLogs.organizationId, setup.a.id), eq(auditLogs.action, 'guard.rule_triggered')),
      ),
  )

describe('the confidence rule', () => {
  it('lets a confident action run on its own', async () => {
    const setup = await setupGuard()
    const result = await setup.engine().check({ orgId: setup.a.id }, inputFor(setup))
    expect(guardCheckResultSchema.parse(result)).toMatchObject({
      outcome: 'auto',
      confidence: 0.95,
      thresholds: { autoBp: 9000, reviewBp: 6000 },
      matchedRules: [],
      doubleCheck: null,
      approvalId: null,
      reasonCode: null,
    })
    expect(await approvalsOf(setup)).toHaveLength(0)
  })

  it('asks a person when the confidence is low, once per step even when the check is retried', async () => {
    const setup = await setupGuard()
    const engine = setup.engine()
    const input = inputFor(setup, { confidence: 0.4, seq: 7 })
    const first = await engine.check({ orgId: setup.a.id }, input)
    expect(first).toMatchObject({ outcome: 'human', doubleCheck: null })
    expect(first.approvalId).not.toBeNull()
    const again = await engine.check({ orgId: setup.a.id }, input)
    expect(again.approvalId).toBe(first.approvalId)
    const [approval] = await approvalsOf(setup)
    expect(approval).toMatchObject({
      kind: 'ai_action',
      status: 'pending',
      title: 'Refund $340 to order #1182',
      amountMicros: 340_000_000,
      confidence: 0.4,
      risk: 'medium',
      ruleRef: null,
      agentId: AGENT.id,
      agentRunId: input.runId,
    })
    expect(await approvalsOf(setup)).toHaveLength(1)
    const assignees = await setup.db.tenant(setup.a.id, (tx) => tx.select().from(approvalAssignees))
    expect(assignees.map((row) => [row.subjectType, row.role])).toEqual([['role', 'admin']])
  })

  it('lets a second model review the middle band: agreeing runs, disagreeing asks a person', async () => {
    const setup = await setupGuard()
    const agreed = await setup
      .engine({ decider: reviewer(true) })
      .check({ orgId: setup.a.id }, inputFor(setup, { confidence: 0.7 }))
    expect(agreed).toMatchObject({
      outcome: 'double_check',
      doubleCheck: { agreed: true, confidence: 0.8 },
      approvalId: null,
    })
    const disagreed = await setup
      .engine({ decider: reviewer(false) })
      .check({ orgId: setup.a.id }, inputFor(setup, { confidence: 0.7 }))
    expect(disagreed).toMatchObject({ outcome: 'human', doubleCheck: { agreed: false } })
    expect(disagreed.approvalId).not.toBeNull()
  })

  it('treats a review that fails, or one that cannot happen, as a person’s call', async () => {
    const setup = await setupGuard()
    const failing = await setup
      .engine({ decider: { decide: () => Promise.reject(new Error('provider down')) } })
      .check({ orgId: setup.a.id }, inputFor(setup, { confidence: 0.7 }))
    expect(failing).toMatchObject({ outcome: 'human', doubleCheck: null })
    const noModel = await setup
      .engine({ decider: reviewer(true) })
      .check({ orgId: setup.a.id }, inputFor(setup, { confidence: 0.7, doubleCheckModelKey: null }))
    expect(noModel).toMatchObject({ outcome: 'human', doubleCheck: null })
  })

  it('lets a read-only tool run whatever the confidence, and always asks first for ask_first tools', async () => {
    const setup = await setupGuard()
    const engine = setup.engine()
    const read = await engine.check(
      { orgId: setup.a.id },
      inputFor(setup, { confidence: 0.1, action: { permission: 'read_only' } }),
    )
    expect(read.outcome).toBe('auto')
    const ask = await engine.check(
      { orgId: setup.a.id },
      inputFor(setup, { confidence: 0.99, action: { permission: 'ask_first' } }),
    )
    expect(ask.outcome).toBe('human')
    expect(ask.approvalId).not.toBeNull()
    const [approval] = await approvalsOf(setup)
    expect(approval?.risk).toBe('low')
  })

  it('treats an action without a confidence as the least sure one', async () => {
    const setup = await setupGuard()
    const result = await setup
      .engine()
      .check({ orgId: setup.a.id }, inputFor(setup, { confidence: null }))
    expect(result).toMatchObject({ outcome: 'human', confidence: null })
  })
})

describe('thresholds', () => {
  it('follows the organization’s defaults, and a raise applies at once', async () => {
    const setup = await setupGuard()
    const engine = setup.engine({ decider: reviewer(true) })
    expect(
      (await engine.check({ orgId: setup.a.id }, inputFor(setup, { confidence: 0.92 }))).outcome,
    ).toBe('auto')
    const saved = await setup.call('adam', 'PUT', '/defaults', {
      autoThresholdBp: 9500,
      reviewThresholdBp: 6000,
      quickApproveMaxAmountMicros: 0,
      quickApproveMaxRisk: 'low',
      stepUpAmountMicros: null,
      targetDecisionMinutes: 60,
    })
    expect(saved.statusCode).toBe(200)
    const after = await engine.check({ orgId: setup.a.id }, inputFor(setup, { confidence: 0.92 }))
    expect(after).toMatchObject({
      outcome: 'double_check',
      thresholds: { autoBp: 9500, reviewBp: 6000 },
    })
  })

  it('takes the highest of the organization, a matching override and the agent', async () => {
    const setup = await setupGuard()
    await makeRule(setup, {
      name: 'Refunds need more certainty',
      scope: 'organization',
      definition: {
        version: 1,
        kind: 'threshold_override',
        match: { action: 'payments' },
        autoBp: 9800,
        reviewBp: 9000,
      },
    })
    const engine = setup.engine({ decider: reviewer(true) })
    const refund = await engine.check({ orgId: setup.a.id }, inputFor(setup, { confidence: 0.95 }))
    expect(refund).toMatchObject({
      outcome: 'double_check',
      thresholds: { autoBp: 9800, reviewBp: 9000 },
    })
    expect(refund.matchedRules.map((rule) => rule.type)).toEqual(['threshold_override'])
    // another action is not touched by the override
    const other = await engine.check(
      { orgId: setup.a.id },
      inputFor(setup, { confidence: 0.95, action: { name: 'crm.update' } }),
    )
    expect(other.outcome).toBe('auto')
    // an agent value above the merged one wins; one below changes nothing
    const stricter = await engine.check(
      { orgId: setup.a.id },
      inputFor(setup, {
        confidence: 0.99,
        action: { name: 'crm.update' },
        guard: { ...NO_RULES, thresholds: { autoBp: 9950, reviewBp: 9500 } },
      }),
    )
    expect(stricter).toMatchObject({ outcome: 'double_check', thresholds: { autoBp: 9950 } })
    const looser = await engine.check(
      { orgId: setup.a.id },
      inputFor(setup, {
        confidence: 0.5,
        action: { name: 'crm.update' },
        guard: { ...NO_RULES, thresholds: { autoBp: 100, reviewBp: 50 } },
      }),
    )
    expect(looser).toMatchObject({ outcome: 'human', thresholds: { autoBp: 9000, reviewBp: 6000 } })
  })

  it('sends everything below the automatic threshold to a person when review reaches it', async () => {
    const setup = await setupGuard()
    const guard: AgentGuard = { ...NO_RULES, thresholds: { autoBp: 7000, reviewBp: 9500 } }
    const engine = setup.engine({ decider: reviewer(true) })
    const below = await engine.check(
      { orgId: setup.a.id },
      inputFor(setup, { confidence: 0.89, guard }),
    )
    expect(below).toMatchObject({
      outcome: 'human',
      doubleCheck: null,
      thresholds: { autoBp: 9000, reviewBp: 9000 },
    })
    const at = await engine.check(
      { orgId: setup.a.id },
      inputFor(setup, { confidence: 0.9, guard }),
    )
    expect(at.outcome).toBe('auto')
  })
})

describe('blocked actions', () => {
  it('stops an action blocked by the organization, whatever the confidence, and records the rule', async () => {
    const setup = await setupGuard()
    const ruleId = await makeRule(setup, blockedBody('No price changes', 'prices'))
    const result = await setup
      .engine()
      .check(
        { orgId: setup.a.id },
        inputFor(setup, { confidence: 1, action: { name: 'prices.update' } }),
      )
    expect(result).toMatchObject({
      outcome: 'blocked',
      reasonCode: 'GUARD_BLOCKED_ACTION',
      approvalId: null,
      doubleCheck: null,
      matchedRules: [{ ref: ruleId, type: 'blocked_action' }],
    })
    expect(await approvalsOf(setup)).toHaveLength(0)
    const entries = await triggered(setup)
    expect(entries).toHaveLength(1)
    expect(entries[0]).toMatchObject({
      targetType: 'guardrail',
      targetId: ruleId,
      actorType: 'agent',
    })
  })

  it('applies a team’s rule only to people in that team', async () => {
    const setup = await setupGuard()
    const sales = await setup.addTeam('Sales', [])
    await makeRule(
      setup,
      blockedBody('Sales cannot refund', 'payments.refund', { scope: 'team', teamId: sales }),
    )
    const engine = setup.engine()
    expect((await engine.check({ orgId: setup.a.id }, inputFor(setup))).outcome).toBe('auto')
    expect(
      (await engine.check({ orgId: setup.a.id }, inputFor(setup, { teamIds: [sales] }))).outcome,
    ).toBe('blocked')
  })

  it('stops an action the agent blocks for itself, under the agent rule’s reference', async () => {
    const setup = await setupGuard()
    const result = await setup.engine().check(
      { orgId: setup.a.id },
      inputFor(setup, {
        guard: {
          ...NO_RULES,
          blockedActions: [{ id: 'no-refunds', match: { action: 'payments.refund' } }],
        },
      }),
    )
    expect(result).toMatchObject({
      outcome: 'blocked',
      matchedRules: [{ ref: agentRuleRef(AGENT, 'no-refunds'), type: 'blocked_action' }],
    })
    expect(await triggered(setup)).toHaveLength(0) // agent rules are not guardrails
  })

  it('ignores a disabled rule and lets a condition narrow a rule', async () => {
    const setup = await setupGuard()
    await makeRule(setup, blockedBody('Off rule', 'payments.refund', { isEnabled: false }))
    await makeRule(setup, {
      name: 'Big refunds only',
      scope: 'organization',
      definition: {
        version: 1,
        kind: 'blocked_action',
        match: {
          action: 'payments.refund',
          conditions: [{ field: 'amount', operator: 'gt', value: 1000 }],
        },
      },
    })
    const engine = setup.engine()
    expect((await engine.check({ orgId: setup.a.id }, inputFor(setup))).outcome).toBe('auto')
    expect(
      (
        await engine.check(
          { orgId: setup.a.id },
          inputFor(setup, { action: { input: { amount: 5000 } } }),
        )
      ).outcome,
    ).toBe('blocked')
    // an amount the check cannot read counts as matching: a rule never lets an action slip by
    expect(
      (await engine.check({ orgId: setup.a.id }, inputFor(setup, { action: { input: {} } })))
        .outcome,
    ).toBe('blocked')
  })
})

describe('approval rules', () => {
  it('creates one approval with the rule’s approvers, wait, timeout action and risk', async () => {
    const setup = await setupGuard()
    const finance = await setup.addTeam('Finance', [])
    const ruleId = await makeRule(
      setup,
      approvalRuleBody(
        'Refunds over $200 need Finance',
        'payments.refund',
        [{ type: 'team', id: finance }],
        {
          match: {
            action: 'payments.refund',
            conditions: [{ field: 'amount', operator: 'gt', value: 200 }],
          },
          waitMinutes: 120,
          onTimeout: 'escalate',
          risk: 'high',
        },
      ),
    )
    const engine = setup.engine()
    const small = await engine.check(
      { orgId: setup.a.id },
      inputFor(setup, { action: { input: { amount: 50 } } }),
    )
    expect(small).toMatchObject({ outcome: 'auto', approvalId: null })
    const big = await engine.check({ orgId: setup.a.id }, inputFor(setup, { confidence: 0.99 }))
    expect(big).toMatchObject({
      outcome: 'human',
      matchedRules: [{ ref: ruleId, type: 'approval_rule' }],
    })
    const [approval] = await approvalsOf(setup)
    expect(approval).toMatchObject({
      id: big.approvalId,
      ruleRef: ruleId,
      risk: 'high',
      timeoutAction: 'escalate',
      confidence: 0.99,
    })
    expect(approval?.expiresAt).not.toBeNull()
    const assignees = await setup.db.tenant(setup.a.id, (tx) => tx.select().from(approvalAssignees))
    expect(assignees.map((row) => row.teamId)).toEqual([finance])
    expect(await triggered(setup)).toHaveLength(1)
  })

  it('keeps who approves with the broadest rule when an agent rule also matches', async () => {
    const setup = await setupGuard()
    const finance = await setup.addTeam('Finance', [])
    await makeRule(
      setup,
      approvalRuleBody('Finance approves refunds', 'payments.refund', [
        { type: 'team', id: finance },
      ]),
    )
    const result = await setup.engine().check(
      { orgId: setup.a.id },
      inputFor(setup, {
        guard: {
          ...NO_RULES,
          approvalRules: [
            {
              id: 'cheaper',
              match: { action: 'payments.refund' },
              approvers: [{ type: 'role', id: 'owner' }],
              waitMinutes: 30,
              onTimeout: 'reject',
              escalateTo: [],
              risk: 'high',
            },
          ],
        },
      }),
    )
    expect(result.outcome).toBe('human')
    expect(result.matchedRules.map((rule) => rule.type)).toEqual(['approval_rule', 'approval_rule'])
    const assignees = await setup.db.tenant(setup.a.id, (tx) => tx.select().from(approvalAssignees))
    expect(assignees.map((row) => row.teamId)).toEqual([finance])
    const [approval] = await approvalsOf(setup)
    expect(approval).toMatchObject({ risk: 'high', timeoutAction: 'reject' })
  })

  it('wins over a confident action, and a blocked action wins over an approval rule', async () => {
    const setup = await setupGuard()
    await makeRule(setup, approvalRuleBody('Refunds need approval', 'payments.refund'))
    const engine = setup.engine()
    expect(
      (await engine.check({ orgId: setup.a.id }, inputFor(setup, { confidence: 1 }))).outcome,
    ).toBe('human')
    await makeRule(setup, blockedBody('No refunds today', 'payments.refund'))
    const blocked = await engine.check({ orgId: setup.a.id }, inputFor(setup, { confidence: 1 }))
    expect(blocked).toMatchObject({ outcome: 'blocked', approvalId: null })
  })
})

describe('action limits', () => {
  const limitBody = (limit: Record<string, number>, onReached: 'block' | 'require_approval') => ({
    name: 'Refund limits',
    scope: 'organization',
    definition: {
      version: 1,
      kind: 'action_limit',
      match: { action: 'payments.refund' },
      limit,
      onReached,
    },
  })

  it('blocks an action above the per-action amount, or asks for approval when the rule says so', async () => {
    const setup = await setupGuard()
    const ruleId = await makeRule(setup, limitBody({ perActionAmountMicros: 200_000_000 }, 'block'))
    const engine = setup.engine()
    const blocked = await engine.check({ orgId: setup.a.id }, inputFor(setup))
    expect(blocked).toMatchObject({
      outcome: 'blocked',
      reasonCode: 'GUARD_ACTION_LIMIT',
      matchedRules: [{ ref: ruleId, type: 'action_limit' }],
    })
    const small = await engine.check(
      { orgId: setup.a.id },
      inputFor(setup, { action: { amountMicros: 150_000_000 } }),
    )
    expect(small.outcome).toBe('auto')
    await setup.call('adam', 'PATCH', `/guardrails/${ruleId}`, {
      definition: limitBody({ perActionAmountMicros: 200_000_000 }, 'require_approval').definition,
      reason: 'Finance reviews these instead',
    })
    const asked = await engine.check({ orgId: setup.a.id }, inputFor(setup))
    expect(asked.outcome).toBe('human')
    expect(asked.reasonCode).toBeNull()
    const [approval] = await approvalsOf(setup)
    expect(approval?.ruleRef).toBe(ruleId)
  })

  it('counts the actions that run today, not the ones waiting for a person, and starts again tomorrow', async () => {
    const setup = await setupGuard()
    await makeRule(setup, limitBody({ perDayCount: 2 }, 'block'))
    let now = new Date('2026-10-08T10:00:00Z')
    const engine = setup.engine({ now: () => now })
    const check = (overrides: Parameters<typeof inputFor>[1] = {}) =>
      engine.check({ orgId: setup.a.id }, inputFor(setup, overrides))
    expect((await check()).outcome).toBe('auto')
    // a low-confidence action waits for a person and does not use a place
    expect((await check({ confidence: 0.2 })).outcome).toBe('human')
    expect((await check()).outcome).toBe('auto')
    expect(await check()).toMatchObject({ outcome: 'blocked', reasonCode: 'GUARD_ACTION_LIMIT' })
    now = new Date('2026-10-09T00:30:00Z')
    expect((await check()).outcome).toBe('auto')
  })

  it('bounds the amount per day', async () => {
    const setup = await setupGuard()
    await makeRule(setup, limitBody({ perDayAmountMicros: 500_000_000 }, 'block'))
    const engine = setup.engine({ now: () => new Date('2026-10-08T10:00:00Z') })
    const check = () => engine.check({ orgId: setup.a.id }, inputFor(setup))
    expect((await check()).outcome).toBe('auto') // 340
    expect((await check()).outcome).toBe('blocked') // 340 + 340 > 500
  })

  it('gives each of several simultaneous actions a place or a refusal, never more places than the limit', async () => {
    const setup = await setupGuard()
    await makeRule(setup, limitBody({ perDayCount: 3 }, 'block'))
    const engine = setup.engine({ now: () => new Date('2026-10-08T10:00:00Z') })
    const results = await Promise.all(
      Array.from({ length: 8 }, () => engine.check({ orgId: setup.a.id }, inputFor(setup))),
    )
    expect(results.filter((result) => result.outcome === 'auto')).toHaveLength(3)
    expect(results.filter((result) => result.outcome === 'blocked')).toHaveLength(5)
  })

  it('applies the agent’s own limit next to the organization’s: the lowest wins', async () => {
    const setup = await setupGuard()
    await makeRule(setup, limitBody({ perDayCount: 5 }, 'block'))
    const engine = setup.engine({ now: () => new Date('2026-10-08T10:00:00Z') })
    const guard: AgentGuard = {
      ...NO_RULES,
      actionLimits: [
        {
          id: 'two-a-day',
          match: { action: 'payments.refund' },
          limit: { perDayCount: 2 },
          onReached: 'block',
        },
      ],
    }
    const outcomes: string[] = []
    for (let index = 0; index < 4; index++) {
      outcomes.push((await engine.check({ orgId: setup.a.id }, inputFor(setup, { guard }))).outcome)
    }
    expect(outcomes).toEqual(['auto', 'auto', 'blocked', 'blocked'])
  })
})
