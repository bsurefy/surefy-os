// SPDX-License-Identifier: AGPL-3.0-only
import { and, eq, sql } from 'drizzle-orm'
import { describe, expect, it } from 'vitest'

import { auditLogs, outboxEvents } from '@/database/tables/index.js'
import {
  dataFiltersDtoSchema,
  ERROR_CODES,
  GUARD_ERROR_CODES,
  guardImpactPreviewDtoSchema,
  guardOverviewDtoSchema,
  guardrailDtoSchema,
  guardRuleRowDtoSchema,
  guardSettingsDtoSchema,
  piiRuleDtoSchema,
  testDataFilterResultDtoSchema,
} from '@surefy/contracts'

import { rulesCacheKey } from '../guard.constants.js'
import { EMPTY_SUBJECTS } from '../guard.types.js'
import {
  approvalRuleBody,
  blockedBody,
  guardUrl,
  setupGuard,
  type GuardSetup,
} from './guardTestKit.js'
import {
  expectData,
  expectError,
  expectNoContent,
  expectPage,
} from '../../../../test/helpers/request.js'

const auditEntries = async (setup: GuardSetup, action: string) =>
  setup.db.system('test', (tx) =>
    tx
      .select()
      .from(auditLogs)
      .where(and(eq(auditLogs.organizationId, setup.a.id), eq(auditLogs.action, action))),
  )

const events = async (setup: GuardSetup, topic: string) =>
  setup.db.system('test', (tx) =>
    tx
      .select()
      .from(outboxEvents)
      .where(and(eq(outboxEvents.organizationId, setup.a.id), eq(outboxEvents.topic, topic))),
  )

const createRule = async (setup: GuardSetup, body: unknown, who: 'adam' | 'olivia' = 'adam') =>
  expectData(await setup.call(who, 'POST', '/guardrails', body), 201, guardrailDtoSchema)

const DEFAULTS = {
  autoThresholdBp: 9000,
  reviewThresholdBp: 6000,
  quickApproveMaxAmountMicros: 0,
  quickApproveMaxRisk: 'low',
  stepUpAmountMicros: null,
  targetDecisionMinutes: 60,
} as const

describe('who may use Guard', () => {
  it('lets Builders read and Admins change, and keeps Users out', async () => {
    const setup = await setupGuard()
    expectError(await setup.call('uma', 'GET', '/defaults'), 403, ERROR_CODES.ACCESS_FORBIDDEN)
    expectData(await setup.call('bella', 'GET', '/defaults'), 200, guardSettingsDtoSchema)
    expectData(await setup.call('adam', 'GET', '/defaults'), 200, guardSettingsDtoSchema)
    expectError(
      await setup.call('bella', 'PUT', '/defaults', DEFAULTS),
      403,
      ERROR_CODES.ACCESS_FORBIDDEN,
    )
    expectError(
      await setup.call('bella', 'POST', '/guardrails', blockedBody('Nope', 'x.y')),
      403,
      ERROR_CODES.ACCESS_FORBIDDEN,
    )
    expectError(
      await setup.call('adam', 'POST', '/guardrails/0198f3a0-0000-7000-8000-000000000001/lock', {
        reason: 'x',
      }),
      403,
      ERROR_CODES.ACCESS_FORBIDDEN,
    )
  })
})

