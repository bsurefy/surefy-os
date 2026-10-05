// SPDX-License-Identifier: AGPL-3.0-only
import { useMutation, useQueryClient } from '@tanstack/react-query'

import type {
  AddInstallAdminInput,
  SendTestEmailInput,
  UpdateInstallSettingsInput,
} from '@surefy/contracts'
import { meKeys } from '@surefy/web-core/api/me'
import { apiClient } from '@surefy/web-core/http'
import type { MutationHookOptions } from '@surefy/web-core/query'

import { installApi } from './install.api'
import { installKeys } from './install.queries'

/** Install settings decide the public sign-in options and who may create organizations. */
export function useUpdateInstallSettingsMutation({ silent = false }: MutationHookOptions = {}) {
  const queryClient = useQueryClient()
  return useMutation({
    meta: { silent },
    mutationFn: (input: UpdateInstallSettingsInput) => installApi.updateSettings(apiClient, input),
    onSuccess: (settings) => {
      queryClient.setQueryData(installKeys.settings(), settings)
      return queryClient.invalidateQueries({ queryKey: meKeys.all() })
    },
  })
}

export function useSendTestEmailMutation({ silent = false }: MutationHookOptions = {}) {
  return useMutation({
    meta: { silent },
    mutationFn: (input: SendTestEmailInput) => installApi.sendTestEmail(apiClient, input),
  })
}

export function useAddInstallAdminMutation({ silent = false }: MutationHookOptions = {}) {
  const queryClient = useQueryClient()
  return useMutation({
    meta: { silent },
    mutationFn: (input: AddInstallAdminInput) => installApi.addAdmin(apiClient, input),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: installKeys.admins() }),
  })
}

export function useRemoveInstallAdminMutation({ silent = false }: MutationHookOptions = {}) {
  const queryClient = useQueryClient()
  return useMutation({
    meta: { silent },
    mutationFn: (userId: string) => installApi.removeAdmin(apiClient, userId),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: installKeys.admins() }),
  })
}
