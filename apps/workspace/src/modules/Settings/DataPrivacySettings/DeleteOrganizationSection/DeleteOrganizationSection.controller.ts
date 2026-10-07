// SPDX-License-Identifier: AGPL-3.0-only
import { useQuery } from '@tanstack/react-query'
import { useTranslations } from 'next-intl'
import { useState } from 'react'

import {
  dataControlQueries,
  useCancelDataRequestMutation,
  useCreateDataRequestMutation,
} from '@/api/dataControl'
import { organizationQueries } from '@/api/organizations'
import { toast } from '@surefy/ui/components/Feedback'
import { useCurrentOrgId } from '@surefy/web-core/access'
import { getErrorMessage } from '@surefy/web-core/errors'

import { findScheduledDeletion } from '../DataPrivacySettings.utils'

/**
 * Delete the organization (Owner): a typed name and a reason (T3), a 30-day hold, and a way to
 * cancel while it lasts. The server asks for a fresh sign-in and two-factor itself.
 */
export function useDeleteOrganizationSectionController() {
  const t = useTranslations('settings.dataPrivacy.delete')
  const tErrors = useTranslations('errors')
  const orgId = useCurrentOrgId()
  const [isConfirming, setIsConfirming] = useState(false)
  const { data: organization } = useQuery(organizationQueries.detail(orgId))
  const requests = useQuery(dataControlQueries.requests(orgId, { type: 'deletion' }))
  const create = useCreateDataRequestMutation(orgId, { silent: true })
  const cancel = useCancelDataRequestMutation(orgId)

  const scheduled = findScheduledDeletion(requests.data?.items ?? [])
  return {
    organizationName: organization?.name,
    scheduled,
    isConfirming,
    onOpenConfirm: () => {
      setIsConfirming(true)
    },
    onCloseConfirm: () => {
      setIsConfirming(false)
    },
    createError: create.error ? getErrorMessage(create.error, tErrors) : undefined,
    onDelete: async ({ reason }: { reason?: string }) => {
      await create.mutateAsync({ type: 'deletion', reason: reason ?? '' })
      toast.success(t('scheduledToast'))
    },
    isCanceling: cancel.isPending,
    onCancel: () => {
      if (scheduled) cancel.mutate(scheduled.id, { onSuccess: () => toast.success(t('canceled')) })
    },
    t,
  }
}
