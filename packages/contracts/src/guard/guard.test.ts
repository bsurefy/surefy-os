// SPDX-License-Identifier: AGPL-3.0-only
import { describe, expect, it } from 'vitest'

import {
  BUILT_IN_PII_TYPES,
  createGuardrailInputSchema,
  createPiiRuleInputSchema,
  decisionResultSchema,
  ERROR_CODES,
  GUARD_AUDIT_ACTIONS,
  GUARD_DEFAULTS,
  GUARD_ERROR_CODES,
  GUARD_PERMISSIONS,
  guardBand,
  guardCheckResultSchema,
  guardDefaultsLoosened,
  guardImpactPreviewQuerySchema,
  guardOverviewQuerySchema,
  guardrailDefinitionSchema,
  listGuardrailsQuerySchema,
  mergeGuardThresholds,
  PII_FILTER_DEFAULTS,
  piiActionLoosened,
  ROLE_PERMISSIONS,
  strictestPiiAction,
  testDataFilterInputSchema,
  updateGuardrailInputSchema,
  updateGuardSettingsInputSchema,
} from '../index.js'

const id = '0190a5c4-0000-7000-8000-000000000001'
const match = { action: 'payments.refund' }

describe('confidence bands', () => {
  const defaults = { autoBp: 9000, reviewBp: 6000 }

  it('puts a confidence in its band at the default thresholds', () => {
    expect(guardBand(0.95, defaults)).toBe('auto')
    expect(guardBand(0.9, defaults)).toBe('auto')
    expect(guardBand(0.89, defaults)).toBe('double_check')
    expect(guardBand(0.6, defaults)).toBe('double_check')
    expect(guardBand(0.59, defaults)).toBe('human')
    expect(guardBand(0, defaults)).toBe('human')
  })

  it('takes the highest value at every level, and sends everything below auto to a person when they meet', () => {
    expect(
      mergeGuardThresholds([
        defaults,
        { autoBp: 9500, reviewBp: 5000 },
        { autoBp: 9200, reviewBp: 7000 },
      ]),
    ).toEqual({ autoBp: 9500, reviewBp: 7000 })
    const merged = mergeGuardThresholds([defaults, { autoBp: 9000, reviewBp: 9500 }])
    expect(merged).toEqual({ autoBp: 9000, reviewBp: 9000 })
    expect(guardBand(0.89, merged)).toBe('human')
    expect(guardBand(0.9, merged)).toBe('auto')
  })
})

