// SPDX-License-Identifier: AGPL-3.0-only
import {
  BUILT_IN_PII_TYPES,
  GUARD_DEFAULTS,
  guardBand,
  guardrailDtoSchema,
  guardRuleRowDtoSchema,
  GUARD_IMPACT_SAMPLE_SIZE,
  PII_FILTER_DEFAULTS,
  piiRuleDtoSchema,
} from '@surefy/contracts'
import type {
  DataFilterTypeDto,
  GuardImpactPreviewDto,
  GuardOverviewDto,
  GuardRuleRowDto,
  GuardSettingsDto,
  GuardrailDto,
  PiiRuleDto,
} from '@surefy/contracts'
import { defineFactory, fixtureUuid } from '@surefy/web-core/testing'

import { SUPPORT_AGENT_ID } from './agents'
import { MAYA, OMAR } from './shell.fixtures'
import { SALES_TEAM_ID, SUPPORT_TEAM_ID } from './teams'

const RULE_KIND = 80
const PII_RULE_KIND = 81
const NOW = '2026-01-15T09:00:00.000Z'

export const REFUND_RULE_ID = fixtureUuid(RULE_KIND, 1)
export const BLOCKED_RULE_ID = fixtureUuid(RULE_KIND, 2)
export const LIMIT_RULE_ID = fixtureUuid(RULE_KIND, 3)
export const OFF_RULE_ID = fixtureUuid(RULE_KIND, 4)
export const CARDS_FILTER_ID = fixtureUuid(PII_RULE_KIND, 1)

export const SALES_TEAM = { id: SALES_TEAM_ID, name: 'Sales' }
export const SUPPORT_TEAM = { id: SUPPORT_TEAM_ID, name: 'Support' }

/** The organization's thresholds before it saves values of its own. */
export const GUARD_SETTINGS: GuardSettingsDto = {
  autoThresholdBp: GUARD_DEFAULTS.autoThresholdBp,
  reviewThresholdBp: GUARD_DEFAULTS.reviewThresholdBp,
  quickApproveMaxAmountMicros: GUARD_DEFAULTS.quickApproveMaxAmountMicros,
  quickApproveMaxRisk: GUARD_DEFAULTS.quickApproveMaxRisk,
  stepUpAmountMicros: GUARD_DEFAULTS.stepUpAmountMicros,
  targetDecisionMinutes: GUARD_DEFAULTS.targetDecisionMinutes,
  currency: 'USD',
  isCustomized: false,
  updatedBy: null,
  updatedAt: null,
}

/** An unlocked approval rule of the organization, unless overridden. */
export const guardrailFactory = defineFactory(guardrailDtoSchema, (sequence): GuardrailDto => ({
  id: fixtureUuid(RULE_KIND, sequence),
  name: `Rule ${sequence}`,
  type: 'blocked_action',
  scope: 'organization',
  team: null,
  definition: { version: 1, kind: 'blocked_action', match: { action: `tools.action${sequence}` } },
  isEnabled: true,
  isLocked: false,
  lockedBy: null,
  lockedReason: null,
  conflictsWith: null,
  createdBy: MAYA,
  updatedBy: MAYA,
  createdAt: '2026-01-02T09:00:00.000Z',
  updatedAt: '2026-01-02T09:00:00.000Z',
}))

export const piiRuleFactory = defineFactory(piiRuleDtoSchema, (sequence): PiiRuleDto => ({
  id: fixtureUuid(PII_RULE_KIND, sequence),
  piiType: 'email',
  customLabel: null,
  customPattern: null,
  action: 'mask',
  scope: 'organization',
  team: null,
  agent: null,
  createdBy: MAYA,
  updatedBy: MAYA,
  createdAt: '2026-01-02T09:00:00.000Z',
  updatedAt: '2026-01-02T09:00:00.000Z',
}))

/** What each seeded guardrail is used by and how often it fired this week (the table's counts). */
export const RULE_USAGE: Record<string, { usedBy: number; triggered: number }> = {
  [REFUND_RULE_ID]: { usedBy: 3, triggered: 12 },
  [BLOCKED_RULE_ID]: { usedBy: 5, triggered: 0 },
  [LIMIT_RULE_ID]: { usedBy: 1, triggered: 4 },
}

export function seedGuardrails(): GuardrailDto[] {
  guardrailFactory.reset()
  return [
    guardrailFactory({
      name: 'Refunds above $200 need approval',
      type: 'approval_rule',
      definition: {
        version: 1,
        kind: 'approval_rule',
        match: {
          action: 'payments.refund',
          conditions: [{ field: 'amount', operator: 'gt', value: 200 }],
        },
        approvers: [{ type: 'role', id: 'admin' }],
        waitMinutes: 240,
        onTimeout: 'reject',
        escalateTo: [],
        risk: 'high',
      },
      isLocked: true,
      lockedBy: OMAR,
      lockedReason: 'Required by finance',
    }),
    guardrailFactory({
      name: 'Never delete customer records',
      definition: {
        version: 1,
        kind: 'blocked_action',
        match: { action: 'crm.delete_customer' },
      },
    }),
    guardrailFactory({
      name: 'Sales: no more than 50 emails a day',
      type: 'action_limit',
      scope: 'team',
      team: SALES_TEAM,
      definition: {
        version: 1,
        kind: 'action_limit',
        match: { action: 'email.send' },
        limit: { perDayCount: 50 },
        onReached: 'block',
      },
    }),
    guardrailFactory({
      name: 'Switched off rule',
      type: 'content_filter',
      definition: {
        version: 1,
        kind: 'content_filter',
        match: { action: 'chat.reply' },
        categories: ['profanity'],
        action: 'flag',
      },
      isEnabled: false,
    }),
  ]
}

