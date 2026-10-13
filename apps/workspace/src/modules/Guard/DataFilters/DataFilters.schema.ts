// SPDX-License-Identifier: AGPL-3.0-only
import { z } from 'zod'

import { PII_ACTIONS, PII_CUSTOM_LABEL_MAX_LENGTH, PII_PATTERN_MAX_LENGTH } from '@surefy/contracts'

/** What the exception form says when a value is not acceptable; translated by the caller. */
export interface ExceptionFormMessages {
  team: string
  reason: string
}

/** An exception for one team: its action, and the reason that goes to the audit log. */
export function createExceptionSchema(messages: ExceptionFormMessages) {
  return z.object({
    teamId: z.string().min(1, messages.team),
    action: z.enum(PII_ACTIONS),
    reason: z.string().trim().min(1, messages.reason).max(1000),
  })
}
export type ExceptionFormValues = z.input<ReturnType<typeof createExceptionSchema>>

export interface CustomTypeFormMessages {
  label: string
  pattern: string
}

/** A custom type: a name, the pattern that finds it, and its action. */
export function createCustomTypeSchema(messages: CustomTypeFormMessages) {
  return z.object({
    label: z.string().trim().min(1, messages.label).max(PII_CUSTOM_LABEL_MAX_LENGTH),
    pattern: z.string().min(1, messages.pattern).max(PII_PATTERN_MAX_LENGTH),
    action: z.enum(PII_ACTIONS),
  })
}
export type CustomTypeFormValues = z.input<ReturnType<typeof createCustomTypeSchema>>