describe('guard defaults', () => {
  const current = {
    autoThresholdBp: 9000,
    reviewThresholdBp: 6000,
    quickApproveMaxAmountMicros: 0,
    quickApproveMaxRisk: 'low',
    stepUpAmountMicros: 500_000_000,
    targetDecisionMinutes: 60,
  } as const

  it('starts from the documented values', () => {
    expect(GUARD_DEFAULTS).toMatchObject({ autoThresholdBp: 9000, reviewThresholdBp: 6000 })
    expect(updateGuardSettingsInputSchema.safeParse(current).success).toBe(true)
  })

  it('keeps the review threshold below the automatic one and the amounts non-negative', () => {
    expect(
      updateGuardSettingsInputSchema.safeParse({ ...current, reviewThresholdBp: 9000 }).success,
    ).toBe(false)
    expect(
      updateGuardSettingsInputSchema.safeParse({ ...current, autoThresholdBp: 10_001 }).success,
    ).toBe(false)
    expect(
      updateGuardSettingsInputSchema.safeParse({ ...current, quickApproveMaxAmountMicros: -1 })
        .success,
    ).toBe(false)
    expect(
      updateGuardSettingsInputSchema.safeParse({ ...current, targetDecisionMinutes: 0 }).success,
    ).toBe(false)
    expect(
      updateGuardSettingsInputSchema.safeParse({ ...current, stepUpAmountMicros: null }).success,
    ).toBe(true)
  })

  it('knows which changes loosen Guard', () => {
    expect(guardDefaultsLoosened(current, { ...current, autoThresholdBp: 8500 })).toBe(true)
    expect(guardDefaultsLoosened(current, { ...current, reviewThresholdBp: 5000 })).toBe(true)
    expect(guardDefaultsLoosened(current, { ...current, quickApproveMaxAmountMicros: 1 })).toBe(
      true,
    )
    expect(guardDefaultsLoosened(current, { ...current, quickApproveMaxRisk: 'medium' })).toBe(true)
    expect(guardDefaultsLoosened(current, { ...current, stepUpAmountMicros: null })).toBe(true)
    expect(guardDefaultsLoosened(current, { ...current, stepUpAmountMicros: 900_000_000 })).toBe(
      true,
    )
    expect(guardDefaultsLoosened(current, { ...current, autoThresholdBp: 9500 })).toBe(false)
    expect(guardDefaultsLoosened(current, { ...current, stepUpAmountMicros: 100_000_000 })).toBe(
      false,
    )
    expect(guardDefaultsLoosened(current, { ...current, targetDecisionMinutes: 120 })).toBe(false)
    expect(
      guardDefaultsLoosened(
        { ...current, stepUpAmountMicros: null },
        { ...current, stepUpAmountMicros: null },
      ),
    ).toBe(false)
  })

  it('reads the impact preview thresholds from a query string', () => {
    expect(
      guardImpactPreviewQuerySchema.parse({ autoThresholdBp: '9000', reviewThresholdBp: '6000' }),
    ).toEqual({ autoThresholdBp: 9000, reviewThresholdBp: 6000 })
    expect(
      guardImpactPreviewQuerySchema.safeParse({
        autoThresholdBp: '5000',
        reviewThresholdBp: '6000',
      }).success,
    ).toBe(false)
    expect(guardOverviewQuerySchema.parse({}).range).toBe('7d')
  })
})