describe('defaults', () => {
  it('answers the code defaults until the organization saves its own', async () => {
    const setup = await setupGuard()
    const defaults = expectData(
      await setup.call('adam', 'GET', '/defaults'),
      200,
      guardSettingsDtoSchema,
    )
    expect(defaults).toMatchObject({
      ...DEFAULTS,
      currency: 'USD',
      isCustomized: false,
      updatedBy: null,
      updatedAt: null,
    })
  })

  it('saves stricter values directly, with the values before and after in the audit entry', async () => {
    const setup = await setupGuard()
    const saved = expectData(
      await setup.call('adam', 'PUT', '/defaults', {
        ...DEFAULTS,
        autoThresholdBp: 9500,
        reviewThresholdBp: 7000,
        stepUpAmountMicros: 500_000_000,
      }),
      200,
      guardSettingsDtoSchema,
    )
    expect(saved).toMatchObject({ autoThresholdBp: 9500, isCustomized: true })
    expect(saved.updatedBy?.id).toBe(setup.a.members.adam.id)
    const [entry] = await auditEntries(setup, 'guard.defaults_changed')
    expect(entry?.targetType).toBe('guard_settings')
    expect(entry?.metadata.changes).toEqual(
      expect.arrayContaining([{ field: 'autoThresholdBp', from: 9000, to: 9500 }]),
    )
    expect(await events(setup, 'guard.rules_changed')).toHaveLength(1)
  })

  it('needs a reason to loosen anything, and records it', async () => {
    const setup = await setupGuard()
    const loosened = { ...DEFAULTS, autoThresholdBp: 8000 }
    expectError(
      await setup.call('adam', 'PUT', '/defaults', loosened),
      422,
      GUARD_ERROR_CODES.GUARD_REASON_REQUIRED,
    )
    expectData(
      await setup.call('adam', 'PUT', '/defaults', {
        ...loosened,
        reason: 'Pilot with the support team',
      }),
      200,
      guardSettingsDtoSchema,
    )
    const [entry] = await auditEntries(setup, 'guard.defaults_changed')
    expect(entry?.reason).toBe('Pilot with the support team')
    // raising the quick-approve amount and clearing the step-up amount loosen too
    expectError(
      await setup.call('adam', 'PUT', '/defaults', {
        ...loosened,
        quickApproveMaxAmountMicros: 50_000_000,
      }),
      422,
      GUARD_ERROR_CODES.GUARD_REASON_REQUIRED,
    )
  })

  it('refuses a review threshold at or above the automatic one', async () => {
    const setup = await setupGuard()
    const response = await setup.call('adam', 'PUT', '/defaults', {
      ...DEFAULTS,
      reviewThresholdBp: 9000,
    })
    expectError(response, 422, ERROR_CODES.VALIDATION_FAILED)
  })

  it('applies the saved values to the next check without waiting for the cache', async () => {
    const setup = await setupGuard()
    const ruleSets = setup.container.modules.guard.settings
    expect(await ruleSets.organizationThresholds(setup.a.id)).toEqual({
      autoBp: 9000,
      reviewBp: 6000,
    })
    expectData(
      await setup.call('adam', 'PUT', '/defaults', {
        ...DEFAULTS,
        autoThresholdBp: 9700,
        reviewThresholdBp: 8000,
      }),
      200,
      guardSettingsDtoSchema,
    )
    expect(await ruleSets.organizationThresholds(setup.a.id)).toEqual({
      autoBp: 9700,
      reviewBp: 8000,
    })
  })

  it('drops the cached rule set when the outbox event is handled', async () => {
    const setup = await setupGuard()
    await setup.container.modules.guard.settings.organizationThresholds(setup.a.id)
    expect(await setup.container.cache.get(rulesCacheKey(setup.a.id))).not.toBeNull()
    const handler = setup.container.modules.guard.outboxHandlers[0]
    await handler?.handle({
      eventId: '0198f3a0-0000-7000-8000-0000000000e1',
      orgId: setup.a.id,
      topic: 'guard.rules_changed',
      payload: { version: 1 },
    })
    expect(await setup.container.cache.get(rulesCacheKey(setup.a.id))).toBeNull()
  })
})

describe('impact preview', () => {
  it('bands the recent confidences with the proposed thresholds', async () => {
    const confidences = [0.95, 0.91, 0.8, 0.7, 0.62, 0.5, 0.2]
    const setup = await setupGuard({
      guard: {
        subjects: { ...EMPTY_SUBJECTS, recentConfidences: () => Promise.resolve(confidences) },
      },
    })
    const impact = expectData(
      await setup.call('bella', 'GET', '/defaults/impact', undefined, {
        autoThresholdBp: '9000',
        reviewThresholdBp: '6000',
      }),
      200,
      guardImpactPreviewDtoSchema,
    )
    expect(impact).toEqual({ sampleSize: 7, auto: 2, doubleCheck: 3, human: 2 })
    const stricter = expectData(
      await setup.call('bella', 'GET', '/defaults/impact', undefined, {
        autoThresholdBp: '9600',
        reviewThresholdBp: '8500',
      }),
      200,
      guardImpactPreviewDtoSchema,
    )
    expect(stricter).toEqual({ sampleSize: 7, auto: 0, doubleCheck: 2, human: 5 })
  })

  it('answers an empty sample before any action was checked', async () => {
    const setup = await setupGuard()
    const impact = expectData(
      await setup.call('adam', 'GET', '/defaults/impact', undefined, {
        autoThresholdBp: '9000',
        reviewThresholdBp: '6000',
      }),
      200,
      guardImpactPreviewDtoSchema,
    )
    expect(impact).toEqual({ sampleSize: 0, auto: 0, doubleCheck: 0, human: 0 })
  })
})

