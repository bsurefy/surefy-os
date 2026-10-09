// SPDX-License-Identifier: AGPL-3.0-only
import { eq } from 'drizzle-orm'
import { describe, expect, it } from 'vitest'

import {
  agentAccess,
  agentRuns,
  agentRunSteps,
  agents,
  agentVersions,
} from '@/database/tables/index.js'
import {
  createEmptyAgentDefinition,
  guardRuleRowDtoSchema,
  guardrailImpactDtoSchema,
} from '@surefy/contracts'
import type { AgentDefinition, AgentGuard, AgentStatus } from '@surefy/contracts'

import { newId } from '../../../../test/factories/index.js'
import { expectData, expectPage } from '../../../../test/helpers/request.js'
import { createGuardSubjects } from '../guard.subjects.js'
import { approvalRuleBody, blockedBody, makeRule, setupGuard } from './guardTestKit.js'

import type { GuardSetup } from './guardTestKit.js'

const subjects = createGuardSubjects()

const NO_RULES: AgentGuard = {
  thresholds: null,
  approvalRules: [],
  actionLimits: [],
  blockedActions: [],
}

interface PublishedAgent {
  name: string
  status?: AgentStatus
  guard?: Partial<AgentGuard>
  /** Who may use it besides the Owners and Admins: `org`, a team id or a user id. */
  sharedWith?: readonly ({ org: true } | { teamId: string } | { userId: string })[]
  ownerUserId?: string
  /** Published agents have a live version; drafts do not. */
  isPublished?: boolean
}

const subjectOf = (share: NonNullable<PublishedAgent['sharedWith']>[number]) => {
  if ('org' in share) return 'organization'
  return 'teamId' in share ? 'team' : 'user'
}

/** An agent of A as the product leaves it after a publish, written as a fixture. */
async function seedPublished(setup: GuardSetup, options: PublishedAgent): Promise<string> {
  const agentId = newId()
  const definition: AgentDefinition = {
    ...createEmptyAgentDefinition('openai/gpt-4.1'),
    guard: { ...NO_RULES, ...options.guard },
  }
  await setup.db.tenant(setup.a.id, async (tx) => {
    await tx.insert(agents).values({
      id: agentId,
      organizationId: setup.a.id,
      name: options.name,
      status: options.status ?? 'active',
      ownerUserId: options.ownerUserId ?? null,
      draftDefinition: definition,
    })
    if (options.isPublished !== false) {
      const [version] = await tx
        .insert(agentVersions)
        .values({ organizationId: setup.a.id, agentId, version: 1, definition })
        .returning({ id: agentVersions.id })
      await tx
        .update(agents)
        .set({ liveVersionId: version?.id ?? null })
        .where(eq(agents.id, agentId))
    }
    for (const share of options.sharedWith ?? []) {
      await tx.insert(agentAccess).values({
        organizationId: setup.a.id,
        agentId,
        subjectType: subjectOf(share),
        teamId: 'teamId' in share ? share.teamId : null,
        userId: 'userId' in share ? share.userId : null,
      })
    }
  })
  return agentId
}

const refundRules: Partial<AgentGuard> = {
  approvalRules: [
    {
      id: 'over-200',
      match: { action: 'payments.refund' },
      approvers: [{ type: 'role', id: 'admin' }],
      waitMinutes: 60,
      onTimeout: 'escalate',
      escalateTo: [{ type: 'role', id: 'owner' }],
      risk: 'medium',
    },
  ],
  actionLimits: [
    {
      id: 'daily',
      match: { action: 'payments.refund' },
      limit: { perDayCount: 5 },
      onReached: 'block',
    },
  ],
  blockedActions: [{ id: 'no-delete', match: { action: 'records.delete' } }],
}

describe('the agent and flow rules in the Guardrails table', () => {
  it('lists the rules of the live definitions, read-only, and none of drafts or archived agents', async () => {
    const setup = await setupGuard()
    const agentId = await seedPublished(setup, { name: 'Order desk', guard: refundRules })
    await seedPublished(setup, { name: 'Unpublished', guard: refundRules, isPublished: false })
    await seedPublished(setup, { name: 'Retired', guard: refundRules, status: 'archived' })

    const rows = expectPage(
      await setup.call('adam', 'GET', '/guardrails', undefined, { scope: 'agent' }),
      guardRuleRowDtoSchema,
    ).data
    expect(rows.map((row) => [row.ruleKey, row.type, row.name])).toEqual(
      expect.arrayContaining([
        ['over-200', 'approval_rule', 'Order desk: Approval rule payments.refund'],
        ['daily', 'action_limit', 'Order desk: Action limit payments.refund'],
        ['no-delete', 'blocked_action', 'Order desk: Blocked records.delete'],
      ]),
    )
    expect(rows).toHaveLength(3)
    expect(rows[0]).toMatchObject({
      id: agentId,
      scope: 'agent',
      usedByCount: 1,
      isEnabled: true,
      isLocked: false,
      editTarget: { type: 'agent', id: agentId },
    })
  })

  it('adds a row for an agent that sets its own thresholds', async () => {
    const setup = await setupGuard()
    await seedPublished(setup, {
      name: 'Careful',
      guard: { thresholds: { autoBp: 9500, reviewBp: 7000 } },
    })
    const rows = expectPage(
      await setup.call('adam', 'GET', '/guardrails', undefined, { type: 'threshold_override' }),
      guardRuleRowDtoSchema,
    ).data
    expect(rows.map((row) => [row.scope, row.name])).toEqual([
      ['agent', 'Careful: confidence thresholds'],
    ])
  })
})

