// SPDX-License-Identifier: AGPL-3.0-only
import { useMutation, useQueryClient } from '@tanstack/react-query'

import type { CreateApiKeyInput } from '@surefy/contracts'
import { apiClient } from '@surefy/web-core/http'
import type { MutationHookOptions } from '@surefy/web-core/query'

import { apiKeysApi } from './apiKeys.api'
import { apiKeyKeys } from './apiKeys.queries'

/** Creating needs a fresh session: a stale one opens "Confirm it's you" and nothing is created. */
export function useCreateApiKeyMutation(
  orgId: string,
  { silent = false }: MutationHookOptions = {},
) {
  const queryClient = useQueryClient()
  return useMutation({
    meta: { silent },
    mutationFn: (input: CreateApiKeyInput) => apiKeysApi.create(apiClient, orgId, input),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: apiKeyKeys.lists(orgId) }),
  })
}

export function useRenameApiKeyMutation(
  orgId: string,
  { silent = false }: MutationHookOptions = {},
) {
  const queryClient = useQueryClient()
  return useMutation({
    meta: { silent },
    mutationFn: ({ keyId, name }: { keyId: string; name: string }) =>
      apiKeysApi.rename(apiClient, orgId, keyId, { name }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: apiKeyKeys.lists(orgId) }),
  })
}

export function useRevokeApiKeyMutation(
  orgId: string,
  { silent = false }: MutationHookOptions = {},
) {
  const queryClient = useQueryClient()
  return useMutation({
    meta: { silent },
    mutationFn: (keyId: string) => apiKeysApi.revoke(apiClient, orgId, keyId),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: apiKeyKeys.all(orgId) }),
  })
}
