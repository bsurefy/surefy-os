// SPDX-License-Identifier: AGPL-3.0-only
import { useMutation, useQueryClient } from '@tanstack/react-query'

import type { CreatePromptInput, UpdatePromptInput } from '@surefy/contracts'
import { apiClient } from '@surefy/web-core/http'
import type { MutationHookOptions } from '@surefy/web-core/query'

import { promptsApi } from './prompts.api'
import { promptKeys } from './prompts.queries'

/** Lists of active and of deleted prompts change together. */
function useRefreshPrompts(orgId: string) {
  const queryClient = useQueryClient()
  return () => queryClient.invalidateQueries({ queryKey: promptKeys.all(orgId) })
}

export function useCreatePromptMutation(
  orgId: string,
  { silent = false }: MutationHookOptions = {},
) {
  const refresh = useRefreshPrompts(orgId)
  return useMutation({
    meta: { silent },
    mutationFn: (input: CreatePromptInput) => promptsApi.create(apiClient, orgId, input),
    onSuccess: refresh,
  })
}

export function useUpdatePromptMutation(
  orgId: string,
  { silent = false }: MutationHookOptions = {},
) {
  const refresh = useRefreshPrompts(orgId)
  return useMutation({
    meta: { silent },
    mutationFn: ({ promptId, ...input }: UpdatePromptInput & { promptId: string }) =>
      promptsApi.update(apiClient, orgId, promptId, input),
    onSuccess: refresh,
  })
}

export function useDeletePromptMutation(
  orgId: string,
  { silent = false }: MutationHookOptions = {},
) {
  const refresh = useRefreshPrompts(orgId)
  return useMutation({
    meta: { silent },
    mutationFn: (promptId: string) => promptsApi.delete(apiClient, orgId, promptId),
    onSuccess: refresh,
  })
}

export function useRestorePromptMutation(
  orgId: string,
  { silent = false }: MutationHookOptions = {},
) {
  const refresh = useRefreshPrompts(orgId)
  return useMutation({
    meta: { silent },
    mutationFn: (promptId: string) => promptsApi.restore(apiClient, orgId, promptId),
    onSuccess: refresh,
  })
}
