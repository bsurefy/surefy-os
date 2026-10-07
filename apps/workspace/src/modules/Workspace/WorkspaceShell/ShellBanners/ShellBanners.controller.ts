// SPDX-License-Identifier: AGPL-3.0-only
import { useQueryClient } from '@tanstack/react-query'
import { useFormatter, useTranslations } from 'next-intl'

import { useCurrentOrgId } from '@surefy/web-core/access'

import { useIsOnline, useMe } from '../../Workspace.hooks'

/**
 * Shell-level banners: the active support or partner access grant on this organization
 * (authentication.md §6; never dismissible, never branded) and the offline state (states.md).
 */
export function useShellBannersController() {
  const t = useTranslations('workspace')
  const format = useFormatter()
  const queryClient = useQueryClient()
  const orgId = useCurrentOrgId()
  const { data: me } = useMe()
  const isOnline = useIsOnline()

  const grant = me?.supportAccess.find((notice) => notice.organizationId === orgId)
  const scope = grant?.scope === 'write' ? 'write' : 'readOnly'
  const accessMessage = grant
    ? t(`supportAccess.${grant.via}.${scope}`, {
        partner: grant.partnerName ?? '',
        reason: grant.reason,
        endsAt: format.dateTime(new Date(grant.endsAt), { timeStyle: 'short' }),
      })
    : null

  return {
    accessMessage,
    isOffline: !isOnline,
    onRetry: () => {
      void queryClient.refetchQueries({ type: 'active' })
    },
    t,
  }
}
