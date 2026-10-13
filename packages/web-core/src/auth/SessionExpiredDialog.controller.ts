// SPDX-License-Identifier: AGPL-3.0-only
import { useQueryClient } from '@tanstack/react-query'
import { useTranslations } from 'next-intl'

import { closeSessionExpired, useSessionDialogMode } from './sessionExpiredStore'

import type { SessionExpiredDialogProps } from './SessionExpiredDialog.types'

export function useSessionExpiredDialogController({ onSignOut }: SessionExpiredDialogProps) {
  // 1. external hooks
  const mode = useSessionDialogMode()
  const t = useTranslations(mode === 'confirm' ? 'session.confirm' : 'session.expired')
  const queryClient = useQueryClient()

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

  const onCancelClick = () => {
    closeSessionExpired()
  }

  // 7. flat return
  return { mode, onSignedIn, onSignOutClick, onCancelClick, t }
}
