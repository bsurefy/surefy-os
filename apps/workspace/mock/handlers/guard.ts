// SPDX-License-Identifier: AGPL-3.0-only
import { z } from 'zod'

import {
  createGuardrailInputSchema,
  createPiiRuleInputSchema,
  dataFiltersDtoSchema,
  ERROR_CODES,
  guardDefaultsLoosened,
  guardImpactPreviewDtoSchema,
  guardImpactPreviewQuerySchema,
  guardOverviewDtoSchema,
  guardrailDtoSchema,
  guardrailImpactDtoSchema,
  guardRuleRowDtoSchema,
  guardSettingsDtoSchema,
  lockGuardrailInputSchema,
  okResponse,
  pageResponse,
  PAGE_SIZE,
  piiActionLoosened,
  piiRuleDtoSchema,
  testDataFilterInputSchema,
  testDataFilterResultDtoSchema,
  updateGuardrailInputSchema,
  updateGuardSettingsInputSchema,
  updatePiiRuleInputSchema,
} from '@surefy/contracts'
import type {
  GuardrailDto,
  GuardRuleRowDto,
  GuardSettingsDto,
  PiiRuleDto,
  TestDataFilterResultDto,
} from '@surefy/contracts'
import {
  defineMockDomain,
  defineMockHandler,
  mockError,
  mockOk,
  mockPage,
} from '@surefy/web-core/testing/mock'

import {
  EMPTY_OVERVIEW,
  GUARD_SETTINGS,
  OVERVIEW,
  previewImpact,
  READ_ONLY_ROWS,
  RULE_USAGE,
  seedGuardrails,
  seedPiiRules,
  toDataFilterTypes,
  toRuleRow,
} from './guard.fixtures'
import { MAYA } from './shell.fixtures'

export { GUARD_SETTINGS, guardrailFactory, piiRuleFactory } from './guard.fixtures'
export {
  BLOCKED_RULE_ID,
  CARDS_FILTER_ID,
  LIMIT_RULE_ID,
  OFF_RULE_ID,
  REFUND_RULE_ID,
} from './guard.fixtures'

const HTTP_FORBIDDEN = 403
const HTTP_NOT_FOUND = 404
const HTTP_CONFLICT = 409
const HTTP_UNPROCESSABLE = 422
const NOW = '2026-01-15T09:00:00.000Z'
const MASKS = [
  { type: 'email', pattern: /[\w.+-]{1,64}@[\w-]{1,63}\.\w{2,}/g, label: 'EMAIL' },
  { type: 'payment_card', pattern: /\b\d{4}(?:[ -]\d{4}){3}\b/g, label: 'CARD' },
  { type: 'phone', pattern: /\+\d{10,14}\b/g, label: 'PHONE' },
] as const

let settings: GuardSettingsDto = { ...GUARD_SETTINGS }
let guardrails = seedGuardrails()
let piiRules = seedPiiRules()

/** Back to the seeded defaults, rules and data filters; tests call it between cases. */
export function resetGuardMock(): void {
  settings = { ...GUARD_SETTINGS }
  guardrails = seedGuardrails()
  piiRules = seedPiiRules()
}

const path = '/orgs/:orgId/guard'
const noContent = () => new Response(null, { status: 204 })
const findGuardrail = (id: unknown) => guardrails.find((rule) => rule.id === id)
const replaceGuardrail = (updated: GuardrailDto) => {
  guardrails = guardrails.map((rule) => (rule.id === updated.id ? updated : rule))
  return updated
}
const findPiiRule = (id: unknown) => piiRules.find((rule) => rule.id === id)
const ruleNotFound = () =>
  mockError(HTTP_NOT_FOUND, ERROR_CODES.GUARD_RULE_NOT_FOUND, 'Guardrail not found')
const piiNotFound = () =>
  mockError(HTTP_NOT_FOUND, ERROR_CODES.GUARD_PII_RULE_NOT_FOUND, 'Rule not found')
const locked = () =>
  mockError(HTTP_FORBIDDEN, ERROR_CODES.GUARD_RULE_LOCKED, 'An Owner locked this rule')
const reasonRequired = () =>
  mockError(HTTP_UNPROCESSABLE, ERROR_CODES.GUARD_REASON_REQUIRED, 'Give a reason')

/** The row list: stored guardrails, then the rules edited elsewhere. */
function allRows(): GuardRuleRowDto[] {
  return [...guardrails.map(toRuleRow), ...READ_ONLY_ROWS]
}

function pageOf<Item extends { id: string }>(items: Item[], url: URL) {
  const limit = Number(url.searchParams.get('limit') ?? PAGE_SIZE.default)
  const start = Number(url.searchParams.get('cursor') ?? 0)
  const next = start + limit < items.length ? String(start + limit) : null
  return mockPage(items.slice(start, start + limit), next)
}

