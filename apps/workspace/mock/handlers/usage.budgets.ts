// SPDX-License-Identifier: AGPL-3.0-only
import { z } from 'zod'

import {
  budgetDtoSchema,
  budgetMeterState,
  budgetUsedBp,
  createBudgetInputSchema,
  ERROR_CODES,
  okResponse,
  pageResponse,
  PAGE_SIZE,
  updateBudgetInputSchema,
} from '@surefy/contracts'
import type { BudgetDto, BudgetScope, BudgetTarget, TeamRefDto } from '@surefy/contracts'
import { defineFactory, fixtureUuid } from '@surefy/web-core/testing'
import { defineMockHandler, mockError, mockOk, mockPage } from '@surefy/web-core/testing/mock'

import { MAYA, OMAR } from './shell.fixtures'
import { ANA, SALES_TEAM_ID, SUPPORT_TEAM_ID } from './teams'

const BUDGET_KIND = 95
const HTTP_NOT_FOUND = 404
const HTTP_CONFLICT = 409
const HTTP_UNPROCESSABLE = 422
const MICROS = 1_000_000
const NOW = '2026-01-15T09:00:00.000Z'
const PERIOD_START = '2026-01-01'
const PERIOD_END = '2026-02-01'
const CURRENCY = 'USD'

export const ORGANIZATION_BUDGET_ID = fixtureUuid(BUDGET_KIND, 1)
export const SUPPORT_BUDGET_ID = fixtureUuid(BUDGET_KIND, 2)
export const SALES_BUDGET_ID = fixtureUuid(BUDGET_KIND, 3)
export const OMAR_BUDGET_ID = fixtureUuid(BUDGET_KIND, 4)
export const ANA_BUDGET_ID = fixtureUuid(BUDGET_KIND, 5)

const SUPPORT: TeamRefDto = { id: SUPPORT_TEAM_ID, name: 'Support' }
const SALES: TeamRefDto = { id: SALES_TEAM_ID, name: 'Sales' }
const TEAMS: Record<string, TeamRefDto> = { [SUPPORT_TEAM_ID]: SUPPORT, [SALES_TEAM_ID]: SALES }
const PEOPLE = { [MAYA.id]: MAYA, [OMAR.id]: OMAR, [ANA.id]: ANA }
/** Each person's primary team, as the members mock has it. */
const PRIMARY_TEAMS: Record<string, TeamRefDto | null> = {
  [MAYA.id]: SUPPORT,
  [OMAR.id]: SUPPORT,
  [ANA.id]: SALES,
}

/** This month's spend per scope, in micros: what a new budget for it starts from. */
const SPEND: Record<string, number> = {
  organization: 1240 * MICROS,
  [SUPPORT_TEAM_ID]: 430 * MICROS,
  [SALES_TEAM_ID]: 310 * MICROS,
  [MAYA.id]: 96 * MICROS,
  [OMAR.id]: 12 * MICROS,
  [ANA.id]: 64 * MICROS,
}

const spendOf = (budget: Pick<BudgetDto, 'scope' | 'team' | 'user'>) =>
  SPEND[budget.team?.id ?? budget.user?.id ?? 'organization'] ?? 0

/** An enabled organization budget of $1,000 that only notifies, unless overridden. */
export const budgetFactory = defineFactory(budgetDtoSchema, (sequence): BudgetDto => ({
  id: fixtureUuid(BUDGET_KIND, sequence),
  scope: 'organization',
  team: null,
  user: null,
  primaryTeam: null,
  period: 'month',
  amountMicros: 1000 * MICROS,
  currency: CURRENCY,
  onReached: 'notify_only',
  alertThresholdsBp: [5000, 8000, 10_000],
  isEnabled: true,
  meter: null,
  lastAlert: null,
  updatedBy: MAYA,
  createdAt: '2026-01-02T09:00:00.000Z',
  updatedAt: '2026-01-02T09:00:00.000Z',
}))

