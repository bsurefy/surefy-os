// SPDX-License-Identifier: AGPL-3.0-only
import { useQueryClient } from '@tanstack/react-query'
import { useTranslations } from 'next-intl'

import { closeSessionExpired, useIsSessionExpired } from './sessionExpiredStore'

import type { SessionExpiredDialogProps } from './SessionExpiredDialog.types'

export function useSessionExpiredDialogController({ onSignOut }: SessionExpiredDialogProps) {
  // 1. external hooks
  const t = useTranslations('session.expired')
  const queryClient = useQueryClient()
  const isOpen = useIsSessionExpired()

  // 4. handlers
  const onSignedIn = () => {
    closeSessionExpired()
    // nothing on the page is reset: the queries that failed or went stale refetch in place
    void queryClient.invalidateQueries()
  }

  const onSignOutClick = () => {
    closeSessionExpired()
    onSignOut()
  }

  // 7. flat return
  return { isOpen, onSignedIn, onSignOutClick, t }
}