describe('"Used by" and impact', () => {
  it('counts every published agent for an organization rule, and names them', async () => {
    const setup = await setupGuard()
    await seedPublished(setup, { name: 'Order desk' })
    await seedPublished(setup, { name: 'Paused desk', status: 'paused' })
    await seedPublished(setup, { name: 'Unpublished', isPublished: false })
    await seedPublished(setup, { name: 'Retired', status: 'archived' })
    const ruleId = await makeRule(setup, blockedBody('No deletes', 'records.delete'))

    const [row] = expectPage(
      await setup.call('adam', 'GET', '/guardrails', undefined, { type: 'blocked_action' }),
      guardRuleRowDtoSchema,
    ).data.filter((entry) => entry.id === ruleId)
    expect(row?.usedByCount).toBe(2)

    const impact = expectData(
      await setup.call('adam', 'GET', `/guardrails/${ruleId}/impact`),
      200,
      guardrailImpactDtoSchema,
    )
    expect(impact.dependents).toEqual([{ type: 'agent', count: 2 }])
    expect(impact.listed.map((entry) => entry.name)).toEqual(['Order desk', 'Paused desk'])
  })

  it('counts a team rule for the agents the team can use', async () => {
    const setup = await setupGuard()
    const teamId = await setup.addTeam('Finance', [setup.bella])
    await seedPublished(setup, { name: 'Shared with Finance', sharedWith: [{ teamId }] })
    await seedPublished(setup, { name: 'Shared with all', sharedWith: [{ org: true }] })
    await seedPublished(setup, {
      name: 'Shared with a member',
      sharedWith: [{ userId: setup.bella.id }],
    })
    await seedPublished(setup, { name: "A member's own", ownerUserId: setup.bella.id })
    const elsewhere = await setup.addTeam('Support', [])
    await seedPublished(setup, { name: 'Other team only', sharedWith: [{ teamId: elsewhere }] })
    await seedPublished(setup, { name: 'Private' })
    const ruleId = await makeRule(setup, {
      ...approvalRuleBody('Finance approvals', 'payments.refund'),
      scope: 'team',
      teamId,
    })

    const impact = expectData(
      await setup.call('adam', 'GET', `/guardrails/${ruleId}/impact`),
      200,
      guardrailImpactDtoSchema,
    )
    const byName = (left: string, right: string) => left.localeCompare(right)
    expect(impact.listed.map((entry) => entry.name).toSorted(byName)).toEqual(
      ["A member's own", 'Shared with Finance', 'Shared with a member', 'Shared with all'].toSorted(
        byName,
      ),
    )
    expect(impact.dependents).toEqual([{ type: 'agent', count: 4 }])
  })

  it('says nothing is affected when no agent is published', async () => {
    const setup = await setupGuard()
    const ruleId = await makeRule(setup, blockedBody('No deletes', 'records.delete'))
    const impact = expectData(
      await setup.call('adam', 'GET', `/guardrails/${ruleId}/impact`),
      200,
      guardrailImpactDtoSchema,
    )
    expect(impact).toEqual({ dependents: [], listed: [] })
  })
})

describe('what Guard reads from agents', () => {
  it('names agents, in the organization only', async () => {
    const setup = await setupGuard()
    const agentId = await seedPublished(setup, { name: 'Order desk' })
    const names = await setup.db.tenant(setup.a.id, (tx) =>
      subjects.agentNames(tx, setup.a.id, [agentId, newId()]),
    )
    expect([...names]).toEqual([[agentId, 'Order desk']])
    const crossed = await setup.db.tenant(setup.b.id, (tx) =>
      subjects.agentNames(tx, setup.b.id, [agentId]),
    )
    expect(crossed.size).toBe(0)
  })

  it('finds the agents whose own thresholds fell below the raised organization values', async () => {
    const setup = await setupGuard()
    const stale = await seedPublished(setup, {
      name: 'Stale',
      guard: { thresholds: { autoBp: 9000, reviewBp: 6000 } },
    })
    await seedPublished(setup, {
      name: 'Current',
      guard: { thresholds: { autoBp: 9600, reviewBp: 7500 } },
    })
    await seedPublished(setup, { name: 'Follows the organization' })
    const outdated = await setup.db.tenant(setup.a.id, (tx) =>
      subjects.outdatedThresholds(tx, setup.a.id, { autoBp: 9500, reviewBp: 7000 }),
    )
    expect(outdated).toEqual({ count: 1, firstAgentId: stale })
    const none = await setup.db.tenant(setup.a.id, (tx) =>
      subjects.outdatedThresholds(tx, setup.a.id, { autoBp: 9000, reviewBp: 6000 }),
    )
    expect(none).toEqual({ count: 0, firstAgentId: null })
  })

  it("reads the escalation of an agent's approval rule from the version that asked", async () => {
    const setup = await setupGuard()
    const agentId = await seedPublished(setup, { name: 'Order desk', guard: refundRules })
    const read = (version: number, ruleId: string) =>
      setup.db.tenant(setup.a.id, (tx) =>
        subjects.agentRuleEscalation(tx, setup.a.id, { agentId, version, ruleId }),
      )
    expect(await read(1, 'over-200')).toEqual([{ type: 'role', id: 'owner' }])
    expect(await read(1, 'missing')).toBeNull()
    expect(await read(2, 'over-200')).toBeNull()
  })
})

