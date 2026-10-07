// SPDX-License-Identifier: AGPL-3.0-only
import { useMutation, useQueryClient } from '@tanstack/react-query'

import { apiClient } from '@surefy/web-core/http'
import type { MutationHookOptions } from '@surefy/web-core/query'

import { notificationsApi } from './notifications.api'
import { notificationKeys } from './notifications.queries'

/** Marks one notification read; the lists and the bell's count refresh. */
export function useMarkNotificationReadMutation(
  orgId: string,
  { silent = false }: MutationHookOptions = {},
) {
  const queryClient = useQueryClient()
  return useMutation({
    meta: { silent },
    mutationFn: (notificationId: string) =>
      notificationsApi.markRead(apiClient, orgId, notificationId),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: notificationKeys.all(orgId) }),
  })
}

export function useMarkAllNotificationsReadMutation(
  orgId: string,
  { silent = false }: MutationHookOptions = {},
) {
  const queryClient = useQueryClient()
  return useMutation({
    meta: { silent },
    mutationFn: () => notificationsApi.markAllRead(apiClient, orgId),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: notificationKeys.all(orgId) }),
  })
}
