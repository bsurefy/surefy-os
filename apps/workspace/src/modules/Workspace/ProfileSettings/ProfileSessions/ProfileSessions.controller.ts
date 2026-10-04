// SPDX-License-Identifier: AGPL-3.0-only
import { useQuery } from '@tanstack/react-query'
import { useFormatter, useNow, useTranslations } from 'next-intl'
import { useState } from 'react'

import { authQueries, useRevokeOtherSessionsMutation, useRevokeSessionMutation } from '@/api/auth'
import { toast } from '@surefy/ui/components/Feedback'
import { getErrorMessage, isApiError } from '@surefy/web-core/errors'

import { describeUserAgent } from './ProfileSessions.utils'

/** Signed-in devices with "Sign out" per device and "Sign out everywhere else" (T2). */
export function useProfileSessionsController() {
  const t = useTranslations('workspace.profile.sessions')
  const tErrors = useTranslations('errors')
  const format = useFormatter()
  const now = useNow()
  const sessions = useQuery(authQueries.sessions())
  const revoke = useRevokeSessionMutation()
  const revokeOthers = useRevokeOtherSessionsMutation({ silent: true })
  const [isConfirmOpen, setIsConfirmOpen] = useState(false)

  const rows = (sessions.data ?? []).map((session) => {
    const device = describeUserAgent(session.userAgent)
    return {
      id: session.id,
      device: device ? t('device', device) : t('unknownDevice'),
      details: [
        t(`apps.${session.app}`),
        session.ipAddress ?? t('unknownAddress'),
        t('lastActive', { time: format.relativeTime(new Date(session.updatedAt), now) }),
      ].join(' · '),
      isCurrent: session.isCurrent,
    }
  })

  return {
    rows,
    isLoading: sessions.isPending,
    errorMessage: sessions.error ? getErrorMessage(sessions.error, tErrors) : null,
    errorReference: isApiError(sessions.error) ? sessions.error.requestId : undefined,
    refetch: () => void sessions.refetch(),
    hasOthers: rows.some((row) => !row.isCurrent),
    revokingId: revoke.isPending ? revoke.variables : undefined,
    onRevoke: (sessionId: string) => {
      revoke.mutate(sessionId, { onSuccess: () => toast.success(t('revoked')) })
    },
    isConfirmOpen,
    setIsConfirmOpen,
    confirmError: revokeOthers.error ? getErrorMessage(revokeOthers.error, tErrors) : undefined,
    onConfirmRevokeOthers: async () => {
      await revokeOthers.mutateAsync()
      toast.success(t('othersRevoked'))
    },
    t,
  }
}
