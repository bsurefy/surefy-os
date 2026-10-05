// SPDX-License-Identifier: AGPL-3.0-only
import { useMutation, useQueryClient } from '@tanstack/react-query'

import type { CompleteSetupInput, SetupInput } from '@surefy/contracts'
import { meKeys } from '@surefy/web-core/api/me'
import { apiClient } from '@surefy/web-core/http'
import type { MutationHookOptions } from '@surefy/web-core/query'

import { setupApi } from './setup.api'
import { setupKeys } from './setup.queries'

/** Creates the Owner and the organization and signs the Owner in, so the session and status refresh. */
export function useRunSetupMutation({ silent = false }: MutationHookOptions = {}) {
  const queryClient = useQueryClient()
  return useMutation({
    meta: { silent },
    mutationFn: (input: SetupInput) => setupApi.run(apiClient, input),
    onSuccess: async () => {
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: meKeys.all() }),
        queryClient.invalidateQueries({ queryKey: setupKeys.status() }),
      ])
    },
  })
}

/** The Owner finished or left the remaining steps. */
export function useCompleteSetupMutation(
  orgId: string,
  { silent = false }: MutationHookOptions = {},
) {
  const queryClient = useQueryClient()
  return useMutation({
    meta: { silent },
    mutationFn: (input: CompleteSetupInput) => setupApi.complete(apiClient, orgId, input),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: setupKeys.all() }),
  })
}

/** Hides the checklist on the home screen for this member, or shows it again. */
export function useSetChecklistDismissedMutation(
  orgId: string,
  { silent = false }: MutationHookOptions = {},
) {
  const queryClient = useQueryClient()
  return useMutation({
    meta: { silent },
    mutationFn: (checklistDismissed: boolean) =>
      setupApi.setChecklistDismissed(apiClient, orgId, checklistDismissed),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: setupKeys.checklist(orgId) }),
  })
}
