// SPDX-License-Identifier: AGPL-3.0-only
import { useMutation, useQueryClient } from '@tanstack/react-query'

import { meKeys } from '@surefy/web-core/api/me'
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

/** Accepting an invitation changes the memberships, so the cached `me` is refetched. */
export function useAcceptInvitationMutation({ silent = true }: MutationHookOptions = {}) {
  const queryClient = useQueryClient()
  return useMutation({
    meta: { silent },
    mutationFn: (token: string) => authApi.acceptInvitation(apiClient, token),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: meKeys.all() }),
  })
}

export function useRequestInvitationReissueMutation({ silent = true }: MutationHookOptions = {}) {
  return useMutation({
    meta: { silent },
    mutationFn: (token: string) => authApi.requestInvitationReissue(apiClient, token),
  })
}
