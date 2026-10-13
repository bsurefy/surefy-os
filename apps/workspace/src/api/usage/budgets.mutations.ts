// SPDX-License-Identifier: AGPL-3.0-only
import { useMutation, useQueryClient } from '@tanstack/react-query'

import type { CreateBudgetInput, UpdateBudgetInput } from '@surefy/contracts'
import { apiClient } from '@surefy/web-core/http'
import type { MutationHookOptions } from '@surefy/web-core/query'

import { budgetsApi } from './budgets.api'
import { budgetKeys } from './budgets.queries'

/**
 * Every budget write refreshes all budgets: a change to the organization budget moves the
 * effective amount of the team and personal ones.
 */
function useRefreshBudgets(orgId: string) {
  const queryClient = useQueryClient()
  return () => queryClient.invalidateQueries({ queryKey: budgetKeys.all(orgId) })
}

export function useCreateBudgetMutation(
  orgId: string,
  { silent = false }: MutationHookOptions = {},
) {
  const refresh = useRefreshBudgets(orgId)
  return useMutation({
    meta: { silent },
    mutationFn: (input: CreateBudgetInput) => budgetsApi.create(apiClient, orgId, input),
    onSuccess: refresh,
  })
}

export function useUpdateBudgetMutation(
  orgId: string,
  { silent = false }: MutationHookOptions = {},
) {
  const refresh = useRefreshBudgets(orgId)
  return useMutation({
    meta: { silent },
    mutationFn: ({ budgetId, ...input }: UpdateBudgetInput & { budgetId: string }) =>
      budgetsApi.update(apiClient, orgId, budgetId, input),
    onSuccess: refresh,
  })
}

export function useDeleteBudgetMutation(
  orgId: string,
  { silent = false }: MutationHookOptions = {},
) {
  const refresh = useRefreshBudgets(orgId)
  return useMutation({
    meta: { silent },
    mutationFn: (budgetId: string) => budgetsApi.remove(apiClient, orgId, budgetId),
    onSuccess: refresh,
  })
}
