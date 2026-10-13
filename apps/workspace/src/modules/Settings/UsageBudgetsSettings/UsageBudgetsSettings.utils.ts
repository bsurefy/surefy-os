// SPDX-License-Identifier: AGPL-3.0-only
import {
  BUDGET_DEFAULT_ALERT_THRESHOLDS_BP,
  BUDGET_METER_WARNING_BP,
  ERROR_CODES,
} from '@surefy/contracts'
import type {
  BudgetDto,
  BudgetScope,
  CreateBudgetInput,
  MemberDto,
  TeamRefDto,
  UpdateBudgetInput,
} from '@surefy/contracts'

import {
  BASIS_POINTS,
  CHARGING_EXAMPLES_MAX,
  MICROS_PER_UNIT,
} from './UsageBudgetsSettings.constants'

import type { BudgetFormOutput, BudgetFormValues } from './UsageBudgetsSettings.schema'
import type { ChargingExample } from './UsageBudgetsSettings.types'

export const microsToUnits = (micros: number): number => micros / MICROS_PER_UNIT
export const unitsToMicros = (units: number): number => Math.round(units * MICROS_PER_UNIT)

/** "$" for USD in English; the code itself when the locale has no symbol for it. */
export function getCurrencySymbol(currency: string, locale: string): string {
  const parts = new Intl.NumberFormat(locale, { style: 'currency', currency }).formatToParts(0)
  return parts.find((part) => part.type === 'currency')?.value ?? currency
}

/**
 * Where the meter turns to warning, as a share of the amount: the highest alert below 100%, or
 * 80% without one (`budgetMeterState` in the contracts).
 */
export function getWarningShare(alertThresholdsBp: readonly number[]): number {
  const below = alertThresholdsBp.filter((bp) => bp < BASIS_POINTS)
  return (below.length > 0 ? Math.max(...below) : BUDGET_METER_WARNING_BP) / BASIS_POINTS
}

export const bpToPercent = (bp: number): number => bp / (BASIS_POINTS / 100)

/** The amount a team budget or personal limit may not exceed: the enabled organization budget. */
export function getParentAmountMicros(
  scope: BudgetScope,
  organization: BudgetDto | null | undefined,
): number | null {
  if (scope === 'organization' || !organization?.isEnabled) return null
  return organization.amountMicros
}

export function toBudgetFormValues(budget: BudgetDto | null): BudgetFormValues {
  return {
    targetId: budget?.team?.id ?? budget?.user?.id ?? '',
    amount: budget ? microsToUnits(budget.amountMicros) : null,
    onReached: budget?.onReached ?? 'notify_only',
    alertThresholdsBp: budget?.alertThresholdsBp ?? [...BUDGET_DEFAULT_ALERT_THRESHOLDS_BP],
    isEnabled: budget?.isEnabled ?? true,
  }
}

export function toCreateBudgetInput(
  scope: BudgetScope,
  values: BudgetFormOutput,
): CreateBudgetInput {
  const settings = {
    amountMicros: unitsToMicros(values.amount),
    onReached: values.onReached,
    alertThresholdsBp: values.alertThresholdsBp,
    isEnabled: values.isEnabled,
  }
  if (scope === 'team') return { scope, teamId: values.targetId, ...settings }
  if (scope === 'user') return { scope, userId: values.targetId, ...settings }
  return { scope, ...settings }
}

function sameThresholds(a: readonly number[], b: readonly number[]): boolean {
  const left = [...a].sort((x, y) => x - y)
  const right = [...b].sort((x, y) => x - y)
  return left.length === right.length && left.every((value, index) => value === right[index])
}

/** Only the changed fields; null when nothing changed (the PATCH needs at least one). */
export function toUpdateBudgetInput(
  budget: BudgetDto,
  values: BudgetFormOutput,
): UpdateBudgetInput | null {
  const input: UpdateBudgetInput = {}
  const amountMicros = unitsToMicros(values.amount)
  if (amountMicros !== budget.amountMicros) input.amountMicros = amountMicros
  if (values.onReached !== budget.onReached) input.onReached = values.onReached
  if (!sameThresholds(values.alertThresholdsBp, budget.alertThresholdsBp)) {
    input.alertThresholdsBp = values.alertThresholdsBp
  }
  if (values.isEnabled !== budget.isEnabled) input.isEnabled = values.isEnabled
  return Object.keys(input).length > 0 ? input : null
}

/**
 * Lowering an enabled budget to this month's spend or below is T2: the budget is reached at once.
 * Returns the spend to name in the confirmation, or null when no confirmation is needed.
 */
export function getLoweredBelowSpend(
  budget: BudgetDto | null,
  values: BudgetFormOutput,
): number | null {
  if (!budget?.meter || !values.isEnabled) return null
  const amountMicros = unitsToMicros(values.amount)
  if (amountMicros >= budget.amountMicros) return null
  return budget.meter.spentMicros >= amountMicros ? budget.meter.spentMicros : null
}

/**
 * People in more than one team, for the charging note next to the team budgets: their usage
 * counts only toward their primary team.
 */
export function getChargingExamples(members: readonly MemberDto[]): ChargingExample[] {
  return members
    .filter((member) => member.status === 'active' && member.teams.length > 1)
    .slice(0, CHARGING_EXAMPLES_MAX)
    .map((member) => ({
      userId: member.user.id,
      name: member.user.name,
      teams: member.teams.map((team) => team.name),
      primaryTeam: member.teams.find((team) => team.id === member.primaryTeamId)?.name ?? null,
    }))
}

/** Teams that have no team budget yet, for the create dialog's picker. */
export function getTeamsWithoutBudget(
  teams: readonly TeamRefDto[],
  budgets: readonly BudgetDto[],
): TeamRefDto[] {
  const taken = new Set(budgets.map((budget) => budget.team?.id))
  return teams.filter((team) => !taken.has(team.id))
}

/**
 * Where the form shows a failed save: above the organization budget on the amount, a team or
 * person that already has a budget (or left) on the picker, anything else above the form.
 */
export function getBudgetErrorField(
  code: string,
  hasTargetField: boolean,
): 'amount' | 'targetId' | 'root' {
  if (code === ERROR_CODES.ACCESS_EXCEEDS_PARENT) return 'amount'
  const isTargetError =
    code === ERROR_CODES.BUDGET_ALREADY_EXISTS || code === ERROR_CODES.BUDGET_TARGET_NOT_FOUND
  return hasTargetField && isTargetError ? 'targetId' : 'root'
}
