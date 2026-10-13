// SPDX-License-Identifier: AGPL-3.0-only
import { z } from 'zod'

import { APPROVAL_RISKS, APPROVAL_TIMEOUT_ACTIONS, APPROVERS_MAX } from '@surefy/contracts'
import type { AgentGuard } from '@surefy/contracts'

import { DEFAULT_WAIT, WAIT_UNITS } from './GuardTab.constants'
import { joinWait, splitWait, toApproverKey, toApprovers } from './GuardTab.utils'

import type { WaitUnit } from './GuardTab.constants'

type ApprovalRule = AgentGuard['approvalRules'][number]

const MAX_WAIT_MINUTES = 43_200

/** What the form says when a value is not acceptable; translated by the caller. */
export interface ApprovalRuleFormMessages {
  action: string
  approvers: string
  wait: string
  escalate: string
}

/**
 * The approval rule form. Approvers are picker values (`role:admin`, `team:<id>`, `user:<id>`).
 * A wait needs an amount and a unit that fit the 30 days the contract allows; escalating needs
 * someone to escalate to.
 */
export function createApprovalRuleFormSchema(messages: ApprovalRuleFormMessages) {
  return z
    .object({
      action: z.string().trim().min(1, messages.action).max(200),
      approvers: z.array(z.string()).min(1, messages.approvers).max(APPROVERS_MAX),
      waits: z.boolean(),
      waitAmount: z.number().int().positive().nullable(),
      waitUnit: z.enum(WAIT_UNITS),
      onTimeout: z.enum(APPROVAL_TIMEOUT_ACTIONS),
      escalateTo: z.array(z.string()).max(APPROVERS_MAX),
      risk: z.enum(APPROVAL_RISKS),
    })
    .refine((values) => !values.waits || values.waitAmount !== null, {
      path: ['waitAmount'],
      message: messages.wait,
    })
    .refine(
      (values) =>
        !values.waits ||
        values.waitAmount === null ||
        joinWait(values.waitAmount, values.waitUnit) <= MAX_WAIT_MINUTES,
      { path: ['waitAmount'], message: messages.wait },
    )
    .refine(
      (values) => !values.waits || values.onTimeout !== 'escalate' || values.escalateTo.length > 0,
      { path: ['escalateTo'], message: messages.escalate },
    )
}
type ApprovalRuleFormSchema = ReturnType<typeof createApprovalRuleFormSchema>
export type ApprovalRuleFormValues = z.input<ApprovalRuleFormSchema>

/** A new rule: a person decides, nobody waits for ever. */
export function emptyApprovalRuleValues(action = ''): ApprovalRuleFormValues {
  return {
    action,
    approvers: ['role:admin'],
    waits: true,
    waitAmount: DEFAULT_WAIT.amount,
    waitUnit: DEFAULT_WAIT.unit,
    onTimeout: 'reject',
    escalateTo: [],
    risk: 'medium',
  }
}

export function toFormValues(rule: ApprovalRule): ApprovalRuleFormValues {
  const wait = rule.waitMinutes === null ? null : splitWait(rule.waitMinutes)
  return {
    action: rule.match.action,
    approvers: rule.approvers.map(toApproverKey),
    waits: wait !== null,
    waitAmount: wait?.amount ?? DEFAULT_WAIT.amount,
    waitUnit: (wait?.unit ?? DEFAULT_WAIT.unit) satisfies WaitUnit,
    onTimeout: rule.onTimeout ?? 'reject',
    escalateTo: rule.escalateTo.map(toApproverKey),
    risk: rule.risk,
  }
}

/**
 * The rule the form describes. Editing keeps what the form does not show (the conditions of the
 * rule's match); a new rule gets the id it was given.
 */
export function toApprovalRule(
  values: z.output<ApprovalRuleFormSchema>,
  id: string,
  previous?: ApprovalRule,
): ApprovalRule {
  const waitMinutes =
    values.waits && values.waitAmount !== null ? joinWait(values.waitAmount, values.waitUnit) : null
  return {
    id,
    match: { ...previous?.match, action: values.action },
    approvers: toApprovers(values.approvers),
    waitMinutes,
    onTimeout: waitMinutes === null ? null : values.onTimeout,
    escalateTo:
      waitMinutes !== null && values.onTimeout === 'escalate' ? toApprovers(values.escalateTo) : [],
    risk: values.risk,
  }
}
