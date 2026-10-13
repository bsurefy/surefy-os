// SPDX-License-Identifier: AGPL-3.0-only
import { z } from 'zod'

import {
  ACTION_LIMIT_REACHED_ACTIONS,
  APPROVAL_RISKS,
  APPROVAL_TIMEOUT_ACTIONS,
  APPROVERS_MAX,
  CONTENT_FILTER_ACTIONS,
  GUARD_CONDITION_OPERATORS,
  GUARD_CONDITIONS_MAX,
  GUARD_WAIT_MINUTES_MAX,
  GUARDRAIL_SCOPES,
  GUARDRAIL_TYPES,
} from '@surefy/contracts'

import { MINUTES_PER, WAIT_UNITS } from '../Guardrails.constants'

/** What the form says when a value is not acceptable; translated by the caller. */
export interface GuardrailFormMessages {
  name: string
  action: string
  team: string
  condition: string
  approvers: string
  wait: string
  escalate: string
  thresholds: string
  limit: string
  categories: string
}

const conditionSchema = z.object({
  field: z
    .string()
    .trim()
    .regex(/^[a-zA-Z][a-zA-Z0-9_.]*$/)
    .max(100),
  operator: z.enum(GUARD_CONDITION_OPERATORS),
  /** Typed text: a number, `true`/`false`, text, or a comma-separated list for "is one of". */
  value: z.string().trim().min(1).max(500),
})

type Fail = (path: string, message: string) => void
interface FormValues {
  type: (typeof GUARDRAIL_TYPES)[number]
  approvers: string[]
  waits: boolean
  waitAmount: number | null
  waitUnit: (typeof WAIT_UNITS)[number]
  onTimeout: (typeof APPROVAL_TIMEOUT_ACTIONS)[number]
  escalateTo: string[]
  autoPercent: number
  reviewPercent: number
  perActionAmount: number | null
  perDayCount: number | null
  perDayAmount: number | null
  categories: string[]
}

function checkApprovalRule(values: FormValues, messages: GuardrailFormMessages, fail: Fail) {
  if (values.approvers.length === 0) fail('approvers', messages.approvers)
  if (!values.waits) return
  const minutes = (values.waitAmount ?? 0) * MINUTES_PER[values.waitUnit]
  if (values.waitAmount === null || minutes > GUARD_WAIT_MINUTES_MAX) {
    fail('waitAmount', messages.wait)
  }
  if (values.onTimeout === 'escalate' && values.escalateTo.length === 0) {
    fail('escalateTo', messages.escalate)
  }
}

/** Only the fields of the chosen type are checked. */
function checkTypeFields(values: FormValues, messages: GuardrailFormMessages, fail: Fail) {
  const noLimit =
    values.perActionAmount === null && values.perDayCount === null && values.perDayAmount === null
  if (values.type === 'approval_rule') checkApprovalRule(values, messages, fail)
  if (values.type === 'threshold_override' && values.reviewPercent >= values.autoPercent) {
    fail('reviewPercent', messages.thresholds)
  }
  if (values.type === 'action_limit' && noLimit) fail('perDayCount', messages.limit)
  if (values.type === 'content_filter' && values.categories.length === 0) {
    fail('categories', messages.categories)
  }
}

/**
 * The guardrail form: one flat shape for every type, so switching the type in the add sheet keeps
 * the common fields. Only the fields of the chosen type are checked and sent. Approvers are picker
 * values (`role:admin`, `team:<id>`, `user:<id>`); thresholds are whole percents; amounts are in
 * the organization's currency.
 */
export function createGuardrailFormSchema(messages: GuardrailFormMessages) {
  return z
    .object({
      name: z.string().trim().min(1, messages.name).max(120),
      type: z.enum(GUARDRAIL_TYPES),
      scope: z.enum(GUARDRAIL_SCOPES),
      teamId: z.string().nullable(),
      isEnabled: z.boolean(),
      action: z.string().trim().min(1, messages.action).max(200),
      conditions: z.array(conditionSchema).max(GUARD_CONDITIONS_MAX),
      approvers: z.array(z.string()).max(APPROVERS_MAX),
      waits: z.boolean(),
      waitAmount: z.number().int().positive().nullable(),
      waitUnit: z.enum(WAIT_UNITS),
      onTimeout: z.enum(APPROVAL_TIMEOUT_ACTIONS),
      escalateTo: z.array(z.string()).max(APPROVERS_MAX),
      risk: z.enum(APPROVAL_RISKS),
      autoPercent: z.number().int().min(1).max(100),
      reviewPercent: z.number().int().min(0).max(99),
      perActionAmount: z.number().positive().nullable(),
      perDayCount: z.number().int().positive().nullable(),
      perDayAmount: z.number().positive().nullable(),
      onReached: z.enum(ACTION_LIMIT_REACHED_ACTIONS),
      categories: z.array(z.string()).max(20),
      filterAction: z.enum(CONTENT_FILTER_ACTIONS),
    })
    .superRefine((values, context) => {
      const fail = (path: string, message: string) => {
        context.addIssue({ code: 'custom', path: [path], message })
      }
      if (values.scope === 'team' && !values.teamId) fail('teamId', messages.team)
      checkTypeFields(values, messages, fail)
    })
}
type GuardrailFormSchema = ReturnType<typeof createGuardrailFormSchema>
export type GuardrailFormValues = z.input<GuardrailFormSchema>
export type GuardrailFormOutput = z.output<GuardrailFormSchema>
