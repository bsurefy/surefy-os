// SPDX-License-Identifier: AGPL-3.0-only
import { useMutation, useQueryClient } from '@tanstack/react-query'

import { apiClient } from '@surefy/web-core/http'
import type { MutationHookOptions } from '@surefy/web-core/query'

import { authApi } from './auth.api'
import { authKeys } from './auth.queries'

export function useRevokeSessionMutation({ silent = false }: MutationHookOptions = {}) {
  const queryClient = useQueryClient()
  return useMutation({
    meta: { silent },
    mutationFn: (sessionId: string) => authApi.revokeSession(apiClient, sessionId),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: authKeys.sessions() }),
  })
}

/** "Sign out everywhere else": every session but the one in use ends. */
export function useRevokeOtherSessionsMutation({ silent = false }: MutationHookOptions = {}) {
  const queryClient = useQueryClient()
  return useMutation({
    meta: { silent },
    mutationFn: () => authApi.revokeOtherSessions(apiClient),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: authKeys.sessions() }),
  })
}