describe('guardrails', () => {
  it('creates a rule, shows it in the table and reads it back', async () => {
    const setup = await setupGuard()
    const rule = await createRule(setup, blockedBody('No price changes', 'prices.update'))
    expect(rule).toMatchObject({
      name: 'No price changes',
      type: 'blocked_action',
      scope: 'organization',
      isEnabled: true,
      isLocked: false,
      conflictsWith: null,
    })
    expect(rule.createdBy?.id).toBe(setup.a.members.adam.id)
    const table = expectPage(await setup.call('adam', 'GET', '/guardrails'), guardRuleRowDtoSchema)
    expect(table.data).toHaveLength(1)
    expect(table.data[0]).toMatchObject({
      id: rule.id,
      type: 'blocked_action',
      triggeredThisWeek: 0,
      editTarget: null,
    })
    expectData(await setup.call('bella', 'GET', `/guardrails/${rule.id}`), 200, guardrailDtoSchema)
    expect(await auditEntries(setup, 'guardrail.created')).toHaveLength(1)
    expect(await events(setup, 'guard.rules_changed')).toHaveLength(1)
  })

  it('keeps names unique per organization, ignoring case', async () => {
    const setup = await setupGuard()
    await createRule(setup, blockedBody('No price changes', 'prices.update'))
    expectError(
      await setup.call('adam', 'POST', '/guardrails', blockedBody('no PRICE changes', 'x.y')),
      409,
      GUARD_ERROR_CODES.GUARD_RULE_NAME_TAKEN,
    )
  })

  it('reports another enabled rule that blocks the same action', async () => {
    const setup = await setupGuard()
    const first = await createRule(setup, blockedBody('No price changes', 'prices.update'))
    const second = await createRule(setup, blockedBody('Prices are frozen', 'prices.update'))
    expect(second.conflictsWith).toEqual({ id: first.id, name: 'No price changes' })
    const other = await createRule(setup, blockedBody('No deletes', 'records.delete'))
    expect(other.conflictsWith).toBeNull()
  })

  it('files a team rule under its team and keeps it from other teams’ Builders', async () => {
    const setup = await setupGuard()
    const sales = await setup.addTeam('Sales', [setup.bella])
    const finance = await setup.addTeam('Finance', [])
    await createRule(setup, blockedBody('Org rule', 'a.b'))
    await createRule(setup, blockedBody('Sales rule', 'a.c', { scope: 'team', teamId: sales }))
    await createRule(setup, blockedBody('Finance rule', 'a.d', { scope: 'team', teamId: finance }))
    const forAdmin = expectPage(
      await setup.call('adam', 'GET', '/guardrails'),
      guardRuleRowDtoSchema,
    )
    expect(forAdmin.data.map((row) => row.name).sort((a, b) => a.localeCompare(b))).toEqual([
      'Finance rule',
      'Org rule',
      'Sales rule',
    ])
    const forBella = expectPage(
      await setup.call('bella', 'GET', '/guardrails'),
      guardRuleRowDtoSchema,
    )
    expect(forBella.data.map((row) => row.name).sort((a, b) => a.localeCompare(b))).toEqual([
      'Org rule',
      'Sales rule',
    ])
    expect(forBella.data.find((row) => row.name === 'Sales rule')?.team?.name).toBe('Sales')
  })

  it('rejects a team that does not exist', async () => {
    const setup = await setupGuard()
    expectError(
      await setup.call(
        'adam',
        'POST',
        '/guardrails',
        blockedBody('Ghost team', 'a.b', {
          scope: 'team',
          teamId: '0198f3a0-0000-7000-8000-000000000042',
        }),
      ),
      422,
      ERROR_CODES.VALIDATION_FAILED,
    )
  })

  it('filters, searches, sorts and pages the table', async () => {
    const setup = await setupGuard()
    await createRule(setup, blockedBody('Alpha block', 'a.one'))
    await createRule(setup, approvalRuleBody('Beta approval', 'b.one'))
    await createRule(setup, blockedBody('Gamma block', 'c.one'))
    const names = async (query: Record<string, string>) =>
      expectPage(
        await setup.call('adam', 'GET', '/guardrails', undefined, query),
        guardRuleRowDtoSchema,
      ).data.map((row) => row.name)
    expect(await names({ type: 'approval_rule' })).toEqual(['Beta approval'])
    expect(await names({ q: 'block' })).toEqual(['Alpha block', 'Gamma block'])
    expect(await names({ sort: '-name' })).toEqual(['Gamma block', 'Beta approval', 'Alpha block'])
    const first = expectPage(
      await setup.call('adam', 'GET', '/guardrails', undefined, { limit: '2' }),
      guardRuleRowDtoSchema,
    )
    expect(first.data).toHaveLength(2)
    expect(first.nextCursor).not.toBeNull()
    const second = expectPage(
      await setup.call('adam', 'GET', '/guardrails', undefined, {
        limit: '2',
        cursor: first.nextCursor ?? '',
      }),
      guardRuleRowDtoSchema,
    )
    expect(second.data.map((row) => row.name)).toEqual(['Gamma block'])
    expect(second.nextCursor).toBeNull()
  })

  it('renames and tightens a rule directly', async () => {
    const setup = await setupGuard()
    const rule = expectData(
      await setup.call(
        'adam',
        'POST',
        '/guardrails',
        approvalRuleBody('Refunds', 'payments.refund', undefined, { risk: 'low' }),
      ),
      201,
      guardrailDtoSchema,
    )
    const updated = expectData(
      await setup.call('adam', 'PATCH', `/guardrails/${rule.id}`, {
        name: 'Refund approvals',
        definition: approvalRuleBody('x', 'payments.refund', undefined, { risk: 'high' })
          .definition,
      }),
      200,
      guardrailDtoSchema,
    )
    expect(updated.name).toBe('Refund approvals')
    expect(updated.updatedBy?.id).toBe(setup.a.members.adam.id)
    expect(await auditEntries(setup, 'guardrail.updated')).toHaveLength(1)
  })

  it('needs a reason to turn a rule off or loosen it', async () => {
    const setup = await setupGuard()
    const rule = expectData(
      await setup.call(
        'adam',
        'POST',
        '/guardrails',
        approvalRuleBody('Refunds', 'payments.refund'),
      ),
      201,
      guardrailDtoSchema,
    )
    expectError(
      await setup.call('adam', 'PATCH', `/guardrails/${rule.id}`, { isEnabled: false }),
      422,
      GUARD_ERROR_CODES.GUARD_REASON_REQUIRED,
    )
    expectError(
      await setup.call('adam', 'PATCH', `/guardrails/${rule.id}`, {
        definition: approvalRuleBody('x', 'payments.refund', undefined, { risk: 'low' }).definition,
      }),
      422,
      GUARD_ERROR_CODES.GUARD_REASON_REQUIRED,
    )
    const off = expectData(
      await setup.call('adam', 'PATCH', `/guardrails/${rule.id}`, {
        isEnabled: false,
        reason: 'Finance reviews these by hand this month',
      }),
      200,
      guardrailDtoSchema,
    )
    expect(off.isEnabled).toBe(false)
    const [entry] = await auditEntries(setup, 'guardrail.updated')
    expect(entry?.reason).toBe('Finance reviews these by hand this month')
    // turning it back on tightens: no reason
    expectData(
      await setup.call('adam', 'PATCH', `/guardrails/${rule.id}`, { isEnabled: true }),
      200,
      guardrailDtoSchema,
    )
  })

  it('keeps a rule’s type', async () => {
    const setup = await setupGuard()
    const rule = await createRule(setup, blockedBody('No deletes', 'records.delete'))
    expectError(
      await setup.call('adam', 'PATCH', `/guardrails/${rule.id}`, {
        definition: approvalRuleBody('x', 'records.delete').definition,
      }),
      422,
      GUARD_ERROR_CODES.GUARD_RULE_TYPE_IMMUTABLE,
    )
  })

  it('deletes with a reason while the rule is on, and without one when it is off', async () => {
    const setup = await setupGuard()
    const rule = await createRule(setup, blockedBody('No deletes', 'records.delete'))
    expectError(
      await setup.call('adam', 'DELETE', `/guardrails/${rule.id}`),
      422,
      GUARD_ERROR_CODES.GUARD_REASON_REQUIRED,
    )
    expectNoContent(
      await setup.call('adam', 'DELETE', `/guardrails/${rule.id}`, undefined, {
        reason: 'Retired',
      }),
    )
    expectError(
      await setup.call('adam', 'GET', `/guardrails/${rule.id}`),
      404,
      GUARD_ERROR_CODES.GUARD_RULE_NOT_FOUND,
    )
    const [entry] = await auditEntries(setup, 'guardrail.deleted')
    expect(entry?.reason).toBe('Retired')
    const off = await createRule(setup, blockedBody('Old rule', 'x.y', { isEnabled: false }))
    expectNoContent(await setup.call('adam', 'DELETE', `/guardrails/${off.id}`))
  })

  it('lets only Owners lock, unlock and change a locked rule', async () => {
    const setup = await setupGuard()
    const rule = await createRule(setup, blockedBody('No price changes', 'prices.update'))
    expectError(
      await setup.call('adam', 'POST', `/guardrails/${rule.id}/lock`, { reason: 'Board decision' }),
      403,
      ERROR_CODES.ACCESS_FORBIDDEN,
    )
    const locked = expectData(
      await setup.call('olivia', 'POST', `/guardrails/${rule.id}/lock`, {
        reason: 'Board decision',
      }),
      200,
      guardrailDtoSchema,
    )
    expect(locked).toMatchObject({ isLocked: true, lockedReason: 'Board decision' })
    expect(locked.lockedBy?.id).toBe(setup.a.members.olivia.id)
    expectError(
      await setup.call('adam', 'PATCH', `/guardrails/${rule.id}`, { name: 'Renamed' }),
      403,
      GUARD_ERROR_CODES.GUARD_RULE_LOCKED,
    )
    expectError(
      await setup.call('adam', 'DELETE', `/guardrails/${rule.id}`, undefined, { reason: 'x' }),
      403,
      GUARD_ERROR_CODES.GUARD_RULE_LOCKED,
    )
    expectData(
      await setup.call('olivia', 'PATCH', `/guardrails/${rule.id}`, { name: 'Renamed' }),
      200,
      guardrailDtoSchema,
    )
    const unlocked = expectData(
      await setup.call('olivia', 'POST', `/guardrails/${rule.id}/unlock`),
      200,
      guardrailDtoSchema,
    )
    expect(unlocked).toMatchObject({ isLocked: false, lockedBy: null, lockedReason: null })
    expect(await auditEntries(setup, 'guardrail.locked')).toHaveLength(1)
    expect(await auditEntries(setup, 'guardrail.unlocked')).toHaveLength(1)
  })

  it('names the agents and flows a rule applies to', async () => {
    const agentId = '0198f3a0-0000-7000-8000-0000000000a9'
    const setup = await setupGuard({
      guard: {
        subjects: {
          ...EMPTY_SUBJECTS,
          impact: () =>
            Promise.resolve({
              dependents: [{ type: 'agent', count: 3 }],
              listed: [{ type: 'agent', id: agentId, name: 'Refund agent' }],
            }),
        },
      },
    })
    const rule = await createRule(setup, blockedBody('No deletes', 'records.delete'))
    const impact = expectData(
      await setup.call('adam', 'GET', `/guardrails/${rule.id}/impact`),
      200,
      (await import('@surefy/contracts')).guardrailImpactDtoSchema,
    )
    expect(impact.dependents).toEqual([{ type: 'agent', count: 3 }])
  })

  it('lists the agent and flow rules and the data filters read-only', async () => {
    const agentId = '0198f3a0-0000-7000-8000-0000000000a9'
    const setup = await setupGuard({
      guard: {
        subjects: {
          ...EMPTY_SUBJECTS,
          ruleRows: () =>
            Promise.resolve([
              {
                id: agentId,
                ruleKey: 'r1',
                name: 'Refund agent: approve over $200',
                type: 'approval_rule',
                scope: 'agent',
                team: null,
                usedByCount: 1,
                triggeredThisWeek: 0,
                isEnabled: true,
                isLocked: false,
                lockedBy: null,
                lockedReason: null,
                editTarget: { type: 'agent', id: agentId },
              },
            ]),
        },
      },
    })
    expectData(
      await setup.call('adam', 'POST', '/pii-rules', {
        piiType: 'phone',
        action: 'block',
        scope: 'organization',
      }),
      201,
      piiRuleDtoSchema,
    )
    const rows = expectPage(
      await setup.call('adam', 'GET', '/guardrails'),
      guardRuleRowDtoSchema,
    ).data
    expect(rows.find((row) => row.scope === 'agent')?.editTarget).toEqual({
      type: 'agent',
      id: agentId,
    })
    expect(rows.find((row) => row.type === 'data_filter')?.editTarget).toEqual({
      type: 'data_filters',
      id: null,
    })
  })

  it('counts "triggered this week" from the audit entries of the rule', async () => {
    const setup = await setupGuard()
    const rule = await createRule(setup, blockedBody('No deletes', 'records.delete'))
    await setup.db.tenant(setup.a.id, (tx) =>
      setup.container.modules.audit.service.record(
        tx,
        { orgId: setup.a.id, userId: null, via: 'system' },
        { action: 'guard.rule_triggered', target: { type: 'guardrail', id: rule.id } },
      ),
    )
    const [row] = expectPage(
      await setup.call('adam', 'GET', '/guardrails'),
      guardRuleRowDtoSchema,
    ).data
    expect(row?.triggeredThisWeek).toBe(1)
  })
})