/** Rules edited elsewhere: an agent's own, and the personal-data filter. */
export const READ_ONLY_ROWS: readonly GuardRuleRowDto[] = [
  guardRuleRowDtoSchema.parse({
    id: SUPPORT_AGENT_ID,
    ruleKey: 'refund-approval',
    name: 'Support triage: ask before refunds',
    type: 'approval_rule',
    scope: 'agent',
    team: null,
    usedByCount: 1,
    triggeredThisWeek: 7,
    isEnabled: true,
    isLocked: false,
    lockedBy: null,
    lockedReason: null,
    editTarget: { type: 'agent', id: SUPPORT_AGENT_ID },
  }),
  guardRuleRowDtoSchema.parse({
    id: CARDS_FILTER_ID,
    ruleKey: null,
    name: 'Payment card numbers',
    type: 'data_filter',
    scope: 'organization',
    team: null,
    usedByCount: 0,
    triggeredThisWeek: 2,
    isEnabled: true,
    isLocked: false,
    lockedBy: null,
    lockedReason: null,
    editTarget: { type: 'data_filters', id: null },
  }),
]

export function toRuleRow(guardrail: GuardrailDto): GuardRuleRowDto {
  const usage = RULE_USAGE[guardrail.id] ?? { usedBy: 0, triggered: 0 }
  return {
    id: guardrail.id,
    ruleKey: null,
    name: guardrail.name,
    type: guardrail.type,
    scope: guardrail.scope,
    team: guardrail.team,
    usedByCount: usage.usedBy,
    triggeredThisWeek: usage.triggered,
    isEnabled: guardrail.isEnabled,
    isLocked: guardrail.isLocked,
    lockedBy: guardrail.lockedBy,
    lockedReason: guardrail.lockedReason,
    editTarget: null,
  }
}

/** The last 1,000 checked actions, as confidences from 30% up to 100%, thick towards the top. */
function sampleConfidence(index: number): number {
  return 0.3 + 0.7 * Math.sqrt((index + 0.5) / GUARD_IMPACT_SAMPLE_SIZE)
}

export function previewImpact(autoBp: number, reviewBp: number): GuardImpactPreviewDto {
  const counts = { auto: 0, double_check: 0, human: 0 }
  for (let index = 0; index < GUARD_IMPACT_SAMPLE_SIZE; index += 1) {
    counts[guardBand(sampleConfidence(index), { autoBp, reviewBp })] += 1
  }
  return {
    sampleSize: GUARD_IMPACT_SAMPLE_SIZE,
    auto: counts.auto,
    doubleCheck: counts.double_check,
    human: counts.human,
  }
}

export const OVERVIEW: GuardOverviewDto = {
  range: '7d',
  auto: 812,
  doubleChecked: 143,
  needsPerson: 61,
  blockedByLimits: 9,
  personalDataHidden: 27,
  ranOnLocalModels: 118,
  medianMinutesToApprove: 14,
  attention: [
    { kind: 'approvals_overdue', count: 3, target: { type: 'approvals', id: null } },
    { kind: 'guardrail_conflict', count: 1, target: { type: 'guardrail', id: BLOCKED_RULE_ID } },
    {
      kind: 'agent_thresholds_outdated',
      count: 2,
      target: { type: 'agent', id: SUPPORT_AGENT_ID },
    },
  ],
}

export const EMPTY_OVERVIEW: GuardOverviewDto = {
  range: '7d',
  auto: 0,
  doubleChecked: 0,
  needsPerson: 0,
  blockedByLimits: 0,
  personalDataHidden: 0,
  ranOnLocalModels: 0,
  medianMinutesToApprove: null,
  attention: [],
}

export function seedPiiRules(): PiiRuleDto[] {
  piiRuleFactory.reset()
  return [
    piiRuleFactory({ id: CARDS_FILTER_ID, piiType: 'payment_card', action: 'block' }),
    piiRuleFactory({
      piiType: 'email',
      action: 'detect',
      scope: 'team',
      team: SUPPORT_TEAM,
      createdAt: NOW,
      updatedAt: NOW,
    }),
    piiRuleFactory({
      piiType: 'custom',
      customLabel: 'Customer number',
      customPattern: 'CUS-\\d{6}',
      action: 'mask',
    }),
  ]
}

/** The type lines of Guard › Data filters: every built-in type, then the custom ones. */
export function toDataFilterTypes(rules: readonly PiiRuleDto[]): DataFilterTypeDto[] {
  const organizationRules = rules.filter((rule) => rule.scope === 'organization')
  const exceptionsOf = (piiType: string, label: string | null) =>
    rules.filter(
      (rule) =>
        rule.scope !== 'organization' && rule.piiType === piiType && rule.customLabel === label,
    )
  const builtIn = BUILT_IN_PII_TYPES.map((piiType): DataFilterTypeDto => {
    const saved = organizationRules.find((rule) => rule.piiType === piiType)
    return {
      piiType,
      customLabel: null,
      customPattern: null,
      action: saved?.action ?? PII_FILTER_DEFAULTS[piiType],
      source: saved ? 'organization' : 'default',
      ruleId: saved?.id ?? null,
      exceptions: exceptionsOf(piiType, null),
    }
  })
  const custom = organizationRules
    .filter((rule) => rule.piiType === 'custom')
    .map((rule): DataFilterTypeDto => ({
      piiType: 'custom',
      customLabel: rule.customLabel,
      customPattern: rule.customPattern,
      action: rule.action,
      source: 'organization',
      ruleId: rule.id,
      exceptions: exceptionsOf('custom', rule.customLabel),
    }))
  return [...builtIn, ...custom]
}