/** The meter as the service computes it: against the minimum of this and the organization budget. */
function withMeter(budget: BudgetDto, all: readonly BudgetDto[]): BudgetDto {
  if (!budget.isEnabled) return { ...budget, meter: null }
  const organization = all.find((item) => item.scope === 'organization' && item.isEnabled)
  const effectiveAmountMicros =
    organization && budget.scope !== 'organization'
      ? Math.min(budget.amountMicros, organization.amountMicros)
      : budget.amountMicros
  const spentMicros = spendOf(budget)
  return {
    ...budget,
    meter: {
      budgetId: budget.id,
      scope: budget.scope,
      amountMicros: budget.amountMicros,
      effectiveAmountMicros,
      spentMicros,
      currency: budget.currency,
      usedBp: budgetUsedBp(spentMicros, effectiveAmountMicros),
      state: budgetMeterState(spentMicros, effectiveAmountMicros, budget.alertThresholdsBp),
      onReached: budget.onReached,
      periodStart: PERIOD_START,
      periodEnd: PERIOD_END,
    },
  }
}

const withMeters = (all: BudgetDto[]) => all.map((budget) => withMeter(budget, all))

function seedBudgets(): BudgetDto[] {
  budgetFactory.reset()
  return withMeters([
    budgetFactory({
      amountMicros: 2000 * MICROS,
      onReached: 'switch_to_local',
      lastAlert: { thresholdBp: 5000, triggeredAt: '2026-01-11T14:00:00.000Z' },
    }),
    budgetFactory({
      scope: 'team',
      team: SUPPORT,
      amountMicros: 500 * MICROS,
      onReached: 'pause_cloud_models',
      lastAlert: { thresholdBp: 8000, triggeredAt: '2026-01-13T10:00:00.000Z' },
    }),
    budgetFactory({
      scope: 'team',
      team: SALES,
      amountMicros: 300 * MICROS,
      lastAlert: { thresholdBp: 10_000, triggeredAt: '2026-01-14T16:00:00.000Z' },
      updatedBy: null,
    }),
    budgetFactory({
      scope: 'user',
      user: OMAR,
      primaryTeam: SUPPORT,
      amountMicros: 50 * MICROS,
      onReached: 'switch_to_local',
    }),
    budgetFactory({
      scope: 'user',
      user: ANA,
      primaryTeam: SALES,
      amountMicros: 100 * MICROS,
      isEnabled: false,
    }),
  ])
}

let budgets = seedBudgets()

/** Back to the seeded budgets; tests call it between cases. */
export function resetBudgetsMock(): void {
  budgets = seedBudgets()
}

/**
 * The meter of the enabled budget of the `teamId` or `userId` in the query, or of the
 * organization without either; null when that scope has none. Insights' budget meter reads it.
 */
export function budgetMeterFor(query: URLSearchParams): BudgetDto['meter'] {
  const teamId = query.get('teamId')
  const userId = query.get('userId')
  const matches = (budget: BudgetDto) => {
    if (teamId) return budget.team?.id === teamId
    if (userId) return budget.user?.id === userId
    return budget.scope === 'organization'
  }
  return budgets.find((budget) => budget.isEnabled && matches(budget))?.meter ?? null
}

const SCOPE_ORDER: Record<BudgetScope, number> = { organization: 0, team: 1, user: 2 }
const nameOf = (budget: BudgetDto) => budget.team?.name ?? budget.user?.name ?? ''
const sameTarget = (budget: BudgetDto, target: BudgetTarget) =>
  budget.scope === target.scope &&
  (target.scope !== 'team' || budget.team?.id === target.teamId) &&
  (target.scope !== 'user' || budget.user?.id === target.userId)

const path = '/orgs/:orgId/budgets'
const find = (id: unknown) => budgets.find((budget) => budget.id === id)
const notFound = () => mockError(HTTP_NOT_FOUND, ERROR_CODES.BUDGET_NOT_FOUND, 'Budget not found')
const alreadyExists = () =>
  mockError(HTTP_CONFLICT, ERROR_CODES.BUDGET_ALREADY_EXISTS, 'This scope has a budget')
const exceedsParent = (parentValue: number) =>
  mockError(
    HTTP_UNPROCESSABLE,
    ERROR_CODES.ACCESS_EXCEEDS_PARENT,
    'Above the organization budget',
    {
      details: [{ field: 'amountMicros', parentValue, parentSource: 'organization' }],
    },
  )

/** The amount a team or personal budget may not exceed; null without an enabled organization one. */
function parentAmount(scope: BudgetScope): number | null {
  if (scope === 'organization') return null
  const organization = budgets.find((item) => item.scope === 'organization' && item.isEnabled)
  return organization?.amountMicros ?? null
}