describe('data filters', () => {
  it('lists every built-in type with its default, and the saved rules and exceptions', async () => {
    const setup = await setupGuard()
    const fresh = expectData(
      await setup.call('bella', 'GET', '/data-filters'),
      200,
      dataFiltersDtoSchema,
    )
    expect(fresh.items).toHaveLength(7)
    expect(fresh.items.find((item) => item.piiType === 'payment_card')).toMatchObject({
      action: 'block',
      source: 'default',
      ruleId: null,
    })
    const finance = await setup.addTeam('Finance', [])
    expectData(
      await setup.call('adam', 'POST', '/pii-rules', {
        piiType: 'email',
        action: 'detect',
        scope: 'team',
        teamId: finance,
        reason: 'Finance writes to customers',
      }),
      201,
      piiRuleDtoSchema,
    )
    const withException = expectData(
      await setup.call('adam', 'GET', '/data-filters'),
      200,
      dataFiltersDtoSchema,
    )
    const email = withException.items.find((item) => item.piiType === 'email')
    expect(email?.exceptions).toHaveLength(1)
    expect(email?.exceptions[0]).toMatchObject({ scope: 'team', action: 'detect' })
    expect(email?.exceptions[0]?.team?.name).toBe('Finance')
  })

  it('needs a reason to loosen a type or add an exception', async () => {
    const setup = await setupGuard()
    expectError(
      await setup.call('adam', 'POST', '/pii-rules', {
        piiType: 'payment_card',
        action: 'mask',
        scope: 'organization',
      }),
      422,
      GUARD_ERROR_CODES.GUARD_REASON_REQUIRED,
    )
    const stricter = expectData(
      await setup.call('adam', 'POST', '/pii-rules', {
        piiType: 'email',
        action: 'block',
        scope: 'organization',
      }),
      201,
      piiRuleDtoSchema,
    )
    expect(stricter).toMatchObject({ piiType: 'email', action: 'block' })
    expectError(
      await setup.call('adam', 'PATCH', `/pii-rules/${stricter.id}`, { action: 'detect' }),
      422,
      GUARD_ERROR_CODES.GUARD_REASON_REQUIRED,
    )
    const looser = expectData(
      await setup.call('adam', 'PATCH', `/pii-rules/${stricter.id}`, {
        action: 'detect',
        reason: 'Support needs them',
      }),
      200,
      piiRuleDtoSchema,
    )
    expect(looser.action).toBe('detect')
    const [entry] = await auditEntries(setup, 'pii_rule.updated')
    expect(entry?.reason).toBe('Support needs them')
  })

  it('keeps one rule per type and scope', async () => {
    const setup = await setupGuard()
    const body = { piiType: 'email', action: 'block', scope: 'organization' }
    expectData(await setup.call('adam', 'POST', '/pii-rules', body), 201, piiRuleDtoSchema)
    expectError(
      await setup.call('adam', 'POST', '/pii-rules', body),
      409,
      GUARD_ERROR_CODES.GUARD_PII_RULE_DUPLICATE,
    )
  })

  it('stores a custom type with its pattern and refuses a bad one', async () => {
    const setup = await setupGuard()
    const custom = expectData(
      await setup.call('adam', 'POST', '/pii-rules', {
        piiType: 'custom',
        customLabel: 'Employee ID',
        customPattern: 'EMP-\\d{6}',
        action: 'mask',
        scope: 'organization',
      }),
      201,
      piiRuleDtoSchema,
    )
    expect(custom).toMatchObject({ customLabel: 'Employee ID', customPattern: 'EMP-\\d{6}' })
    for (const customPattern of ['(unclosed', '(a+)+', 'a'.repeat(400) + '{5000}']) {
      expectError(
        await setup.call('adam', 'POST', '/pii-rules', {
          piiType: 'custom',
          customLabel: 'Bad',
          customPattern,
          action: 'mask',
          scope: 'organization',
        }),
        422,
        GUARD_ERROR_CODES.GUARD_PII_PATTERN_INVALID,
      )
    }
    const list = expectData(
      await setup.call('adam', 'GET', '/data-filters'),
      200,
      dataFiltersDtoSchema,
    )
    expect(list.items.filter((item) => item.piiType === 'custom')).toHaveLength(1)
  })

  it('lets an exception for a custom type follow the organization’s definition', async () => {
    const setup = await setupGuard()
    const team = await setup.addTeam('Support', [])
    expectError(
      await setup.call('adam', 'POST', '/pii-rules', {
        piiType: 'custom',
        customLabel: 'Employee ID',
        customPattern: 'EMP-\\d{6}',
        action: 'detect',
        scope: 'team',
        teamId: team,
        reason: 'x',
      }),
      422,
      ERROR_CODES.VALIDATION_FAILED,
    )
    const org = expectData(
      await setup.call('adam', 'POST', '/pii-rules', {
        piiType: 'custom',
        customLabel: 'Employee ID',
        customPattern: 'EMP-\\d{6}',
        action: 'mask',
        scope: 'organization',
      }),
      201,
      piiRuleDtoSchema,
    )
    const exception = expectData(
      await setup.call('adam', 'POST', '/pii-rules', {
        piiType: 'custom',
        customLabel: 'employee id',
        customPattern: 'ignored-in-favour-of-the-organizations',
        action: 'detect',
        scope: 'team',
        teamId: team,
        reason: 'Support reads them',
      }),
      201,
      piiRuleDtoSchema,
    )
    expect(exception.customPattern).toBe('EMP-\\d{6}')
    // changing the pattern carries over to the exception
    expectData(
      await setup.call('adam', 'PATCH', `/pii-rules/${org.id}`, { customPattern: 'EMP-\\d{8}' }),
      200,
      piiRuleDtoSchema,
    )
    const list = expectData(
      await setup.call('adam', 'GET', '/data-filters'),
      200,
      dataFiltersDtoSchema,
    )
    const item = list.items.find((entry) => entry.piiType === 'custom')
    expect(item?.exceptions[0]?.customPattern).toBe('EMP-\\d{8}')
  })

  it('falls back to the next level when a rule is removed', async () => {
    const setup = await setupGuard()
    const team = await setup.addTeam('Support', [])
    const org = expectData(
      await setup.call('adam', 'POST', '/pii-rules', {
        piiType: 'email',
        action: 'block',
        scope: 'organization',
      }),
      201,
      piiRuleDtoSchema,
    )
    const exception = expectData(
      await setup.call('adam', 'POST', '/pii-rules', {
        piiType: 'email',
        action: 'detect',
        scope: 'team',
        teamId: team,
        reason: 'Support writes to customers',
      }),
      201,
      piiRuleDtoSchema,
    )
    // removing the exception puts the stricter organization row back in force: no reason
    expectNoContent(await setup.call('adam', 'DELETE', `/pii-rules/${exception.id}`))
    // removing the organization row falls back to the code default (mask), which is looser than block
    expectError(
      await setup.call('adam', 'DELETE', `/pii-rules/${org.id}`),
      422,
      GUARD_ERROR_CODES.GUARD_REASON_REQUIRED,
    )
    expectNoContent(
      await setup.call('adam', 'DELETE', `/pii-rules/${org.id}`, undefined, {
        reason: 'Back to default',
      }),
    )
    expectError(
      await setup.call('adam', 'DELETE', `/pii-rules/${org.id}`),
      404,
      GUARD_ERROR_CODES.GUARD_PII_RULE_NOT_FOUND,
    )
  })

  it('tries a text: the masked text, the types found and whether a real request would stop', async () => {
    const setup = await setupGuard()
    const masked = expectData(
      await setup.call('adam', 'POST', '/data-filters/test', {
        text: 'Write to ana@acme.test about it',
      }),
      200,
      testDataFilterResultDtoSchema,
    )
    expect(masked).toEqual({
      maskedText: 'Write to [EMAIL] about it',
      blocked: false,
      findings: [{ piiType: 'email', customLabel: null, action: 'mask', count: 1 }],
    })
    const blocked = expectData(
      await setup.call('adam', 'POST', '/data-filters/test', {
        text: 'Card 4111-1111-1111-1111 and ana@acme.test',
      }),
      200,
      testDataFilterResultDtoSchema,
    )
    expect(blocked.blocked).toBe(true)
    expect(
      blocked.findings.map((finding) => finding.piiType).sort((a, b) => a.localeCompare(b)),
    ).toEqual(['email', 'payment_card'])
  })

  it('tries a pattern before it is saved, and reports one the service rejects', async () => {
    const setup = await setupGuard()
    const result = expectData(
      await setup.call('adam', 'POST', '/data-filters/test', {
        text: 'Badge EMP-123456 entered',
        customLabel: 'Employee ID',
        customPattern: 'EMP-\\d{6}',
      }),
      200,
      testDataFilterResultDtoSchema,
    )
    expect(result.maskedText).toBe('Badge [EMPLOYEE ID] entered')
    expect(result.findings).toEqual([
      { piiType: 'custom', customLabel: 'Employee ID', action: 'mask', count: 1 },
    ])
    setup.pii.failWith = new (await import('@/integrations/ml/index.js')).MlInputError(
      'ML_VALIDATION_FAILED',
      'ML_VALIDATION_FAILED',
    )
    expectError(
      await setup.call('adam', 'POST', '/data-filters/test', { text: 'anything' }),
      422,
      GUARD_ERROR_CODES.GUARD_PII_PATTERN_INVALID,
    )
  })

  it('answers 503 when the service behind the filter is not reachable', async () => {
    const setup = await setupGuard()
    const { MlUnavailableError } = await import('@/integrations/ml/index.js')
    setup.pii.failWith = new MlUnavailableError('down', 'ML_INTERNAL_ERROR')
    expectError(
      await setup.call('adam', 'POST', '/data-filters/test', { text: 'anything' }),
      503,
      ERROR_CODES.SERVICE_UNAVAILABLE,
    )
  })

  it('shows a team’s exception in the try-it box', async () => {
    const setup = await setupGuard()
    const team = await setup.addTeam('Support', [])
    expectData(
      await setup.call('adam', 'POST', '/pii-rules', {
        piiType: 'email',
        action: 'detect',
        scope: 'team',
        teamId: team,
        reason: 'Support writes to customers',
      }),
      201,
      piiRuleDtoSchema,
    )
    const asSupport = expectData(
      await setup.call('adam', 'POST', '/data-filters/test', {
        text: 'ana@acme.test',
        teamId: team,
      }),
      200,
      testDataFilterResultDtoSchema,
    )
    expect(asSupport).toMatchObject({ maskedText: 'ana@acme.test', blocked: false })
    expect(asSupport.findings[0]?.action).toBe('detect')
  })
})

