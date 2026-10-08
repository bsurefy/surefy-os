// SPDX-License-Identifier: AGPL-3.0-only
import {
  GUARD_DEFAULTS,
  guardRuleRowDtoSchema,
  guardSettingsDtoSchema,
  okResponse,
  pageResponse,
  PAGE_SIZE,
} from '@surefy/contracts'
import type { GuardRuleRowDto, GuardSettingsDto } from '@surefy/contracts'
import { defineFactory, fixtureUuid } from '@surefy/web-core/testing'
import {
  defineMockDomain,
  defineMockHandler,
  mockOk,
  mockPage,
} from '@surefy/web-core/testing/mock'

import { OMAR } from './shell.fixtures'
import { SALES_TEAM_ID } from './teams'

const RULE_KIND = 80

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

/** A rule of the organization, unlocked, unless overridden. */
export const guardRuleRowFactory = defineFactory(
  guardRuleRowDtoSchema,
  (sequence): GuardRuleRowDto => ({
    id: fixtureUuid(RULE_KIND, sequence),
    ruleKey: null,
    name: `Rule ${sequence}`,
    type: 'approval_rule',
    scope: 'organization',
    team: null,
    usedByCount: 0,
    triggeredThisWeek: 0,
    isEnabled: true,
    isLocked: false,
    lockedBy: null,
    lockedReason: null,
    editTarget: null,
  }),
)

function seedRules(): GuardRuleRowDto[] {
  guardRuleRowFactory.reset()
  return [
    guardRuleRowFactory({
      name: 'Refunds above $200 need approval',
      type: 'approval_rule',
      usedByCount: 3,
      triggeredThisWeek: 12,
      isLocked: true,
      lockedBy: OMAR,
      lockedReason: 'Required by finance',
    }),
    guardRuleRowFactory({ name: 'Never delete customer records', type: 'blocked_action' }),
    guardRuleRowFactory({
      name: 'Sales: no more than 50 emails a day',
      type: 'action_limit',
      scope: 'team',
      team: { id: SALES_TEAM_ID, name: 'Sales' },
    }),
    guardRuleRowFactory({ name: 'Switched off rule', type: 'content_filter', isEnabled: false }),
    guardRuleRowFactory({
      name: 'Support triage: ask before refunds',
      scope: 'agent',
      ruleKey: 'refund-approval',
      editTarget: { type: 'agent', id: fixtureUuid(70, 1) },
    }),
  ]
}

let rules = seedRules()

/** Back to the seeded rules; tests call it between cases. */
export function resetGuardMock(): void {
  rules = seedRules()
}

const path = '/orgs/:orgId/guard'

/**
 * Guard (overview, defaults, guardrails, data filters). The organization's defaults and its
 * guardrails are mocked for the agent editor's Guard tab; the Guard screens add the rest here, one
 * handler per endpoint with a scenario for every state of the screens.
 */
export const guardDomain = defineMockDomain('guard', [
  defineMockHandler({
    method: 'get',
    path: `${path}/defaults`,
    response: okResponse(guardSettingsDtoSchema),
    scenarios: { default: () => mockOk(GUARD_SETTINGS) },
  }),
  defineMockHandler({
    method: 'get',
    path: `${path}/guardrails`,
    response: pageResponse(guardRuleRowDtoSchema),
    scenarios: {
      default: ({ request }) => {
        const url = new URL(request.url)
        const scopes = url.searchParams.get('scope')?.split(',')
        const matching = rules.filter((rule) => !scopes || scopes.includes(rule.scope))
        const limit = Number(url.searchParams.get('limit') ?? PAGE_SIZE.default)
        const start = Number(url.searchParams.get('cursor') ?? 0)
        const next = start + limit < matching.length ? String(start + limit) : null
        return mockPage(matching.slice(start, start + limit), next)
      },
    },
  }),
])
