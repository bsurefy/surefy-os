// SPDX-License-Identifier: AGPL-3.0-only
import { approverSchema } from '@surefy/contracts'
import type {
  Approver,
  CreateGuardrailInput,
  GuardCondition,
  GuardMatch,
  GuardrailDefinition,
  GuardrailDto,
  GuardrailType,
} from '@surefy/contracts'

import {
  basisPointsToPercent,
  microsToUnits,
  percentToBasisPoints,
  unitsToMicros,
} from '../../Guard.utils'
import { DEFAULT_WAIT, MINUTES_PER, WAIT_UNITS } from '../Guardrails.constants'

import type { WaitUnit } from '../Guardrails.constants'
import type { GuardrailFormOutput, GuardrailFormValues } from './GuardrailSheet.schema'

/** An approver as one value of a picker: `role:admin`, `team:<id>`, `user:<id>`. */
export function toApproverKey(approver: Approver): string {
  return `${approver.type}:${approver.id}`
}

export function toApprovers(keys: readonly string[]): Approver[] {
  return keys.flatMap((key) => {
    const [type, ...rest] = key.split(':')
    const parsed = approverSchema.safeParse({ type, id: rest.join(':') })
    return parsed.success ? [parsed.data] : []
  })
}

/** Minutes as the biggest whole unit they fill: 120 → 2 hours, 90 → 90 minutes. */
export function splitWait(minutes: number): { amount: number; unit: WaitUnit } {
  const unit = [...WAIT_UNITS].reverse().find((candidate) => minutes % MINUTES_PER[candidate] === 0)
  const chosen = unit ?? 'minutes'
  return { amount: minutes / MINUTES_PER[chosen], unit: chosen }
}

/** A condition's value as text for the form: a list reads "eu, us". */
export function conditionValueToText(value: GuardCondition['value']): string {
  return Array.isArray(value) ? value.join(', ') : String(value)
}

const asScalar = (text: string): string | number => {
  const number = Number(text)
  return text !== '' && Number.isFinite(number) ? number : text
}

const asList = (text: string): (string | number)[] =>
  text
    .split(',')
    .map((item) => item.trim())
    .filter((item) => item !== '')
    .map(asScalar)

const asBooleanOrScalar = (text: string): string | number | boolean => {
  const flags: Record<string, boolean> = { true: true, false: false }
  return flags[text] ?? asScalar(text)
}

/** The typed value a form text stands for: a number, `true`/`false`, a list for "is one of", or text. */
export function textToConditionValue(
  text: string,
  operator: GuardCondition['operator'],
): GuardCondition['value'] {
  const trimmed = text.trim()
  return operator === 'in' ? asList(trimmed) : asBooleanOrScalar(trimmed)
}

/** The empty form of a new guardrail of `type`. */
export function emptyGuardrailValues(type: GuardrailType): GuardrailFormValues {
  return {
    name: '',
    type,
    scope: 'organization',
    teamId: null,
    isEnabled: true,
    action: '',
    conditions: [],
    approvers: ['role:admin'],
    waits: true,
    waitAmount: DEFAULT_WAIT.amount,
    waitUnit: DEFAULT_WAIT.unit,
    onTimeout: 'reject',
    escalateTo: [],
    risk: 'medium',
    autoPercent: 95,
    reviewPercent: 70,
    perActionAmount: null,
    perDayCount: null,
    perDayAmount: null,
    onReached: 'block',
    categories: [],
    filterAction: 'flag',
  }
}

const matchToValues = (match: GuardMatch) => ({
  action: match.action,
  conditions: (match.conditions ?? []).map((condition) => ({
    field: condition.field,
    operator: condition.operator,
    value: conditionValueToText(condition.value),
  })),
})

