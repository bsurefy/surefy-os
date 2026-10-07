// SPDX-License-Identifier: AGPL-3.0-only
import { useMutation, useQueryClient } from '@tanstack/react-query'

import type {
  SetModelAccessInput,
  UpdateVaultModelInput,
  UpdateVaultSettingsInput,
} from '@surefy/contracts'
import { accessKeys } from '@surefy/web-core/api/access'
import { apiClient } from '@surefy/web-core/http'
import type { MutationHookOptions } from '@surefy/web-core/query'

import { modelsApi } from './models.api'
import { modelKeys } from './models.queries'

/** Access rules change what people may use, so the effective access views refresh with the models. */
function useRefreshModels(orgId: string) {
  const queryClient = useQueryClient()
  return () =>
    Promise.all([
      queryClient.invalidateQueries({ queryKey: modelKeys.all(orgId) }),
      queryClient.invalidateQueries({ queryKey: accessKeys.all(orgId) }),
    ])
}

export function useUpdateVaultModelMutation(
  orgId: string,
  { silent = false }: MutationHookOptions = {},
) {
  const refresh = useRefreshModels(orgId)
  return useMutation({
    meta: { silent },
    mutationFn: ({ modelId, ...input }: UpdateVaultModelInput & { modelId: string }) =>
      modelsApi.update(apiClient, orgId, modelId, input),
    onSuccess: refresh,
  })
}

export function useSetModelAccessMutation(
  orgId: string,
  { silent = false }: MutationHookOptions = {},
) {
  const refresh = useRefreshModels(orgId)
  return useMutation({
    meta: { silent },
    mutationFn: ({ modelId, ...input }: SetModelAccessInput & { modelId: string }) =>
      modelsApi.setAccess(apiClient, orgId, modelId, input),
    onSuccess: refresh,
  })
}

export function useUpdateVaultSettingsMutation(
  orgId: string,
  { silent = false }: MutationHookOptions = {},
) {
  const refresh = useRefreshModels(orgId)
  return useMutation({
    meta: { silent },
    mutationFn: (input: UpdateVaultSettingsInput) =>
      modelsApi.updateSettings(apiClient, orgId, input),
    onSuccess: refresh,
  })
}