/** What "Try it" does: masks emails, cards and phone numbers the way the saved actions say. */
function testFilter(text: string): TestDataFilterResultDto {
  const actions = new Map(toDataFilterTypes(piiRules).map((line) => [line.piiType, line.action]))
  let maskedText = text
  let blocked = false
  const findings: TestDataFilterResultDto['findings'] = []
  for (const mask of MASKS) {
    const count = Array.from(maskedText.matchAll(mask.pattern)).length
    const action = actions.get(mask.type)
    if (count === 0 || !action) continue
    findings.push({ piiType: mask.type, customLabel: null, action, count })
    if (action === 'block') blocked = true
    if (action === 'mask') maskedText = maskedText.replace(mask.pattern, `[${mask.label}]`)
  }
  return { maskedText, blocked, findings }
}

/**
 * Guard (B6-04's routes, live: the real API answers; the handlers stay for component tests and
 * `MOCK_DOMAINS=guard` shows the states). Seeded: a locked approval rule with three agents behind
 * it, a blocked action, a Sales team limit, a rule that is switched off, an agent's own rule and a
 * personal-data filter (both read-only here), the standard thresholds, and the standard data
 * filters with a Support email exception and a custom pattern. Scenarios: `empty` on the overview
 * is a fresh install and on the Guardrails list no rules at all; on a guardrail change or delete,
 * `locked`; on a name, `name-taken`; on a defaults save, `thresholds-invalid`; on the data filters,
 * `pattern-invalid`.
 */