describe('guardrail definitions', () => {
  const approvalRule = {
    version: 1,
    kind: 'approval_rule',
    match: {
      action: 'payments.refund',
      conditions: [{ field: 'amount', operator: 'gt', value: 200 }],
    },
    approvers: [{ type: 'team', id }],
    waitMinutes: 120,
    onTimeout: 'escalate',
    risk: 'high',
  }

  it('reads each type by its own fields', () => {
    expect(guardrailDefinitionSchema.parse(approvalRule)).toMatchObject({ escalateTo: [] })
    expect(
      guardrailDefinitionSchema.safeParse({ version: 1, kind: 'blocked_action', match }).success,
    ).toBe(true)
    expect(
      guardrailDefinitionSchema.safeParse({
        version: 1,
        kind: 'threshold_override',
        match,
        autoBp: 9500,
        reviewBp: 7000,
      }).success,
    ).toBe(true)
    expect(
      guardrailDefinitionSchema.safeParse({
        version: 1,
        kind: 'action_limit',
        match,
        limit: { perDayCount: 10 },
        onReached: 'require_approval',
      }).success,
    ).toBe(true)
    expect(
      guardrailDefinitionSchema.safeParse({
        version: 1,
        kind: 'content_filter',
        match,
        categories: ['hate'],
        action: 'block',
      }).success,
    ).toBe(true)
    expect(guardrailDefinitionSchema.safeParse({ ...approvalRule, kind: 'unknown' }).success).toBe(
      false,
    )
  })

  it('rejects incomplete or contradictory rules', () => {
    expect(guardrailDefinitionSchema.safeParse({ ...approvalRule, approvers: [] }).success).toBe(
      false,
    )
    expect(guardrailDefinitionSchema.safeParse({ ...approvalRule, onTimeout: null }).success).toBe(
      false,
    )
    expect(
      guardrailDefinitionSchema.safeParse({ ...approvalRule, waitMinutes: null, onTimeout: null })
        .success,
    ).toBe(true)
    expect(
      guardrailDefinitionSchema.safeParse({
        version: 1,
        kind: 'action_limit',
        match,
        limit: {},
        onReached: 'block',
      }).success,
    ).toBe(false)
    expect(
      guardrailDefinitionSchema.safeParse({
        version: 1,
        kind: 'threshold_override',
        match,
        autoBp: 6000,
        reviewBp: 9000,
      }).success,
    ).toBe(false)
    expect(
      guardrailDefinitionSchema.safeParse({
        version: 1,
        kind: 'blocked_action',
        match: { action: 'x', conditions: [{ field: 'a b', operator: 'gt', value: 1 }] },
      }).success,
    ).toBe(false)
  })

  it('needs a team for the team scope and forbids one for the organization', () => {
    const definition = { version: 1, kind: 'blocked_action', match }
    const base = { name: 'No price changes', definition }
    expect(createGuardrailInputSchema.safeParse({ ...base, scope: 'organization' }).success).toBe(
      true,
    )
    expect(createGuardrailInputSchema.safeParse({ ...base, scope: 'team' }).success).toBe(false)
    expect(
      createGuardrailInputSchema.safeParse({ ...base, scope: 'team', teamId: id }).success,
    ).toBe(true)
    expect(
      createGuardrailInputSchema.safeParse({ ...base, scope: 'organization', teamId: id }).success,
    ).toBe(false)
    expect(createGuardrailInputSchema.parse({ ...base, scope: 'organization' }).isEnabled).toBe(
      true,
    )
  })

  it('updates parts of a rule with a reason, and filters the table', () => {
    expect(
      updateGuardrailInputSchema.safeParse({ isEnabled: false, reason: 'Pilot ended' }).success,
    ).toBe(true)
    expect(updateGuardrailInputSchema.safeParse({ reason: '' }).success).toBe(false)
    expect(listGuardrailsQuerySchema.parse({ type: 'data_filter' }).type).toEqual(['data_filter'])
    expect(listGuardrailsQuerySchema.parse({ isEnabled: 'false' }).isEnabled).toBe(false)
    expect(listGuardrailsQuerySchema.safeParse({ type: 'budget' }).success).toBe(false)
  })
})

describe('personal-data filters', () => {
  it('has a default action for every built-in type', () => {
    for (const type of BUILT_IN_PII_TYPES) expect(PII_FILTER_DEFAULTS[type]).toBeDefined()
  })

  it('orders actions from loosest to strictest', () => {
    expect(piiActionLoosened('block', 'mask')).toBe(true)
    expect(piiActionLoosened('mask', 'detect')).toBe(true)
    expect(piiActionLoosened('detect', 'block')).toBe(false)
    expect(piiActionLoosened('mask', 'mask')).toBe(false)
    expect(strictestPiiAction(['detect', 'block', 'mask'])).toBe('block')
  })

  it('needs a label and pattern for a custom type only', () => {
    const base = { action: 'mask', scope: 'organization' }
    expect(createPiiRuleInputSchema.safeParse({ ...base, piiType: 'email' }).success).toBe(true)
    expect(createPiiRuleInputSchema.safeParse({ ...base, piiType: 'custom' }).success).toBe(false)
    expect(
      createPiiRuleInputSchema.safeParse({
        ...base,
        piiType: 'custom',
        customLabel: 'Employee ID',
        customPattern: 'EMP-\\d{6}',
      }).success,
    ).toBe(true)
    expect(
      createPiiRuleInputSchema.safeParse({
        ...base,
        piiType: 'email',
        customLabel: 'x',
        customPattern: 'y',
      }).success,
    ).toBe(false)
    expect(
      createPiiRuleInputSchema.safeParse({
        ...base,
        piiType: 'custom',
        customLabel: 'x',
        customPattern: 'a'.repeat(501),
      }).success,
    ).toBe(false)
  })

  it('ties an exception to its team or agent', () => {
    const base = { piiType: 'phone', action: 'detect' }
    expect(createPiiRuleInputSchema.safeParse({ ...base, scope: 'team' }).success).toBe(false)
    expect(createPiiRuleInputSchema.safeParse({ ...base, scope: 'team', teamId: id }).success).toBe(
      true,
    )
    expect(
      createPiiRuleInputSchema.safeParse({ ...base, scope: 'agent', agentId: id }).success,
    ).toBe(true)
    expect(
      createPiiRuleInputSchema.safeParse({ ...base, scope: 'agent', teamId: id }).success,
    ).toBe(false)
    expect(
      createPiiRuleInputSchema.safeParse({ ...base, scope: 'organization', agentId: id }).success,
    ).toBe(false)
  })

  it('tries a filter on text, with a pattern only together with its label', () => {
    expect(testDataFilterInputSchema.safeParse({ text: 'Call 555-0100' }).success).toBe(true)
    expect(testDataFilterInputSchema.safeParse({ text: '' }).success).toBe(false)
    expect(testDataFilterInputSchema.safeParse({ text: 'x', customPattern: 'a' }).success).toBe(
      false,
    )
    expect(
      testDataFilterInputSchema.safeParse({ text: 'x', customPattern: 'a', customLabel: 'A' })
        .success,
    ).toBe(true)
  })
})

