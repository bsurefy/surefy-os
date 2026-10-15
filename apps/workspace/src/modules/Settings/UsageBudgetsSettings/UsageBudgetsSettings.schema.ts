// SPDX-License-Identifier: AGPL-3.0-only
import { z } from 'zod'

import { BUDGET_ON_REACHED_ACTIONS } from '@surefy/contracts'

/**
 * The budget form. The amount is in currency units (the API takes micros); a team or a person is
 * chosen only when a team budget or personal limit is created. The cap of the organization budget
 * is checked on submit, where its amount is known, and again by the service.
 */
export function budgetFormSchema({ needsTarget }: { needsTarget: boolean }) {
  return z.object({
    targetId: needsTarget ? z.string().min(1) : z.string(),
    amount: z.number().nullable().pipe(z.number().min(0)),
    onReached: z.enum(BUDGET_ON_REACHED_ACTIONS),
    alertThresholdsBp: z.array(z.number().int()),
    isEnabled: z.boolean(),
  })
}

export type BudgetFormValues = z.input<ReturnType<typeof budgetFormSchema>>
export type BudgetFormOutput = z.output<ReturnType<typeof budgetFormSchema>>