/** The form for an existing guardrail: the common fields plus those of its type. */
export function toGuardrailValues(guardrail: GuardrailDto): GuardrailFormValues {
  const { definition } = guardrail
  const base: GuardrailFormValues = {
    ...emptyGuardrailValues(guardrail.type),
    name: guardrail.name,
    scope: guardrail.scope,
    teamId: guardrail.team?.id ?? null,
    isEnabled: guardrail.isEnabled,
    ...matchToValues(definition.match),
  }
  switch (definition.kind) {
    case 'approval_rule': {
      const wait = definition.waitMinutes === null ? null : splitWait(definition.waitMinutes)
      return {
        ...base,
        approvers: definition.approvers.map(toApproverKey),
        waits: wait !== null,
        waitAmount: wait?.amount ?? DEFAULT_WAIT.amount,
        waitUnit: wait?.unit ?? DEFAULT_WAIT.unit,
        onTimeout: definition.onTimeout ?? 'reject',
        escalateTo: definition.escalateTo.map(toApproverKey),
        risk: definition.risk,
      }
    }
    case 'threshold_override':
      return {
        ...base,
        autoPercent: basisPointsToPercent(definition.autoBp),
        reviewPercent: basisPointsToPercent(definition.reviewBp),
      }
    case 'action_limit':
      return {
        ...base,
        perActionAmount:
          definition.limit.perActionAmountMicros === undefined
            ? null
            : microsToUnits(definition.limit.perActionAmountMicros),
        perDayCount: definition.limit.perDayCount ?? null,
        perDayAmount:
          definition.limit.perDayAmountMicros === undefined
            ? null
            : microsToUnits(definition.limit.perDayAmountMicros),
        onReached: definition.onReached,
      }
    case 'content_filter':
      return { ...base, categories: definition.categories, filterAction: definition.action }
    case 'blocked_action':
      return base
  }
}

function toMatch(values: GuardrailFormOutput): GuardMatch {
  const conditions: GuardCondition[] = values.conditions.map((condition) => ({
    field: condition.field,
    operator: condition.operator,
    value: textToConditionValue(condition.value, condition.operator),
  }))
  return conditions.length > 0 ? { action: values.action, conditions } : { action: values.action }
}

/** The definition the form describes, for its type. */
export function toGuardrailDefinition(values: GuardrailFormOutput): GuardrailDefinition {
  const match = toMatch(values)
  switch (values.type) {
    case 'approval_rule': {
      const waitMinutes =
        values.waits && values.waitAmount !== null
          ? values.waitAmount * MINUTES_PER[values.waitUnit]
          : null
      return {
        version: 1,
        kind: 'approval_rule',
        match,
        approvers: toApprovers(values.approvers),
        waitMinutes,
        onTimeout: waitMinutes === null ? null : values.onTimeout,
        escalateTo:
          waitMinutes !== null && values.onTimeout === 'escalate'
            ? toApprovers(values.escalateTo)
            : [],
        risk: values.risk,
      }
    }
    case 'threshold_override':
      return {
        version: 1,
        kind: 'threshold_override',
        match,
        autoBp: percentToBasisPoints(values.autoPercent),
        reviewBp: percentToBasisPoints(values.reviewPercent),
      }
    case 'blocked_action':
      return { version: 1, kind: 'blocked_action', match }
    case 'action_limit':
      return {
        version: 1,
        kind: 'action_limit',
        match,
        limit: {
          ...(values.perActionAmount !== null && {
            perActionAmountMicros: unitsToMicros(values.perActionAmount),
          }),
          ...(values.perDayCount !== null && { perDayCount: values.perDayCount }),
          ...(values.perDayAmount !== null && {
            perDayAmountMicros: unitsToMicros(values.perDayAmount),
          }),
        },
        onReached: values.onReached,
      }
    case 'content_filter':
      return {
        version: 1,
        kind: 'content_filter',
        match,
        categories: values.categories,
        action: values.filterAction,
      }
  }
}

export function toCreateInput(values: GuardrailFormOutput): CreateGuardrailInput {
  return {
    name: values.name,
    scope: values.scope,
    ...(values.scope === 'team' && values.teamId ? { teamId: values.teamId } : {}),
    definition: toGuardrailDefinition(values),
    isEnabled: values.isEnabled,
  }
}