/**
 * Budgets (B6-10's routes) in the usage domain: an organization budget at 62% that switches to
 * local models, Support at 86% (cloud models pause at 100%), Sales over its budget (notify only),
 * a personal limit for Omar and a turned-off one for Ana. Scenarios: `empty` has no budgets at
 * all; on a create or a change, `exceeds-parent` fails with `ACCESS_EXCEEDS_PARENT` and on a
 * create `already-exists` with `BUDGET_ALREADY_EXISTS`.
 */
export const budgetHandlers = [
  defineMockHandler({
    method: 'get',
    path,
    response: pageResponse(budgetDtoSchema),
    scenarios: {
      default: ({ request }) => {
        const url = new URL(request.url)
        const scopes = url.searchParams.getAll('scope')
        const teamId = url.searchParams.get('teamId')
        const userId = url.searchParams.get('userId')
        const q = url.searchParams.get('q')?.toLowerCase()
        const items = budgets
          .filter(
            (budget) =>
              (scopes.length === 0 || scopes.includes(budget.scope)) &&
              (!teamId || budget.team?.id === teamId) &&
              (!userId || budget.user?.id === userId) &&
              (!q ||
                nameOf(budget).toLowerCase().includes(q) ||
                (budget.user?.email.toLowerCase().includes(q) ?? false)),
          )
          .sort(
            (a, b) =>
              SCOPE_ORDER[a.scope] - SCOPE_ORDER[b.scope] || nameOf(a).localeCompare(nameOf(b)),
          )
        const limit = Number(url.searchParams.get('limit') ?? PAGE_SIZE.default)
        const start = Number(url.searchParams.get('cursor') ?? 0)
        const next = start + limit < items.length ? String(start + limit) : null
        return mockPage(items.slice(start, start + limit), next)
      },
    },
  }),
  defineMockHandler({
    method: 'post',
    path,
    response: okResponse(budgetDtoSchema),
    scenarios: {
      default: async ({ request }) => {
        const input = createBudgetInputSchema.parse(await request.json())
        if (budgets.some((budget) => sameTarget(budget, input))) return alreadyExists()
        const team = input.scope === 'team' ? TEAMS[input.teamId] : undefined
        const user = input.scope === 'user' ? PEOPLE[input.userId] : undefined
        if ((input.scope === 'team' && !team) || (input.scope === 'user' && !user)) {
          return mockError(
            HTTP_UNPROCESSABLE,
            ERROR_CODES.BUDGET_TARGET_NOT_FOUND,
            'Team or member not found',
          )
        }
        const parent = parentAmount(input.scope)
        if (parent !== null && input.amountMicros > parent) return exceedsParent(parent)
        const created = budgetFactory({
          scope: input.scope,
          team: team ?? null,
          user: user ?? null,
          primaryTeam: user ? (PRIMARY_TEAMS[user.id] ?? null) : null,
          amountMicros: input.amountMicros,
          onReached: input.onReached,
          alertThresholdsBp: input.alertThresholdsBp,
          isEnabled: input.isEnabled,
          createdAt: NOW,
          updatedAt: NOW,
        })
        budgets = withMeters([...budgets, created])
        return mockOk(find(created.id) ?? created, { status: 201 })
      },
      'exceeds-parent': () => exceedsParent(2000 * MICROS),
      'already-exists': alreadyExists,
    },
  }),
  defineMockHandler({
    method: 'patch',
    path: `${path}/:budgetId`,
    response: okResponse(budgetDtoSchema),
    scenarios: {
      default: async ({ params, request }) => {
        const found = find(params.budgetId)
        if (!found) return notFound()
        const input = updateBudgetInputSchema.parse(await request.json())
        const parent = parentAmount(found.scope)
        if (parent !== null && input.amountMicros !== undefined && input.amountMicros > parent) {
          return exceedsParent(parent)
        }
        const updated: BudgetDto = { ...found, ...input, updatedBy: MAYA, updatedAt: NOW }
        budgets = withMeters(budgets.map((budget) => (budget.id === found.id ? updated : budget)))
        return mockOk(find(found.id) ?? updated)
      },
      'exceeds-parent': () => exceedsParent(2000 * MICROS),
    },
  }),
  defineMockHandler({
    method: 'delete',
    path: `${path}/:budgetId`,
    response: okResponse(z.null()),
    scenarios: {
      default: ({ params }) => {
        if (!find(params.budgetId)) return notFound()
        budgets = withMeters(budgets.filter((budget) => budget.id !== params.budgetId))
        return new Response(null, { status: 204 })
      },
    },
  }),
]