export const guardDomain = defineMockDomain('guard', [
  defineMockHandler({
    method: 'get',
    path: `${path}/overview`,
    response: okResponse(guardOverviewDtoSchema),
    scenarios: {
      default: ({ request }) => {
        const range = new URL(request.url).searchParams.get('range') === '30d' ? '30d' : '7d'
        return mockOk({ ...OVERVIEW, range })
      },
      empty: () => mockOk(EMPTY_OVERVIEW),
    },
  }),
  defineMockHandler({
    method: 'get',
    path: `${path}/defaults`,
    response: okResponse(guardSettingsDtoSchema),
    scenarios: { default: () => mockOk(settings) },
  }),
  defineMockHandler({
    method: 'put',
    path: `${path}/defaults`,
    response: okResponse(guardSettingsDtoSchema),
    scenarios: {
      default: async ({ request }) => {
        const { reason, ...values } = updateGuardSettingsInputSchema.parse(await request.json())
        if (guardDefaultsLoosened(settings, values) && !reason) return reasonRequired()
        settings = { ...settings, ...values, isCustomized: true, updatedBy: MAYA, updatedAt: NOW }
        return mockOk(settings)
      },
      'thresholds-invalid': () =>
        mockError(
          HTTP_UNPROCESSABLE,
          ERROR_CODES.GUARD_THRESHOLDS_INVALID,
          'The review threshold must be below the automatic one',
        ),
    },
  }),
  defineMockHandler({
    method: 'get',
    path: `${path}/defaults/impact`,
    response: okResponse(guardImpactPreviewDtoSchema),
    scenarios: {
      default: ({ request }) => {
        const query = guardImpactPreviewQuerySchema.parse(
          Object.fromEntries(new URL(request.url).searchParams),
        )
        return mockOk(previewImpact(query.autoThresholdBp, query.reviewThresholdBp))
      },
      empty: () => mockOk({ sampleSize: 0, auto: 0, doubleCheck: 0, human: 0 }),
    },
  }),
  defineMockHandler({
    method: 'get',
    path: `${path}/guardrails`,
    response: pageResponse(guardRuleRowDtoSchema),
    scenarios: {
      default: ({ request }) => {
        const url = new URL(request.url)
        const q = url.searchParams.get('q')?.toLowerCase()
        const scopes = url.searchParams.get('scope')?.split(',')
        const types = url.searchParams.get('type')?.split(',')
        const enabled = url.searchParams.get('isEnabled')
        const sort = url.searchParams.get('sort') ?? 'name'
        const field = sort.replace(/^-/, '')
        const direction = sort.startsWith('-') ? -1 : 1
        const rows = allRows()
          .filter(
            (rule) =>
              (!q || rule.name.toLowerCase().includes(q)) &&
              (!scopes || scopes.includes(rule.scope)) &&
              (!types || types.includes(rule.type)) &&
              (enabled === null || String(rule.isEnabled) === enabled),
          )
          .sort((a, b) =>
            field === 'triggeredThisWeek'
              ? (a.triggeredThisWeek - b.triggeredThisWeek) * direction
              : a.name.localeCompare(b.name) * direction,
          )
        return pageOf(rows, url)
      },
      empty: () => mockPage([]),
    },
  }),
  defineMockHandler({
    method: 'post',
    path: `${path}/guardrails`,
    response: okResponse(guardrailDtoSchema),
    scenarios: {
      default: async ({ request }) => {
        const input = createGuardrailInputSchema.parse(await request.json())
        if (guardrails.some((rule) => rule.name.toLowerCase() === input.name.toLowerCase())) {
          return mockError(HTTP_CONFLICT, ERROR_CODES.GUARD_RULE_NAME_TAKEN, 'Name taken')
        }
        const blocking = guardrails.find(
          (rule) =>
            rule.isEnabled &&
            rule.definition.kind === 'blocked_action' &&
            rule.definition.match.action === input.definition.match.action,
        )
        const created: GuardrailDto = {
          id: globalThis.crypto.randomUUID(),
          name: input.name,
          type: input.definition.kind,
          scope: input.scope,
          team: input.teamId
            ? { id: input.teamId, name: input.teamId === MAYA.id ? 'Team' : 'Sales' }
            : null,
          definition: input.definition,
          isEnabled: input.isEnabled,
          isLocked: false,
          lockedBy: null,
          lockedReason: null,
          conflictsWith: blocking ? { id: blocking.id, name: blocking.name } : null,
          createdBy: MAYA,
          updatedBy: MAYA,
          createdAt: NOW,
          updatedAt: NOW,
        }
        guardrails = [...guardrails, created]
        return mockOk(created, { status: 201 })
      },
      'name-taken': () => mockError(HTTP_CONFLICT, ERROR_CODES.GUARD_RULE_NAME_TAKEN, 'Name taken'),
    },
  }),
  defineMockHandler({
    method: 'get',
    path: `${path}/guardrails/:guardrailId`,
    response: okResponse(guardrailDtoSchema),
    scenarios: {
      default: ({ params }) => {
        const found = findGuardrail(params.guardrailId)
        return found ? mockOk(found) : ruleNotFound()
      },
    },
  }),
  defineMockHandler({
    method: 'patch',
    path: `${path}/guardrails/:guardrailId`,
    response: okResponse(guardrailDtoSchema),
    scenarios: {
      default: async ({ params, request }) => {
        const found = findGuardrail(params.guardrailId)
        if (!found) return ruleNotFound()
        const { reason, ...input } = updateGuardrailInputSchema.parse(await request.json())
        if (input.definition && input.definition.kind !== found.type) {
          return mockError(
            HTTP_UNPROCESSABLE,
            ERROR_CODES.GUARD_RULE_TYPE_IMMUTABLE,
            'A rule keeps its type',
          )
        }
        const isTurnedOff = input.isEnabled === false && found.isEnabled
        if (isTurnedOff && !reason) return reasonRequired()
        if (
          input.name &&
          guardrails.some(
            (rule) => rule.id !== found.id && rule.name.toLowerCase() === input.name?.toLowerCase(),
          )
        ) {
          return mockError(HTTP_CONFLICT, ERROR_CODES.GUARD_RULE_NAME_TAKEN, 'Name taken')
        }
        return mockOk(replaceGuardrail({ ...found, ...input, updatedBy: MAYA, updatedAt: NOW }))
      },
      locked,
      'name-taken': () => mockError(HTTP_CONFLICT, ERROR_CODES.GUARD_RULE_NAME_TAKEN, 'Name taken'),
    },
  }),
  defineMockHandler({
    method: 'delete',
    path: `${path}/guardrails/:guardrailId`,
    response: okResponse(z.null()),
    scenarios: {
      default: ({ params, request }) => {
        const found = findGuardrail(params.guardrailId)
        if (!found) return ruleNotFound()
        if (found.isEnabled && !new URL(request.url).searchParams.get('reason')) {
          return reasonRequired()
        }
        guardrails = guardrails.filter((rule) => rule.id !== found.id)
        return noContent()
      },
      locked,
    },
  }),
  defineMockHandler({
    method: 'get',
    path: `${path}/guardrails/:guardrailId/impact`,
    response: okResponse(guardrailImpactDtoSchema),
    scenarios: {
      default: ({ params }) => {
        const found = findGuardrail(params.guardrailId)
        if (!found) return ruleNotFound()
        const count = RULE_USAGE[found.id]?.usedBy ?? 0
        return mockOk({
          dependents: count > 0 ? [{ type: 'agent', count }] : [],
          listed: [],
        })
      },
      'no-impact': () => mockOk({ dependents: [], listed: [] }),
    },
  }),
  defineMockHandler({
    method: 'post',
    path: `${path}/guardrails/:guardrailId/lock`,
    response: okResponse(guardrailDtoSchema),
    scenarios: {
      default: async ({ params, request }) => {
        const found = findGuardrail(params.guardrailId)
        if (!found) return ruleNotFound()
        const input = lockGuardrailInputSchema.parse(await request.json())
        return mockOk(
          replaceGuardrail({
            ...found,
            isLocked: true,
            lockedBy: MAYA,
            lockedReason: input.reason,
          }),
        )
      },
    },
  }),
  defineMockHandler({
    method: 'post',
    path: `${path}/guardrails/:guardrailId/unlock`,
    response: okResponse(guardrailDtoSchema),
    scenarios: {
      default: ({ params }) => {
        const found = findGuardrail(params.guardrailId)
        if (!found) return ruleNotFound()
        return mockOk(
          replaceGuardrail({ ...found, isLocked: false, lockedBy: null, lockedReason: null }),
        )
      },
    },
  }),
  defineMockHandler({
    method: 'get',
    path: `${path}/data-filters`,
    response: okResponse(dataFiltersDtoSchema),
    scenarios: { default: () => mockOk({ items: toDataFilterTypes(piiRules) }) },
  }),
  defineMockHandler({
    method: 'post',
    path: `${path}/data-filters/test`,
    response: okResponse(testDataFilterResultDtoSchema),
    scenarios: {
      default: async ({ request }) =>
        mockOk(testFilter(testDataFilterInputSchema.parse(await request.json()).text)),
      'pattern-invalid': () =>
        mockError(
          HTTP_UNPROCESSABLE,
          ERROR_CODES.GUARD_PII_PATTERN_INVALID,
          'The pattern does not compile',
        ),
    },
  }),
  defineMockHandler({
    method: 'post',
    path: `${path}/pii-rules`,
    response: okResponse(piiRuleDtoSchema),
    scenarios: {
      default: async ({ request }) => {
        const input = createPiiRuleInputSchema.parse(await request.json())
        const duplicate = piiRules.some(
          (rule) =>
            rule.scope === input.scope &&
            rule.piiType === input.piiType &&
            rule.customLabel === (input.customLabel ?? null) &&
            (rule.team?.id ?? null) === (input.teamId ?? null),
        )
        if (duplicate) {
          return mockError(
            HTTP_CONFLICT,
            ERROR_CODES.GUARD_PII_RULE_DUPLICATE,
            'Already has a rule',
          )
        }
        const created: PiiRuleDto = {
          id: globalThis.crypto.randomUUID(),
          piiType: input.piiType,
          customLabel: input.customLabel ?? null,
          customPattern: input.customPattern ?? null,
          action: input.action,
          scope: input.scope,
          team: input.teamId ? { id: input.teamId, name: 'Sales' } : null,
          agent: input.agentId ? { id: input.agentId, name: 'Support triage' } : null,
          createdBy: MAYA,
          updatedBy: MAYA,
          createdAt: NOW,
          updatedAt: NOW,
        }
        piiRules = [...piiRules, created]
        return mockOk(created, { status: 201 })
      },
      'pattern-invalid': () =>
        mockError(
          HTTP_UNPROCESSABLE,
          ERROR_CODES.GUARD_PII_PATTERN_INVALID,
          'The pattern does not compile',
        ),
    },
  }),
  defineMockHandler({
    method: 'patch',
    path: `${path}/pii-rules/:ruleId`,
    response: okResponse(piiRuleDtoSchema),
    scenarios: {
      default: async ({ params, request }) => {
        const found = findPiiRule(params.ruleId)
        if (!found) return piiNotFound()
        const { reason, ...input } = updatePiiRuleInputSchema.parse(await request.json())
        if (input.action && piiActionLoosened(found.action, input.action) && !reason) {
          return reasonRequired()
        }
        const updated = { ...found, ...input, updatedBy: MAYA, updatedAt: NOW }
        piiRules = piiRules.map((rule) => (rule.id === updated.id ? updated : rule))
        return mockOk(updated)
      },
      'pattern-invalid': () =>
        mockError(
          HTTP_UNPROCESSABLE,
          ERROR_CODES.GUARD_PII_PATTERN_INVALID,
          'The pattern does not compile',
        ),
    },
  }),
  defineMockHandler({
    method: 'delete',
    path: `${path}/pii-rules/:ruleId`,
    response: okResponse(z.null()),
    scenarios: {
      default: ({ params }) => {
        const found = findPiiRule(params.ruleId)
        if (!found) return piiNotFound()
        piiRules = piiRules.filter((rule) => rule.id !== found.id)
        return noContent()
      },
    },
  }),
])