describe('overview', () => {
  it('sums the days of the range from the statistics the rollup rebuilt', async () => {
    const setup = await setupGuard({
      guard: {
        subjects: {
          ...EMPTY_SUBJECTS,
          actionCounts: (_tx, day) =>
            Promise.resolve(
              day === new Date().toISOString().slice(0, 10)
                ? [
                    {
                      organizationId: '',
                      auto: 0,
                      doubleCheck: 0,
                      human: 0,
                      blockedRule: 0,
                      blockedLimit: 0,
                    },
                  ]
                : [],
            ),
        },
      },
    })
    // the fake above is replaced below by real counts for A
    const orgId = setup.a.id
    const today = new Date().toISOString().slice(0, 10)
    await setup.ownerSql(sql`
      insert into guard_stats_daily (organization_id, day, actions_auto, actions_double_check,
        actions_human, actions_blocked_limit, pii_masked_requests, local_requests)
      values (${orgId}, ${today}::date, 80, 12, 5, 3, 9, 14),
             (${orgId}, (${today}::date - 3), 20, 8, 5, 1, 1, 6),
             (${orgId}, (${today}::date - 20), 1000, 1000, 1000, 1000, 1000, 1000)`)
    const week = expectData(
      await setup.call('adam', 'GET', '/overview'),
      200,
      guardOverviewDtoSchema,
    )
    expect(week).toMatchObject({
      range: '7d',
      auto: 100,
      doubleChecked: 20,
      needsPerson: 10,
      blockedByLimits: 4,
      personalDataHidden: 10,
      ranOnLocalModels: 20,
      medianMinutesToApprove: null,
      attention: [],
    })
    const month = expectData(
      await setup.call('adam', 'GET', '/overview', undefined, { range: '30d' }),
      200,
      guardOverviewDtoSchema,
    )
    expect(month.auto).toBe(1100)
  })

  it('reports overdue approvals, the median time to approve and conflicting rules', async () => {
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
    const stale = await create('Old request')
    await setup.ownerSql(
      sql`update approvals set created_at = now() - interval '3 hours' where id = ${stale.id}`,
    )
    const decided = await create('Decided request')
    await setup.ownerSql(sql`
      update approvals set status = 'approved', resolved_by = 'user', decided_by_user_id = ${setup.a.members.uma.id},
        created_at = now() - interval '30 minutes', decided_at = now() - interval '20 minutes'
      where id = ${decided.id}`)
    const first = await createRule(setup, blockedBody('No price changes', 'prices.update'))
    await createRule(setup, blockedBody('Prices are frozen', 'prices.update'))
    const overview = expectData(
      await setup.call('adam', 'GET', '/overview'),
      200,
      guardOverviewDtoSchema,
    )
    expect(overview.medianMinutesToApprove).toBe(10)
    expect(overview.attention).toEqual([
      { kind: 'approvals_overdue', count: 1, target: { type: 'approvals', id: null } },
      { kind: 'guardrail_conflict', count: 2, target: { type: 'guardrail', id: first.id } },
    ])
  })
})

describe('the statistics rollup', () => {
  it('rebuilds a day from the approvals and the steps the run modules count', async () => {
    const today = new Date().toISOString().slice(0, 10)
    const setup = await setupGuard()
    await setup.ownerSql(sql`
      insert into guard_stats_daily (organization_id, day, actions_auto) values (${setup.a.id}, ${today}::date, 999)`)
    const approval = await setup.db.tenant(setup.a.id, (tx) =>
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
          title: 'Refund',
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
    await setup.container.modules.guard.stats.rollup('hourly')
    const rows = await setup.db.tenant(setup.a.id, (tx) =>
      tx.execute<{ actions_auto: string; approvals_requested: string }>(
        sql`select actions_auto, approvals_requested from guard_stats_daily where day = ${today}::date`,
      ),
    )
    // the stale row was rebuilt: the steps have nothing to count yet, the approval is counted
    expect(rows.rows).toEqual([{ actions_auto: '0', approvals_requested: '1' }])
    expect(approval.created).toBe(true)
  })
})

export { guardUrl }