describe('what Guard reads from runs', () => {
  interface SeededStep {
    band: 'auto' | 'double_check' | 'human' | 'blocked'
    confidence?: number | null
    errorCode?: string | null
    isTest?: boolean
    at?: Date
    orgId?: string
  }

  /** One run with one step per entry, written as fixtures. */
  async function seedSteps(setup: GuardSetup, agentId: string, steps: readonly SeededStep[]) {
    for (const [index, step] of steps.entries()) {
      const orgId = step.orgId ?? setup.a.id
      const runId = newId()
      const at = step.at ?? new Date()
      await setup.db.tenant(orgId, async (tx) => {
        await tx.insert(agentRuns).values({
          id: runId,
          organizationId: orgId,
          agentId,
          trigger: step.isTest === true ? 'test' : 'api',
          isTest: step.isTest === true,
          status: 'succeeded',
          finishedAt: at,
        })
        await tx.insert(agentRunSteps).values({
          id: newId(),
          organizationId: orgId,
          runId,
          seq: index + 1,
          type: 'guard',
          name: 'Guard: Refund',
          status: step.band === 'blocked' ? 'blocked' : 'succeeded',
          confidence: step.confidence ?? null,
          guardBand: step.band,
          errorCode: step.errorCode ?? null,
          startedAt: at,
          createdAt: at,
        })
      })
    }
  }

  it('lists the latest confidences of checked steps, newest first, test runs included', async () => {
    const setup = await setupGuard()
    const agentId = await seedPublished(setup, { name: 'Order desk' })
    const now = Date.now()
    await seedSteps(setup, agentId, [
      { band: 'auto', confidence: 0.95, at: new Date(now - 3000) },
      { band: 'human', confidence: 0.4, at: new Date(now - 2000) },
      { band: 'auto', confidence: 0.99, isTest: true, at: new Date(now - 1500) },
      {
        band: 'blocked',
        confidence: null,
        errorCode: 'GUARD_BLOCKED_ACTION',
        at: new Date(now - 1000),
      },
      { band: 'double_check', confidence: 0.75, at: new Date(now) },
    ])
    const confidences = await setup.db.tenant(setup.a.id, (tx) =>
      subjects.recentConfidences(tx, setup.a.id, 10),
    )
    expect(confidences.map((value) => Math.round(value * 100))).toEqual([75, 99, 40, 95])
    const limited = await setup.db.tenant(setup.a.id, (tx) =>
      subjects.recentConfidences(tx, setup.a.id, 1),
    )
    expect(limited).toHaveLength(1)
  })

  it('counts what the checked steps of a day led to, per organization, without test runs', async () => {
    const setup = await setupGuard()
    const agentId = await seedPublished(setup, { name: 'Order desk' })
    const day = '2026-10-08'
    const noon = new Date(`${day}T12:00:00.000Z`)
    const otherDay = new Date('2026-10-09T00:00:00.000Z')
    await seedSteps(setup, agentId, [
      { band: 'auto', at: noon },
      { band: 'auto', at: noon },
      { band: 'double_check', at: noon },
      { band: 'human', at: noon },
      { band: 'blocked', errorCode: 'GUARD_BLOCKED_ACTION', at: noon },
      { band: 'blocked', errorCode: 'GUARD_ACTION_LIMIT', at: noon },
      { band: 'blocked', errorCode: 'GUARD_ACTION_LIMIT', at: noon },
      { band: 'auto', isTest: true, at: noon },
      { band: 'auto', at: otherDay },
    ])
    const counts = await setup.db.system('test', (tx) => subjects.actionCounts(tx, day))
    expect(counts.filter((entry) => entry.organizationId === setup.a.id)).toEqual([
      {
        organizationId: setup.a.id,
        auto: 2,
        doubleCheck: 1,
        human: 1,
        blockedRule: 1,
        blockedLimit: 2,
      },
    ])
    expect(counts.filter((entry) => entry.organizationId === setup.b.id)).toEqual([])
  })
})