describe('decisions', () => {
  it('keeps confidence between 0 and 1', () => {
    expect(
      decisionResultSchema.safeParse({ value: 'billing', confidence: 0.88, reasoning: 'Invoice' })
        .success,
    ).toBe(true)
    expect(
      decisionResultSchema.safeParse({ value: true, confidence: 1.2, reasoning: '' }).success,
    ).toBe(false)
  })

  it('records a blocked step with its reason and a person-bound step with its approval', () => {
    const base = {
      thresholds: { autoBp: 9000, reviewBp: 6000 },
      matchedRules: [{ ref: id, type: 'blocked_action' }],
      doubleCheck: null,
      approvalId: null,
    }
    expect(
      guardCheckResultSchema.safeParse({
        ...base,
        outcome: 'blocked',
        confidence: null,
        reasonCode: 'GUARD_BLOCKED_ACTION',
      }).success,
    ).toBe(true)
    expect(
      guardCheckResultSchema.safeParse({
        ...base,
        outcome: 'human',
        confidence: 0.4,
        reasonCode: null,
        approvalId: id,
      }).success,
    ).toBe(true)
    expect(
      guardCheckResultSchema.safeParse({
        ...base,
        outcome: 'maybe',
        confidence: 0.4,
        reasonCode: null,
      }).success,
    ).toBe(false)
  })
})

describe('guard codes, permissions and audit', () => {
  it('registers every error code', () => {
    for (const code of Object.values(GUARD_ERROR_CODES)) expect(ERROR_CODES[code]).toBe(code)
  })

  it('lets Builders read, Admins manage and only Owners lock', () => {
    expect(ROLE_PERMISSIONS.user).not.toContain(GUARD_PERMISSIONS.GUARD_READ.key)
    expect(ROLE_PERMISSIONS.builder).toContain(GUARD_PERMISSIONS.GUARD_READ.key)
    expect(ROLE_PERMISSIONS.builder).not.toContain(GUARD_PERMISSIONS.GUARD_MANAGE.key)
    expect(ROLE_PERMISSIONS.admin).toContain(GUARD_PERMISSIONS.GUARD_MANAGE.key)
    expect(ROLE_PERMISSIONS.admin).not.toContain(GUARD_PERMISSIONS.GUARD_LOCK.key)
    expect(ROLE_PERMISSIONS.owner).toContain(GUARD_PERMISSIONS.GUARD_LOCK.key)
  })

  it('names audit actions <area>.<verb>', () => {
    for (const action of Object.values(GUARD_AUDIT_ACTIONS)) {
      expect(action).toMatch(/^[a-z_]+\.[a-z_]+$/)
    }
  })
})
