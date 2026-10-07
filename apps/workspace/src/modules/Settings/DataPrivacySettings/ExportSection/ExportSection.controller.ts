// SPDX-License-Identifier: AGPL-3.0-only
import { useQuery } from '@tanstack/react-query'
import { useTranslations } from 'next-intl'
import { useState } from 'react'

import {
  dataControlQueries,
  useCancelDataRequestMutation,
  useCreateDataRequestMutation,
  useDownloadDataRequestMutation,
  useRetryDataRequestMutation,
} from '@/api/dataControl'
import { toast } from '@surefy/ui/components/Feedback'
import { useCurrentOrgId } from '@surefy/web-core/access'
import { getErrorMessage, isApiError } from '@surefy/web-core/errors'

/** Export of all organization data: ask for one, follow it while it is prepared, download it. */
export function useExportSectionController() {
  const t = useTranslations('settings.dataPrivacy.export')
  const tErrors = useTranslations('errors')
  const orgId = useCurrentOrgId()
  const [isConfirming, setIsConfirming] = useState(false)
  const list = useQuery(dataControlQueries.requests(orgId, { type: 'export' }))
  const create = useCreateDataRequestMutation(orgId, { silent: true })
  const cancel = useCancelDataRequestMutation(orgId)
  const retry = useRetryDataRequestMutation(orgId)
  const download = useDownloadDataRequestMutation(orgId)

  return {
    requests: list.data?.items ?? [],
    isLoading: list.isPending,
    errorMessage: list.error ? getErrorMessage(list.error, tErrors) : null,
    errorReference: isApiError(list.error) ? list.error.requestId : undefined,
    refetch: () => void list.refetch(),
    isConfirming,
    onOpenConfirm: () => {
      setIsConfirming(true)
    },
    onCloseConfirm: () => {
      setIsConfirming(false)
    },
    createError: create.error ? getErrorMessage(create.error, tErrors) : undefined,
    onRequest: async () => {
      await create.mutateAsync({ type: 'export' })
      toast.success(t('requested'))
    },
    onCancel: (id: string) => {
      cancel.mutate(id, { onSuccess: () => toast.success(t('canceled')) })
    },
    onRetry: (id: string) => {
      retry.mutate(id, { onSuccess: () => toast.success(t('retrying')) })
    },
    onDownload: (id: string) => {
      download.mutate(id, {
        onSuccess: (link) => {
          window.location.assign(link.url)
        },
      })
    },
    t,
  }
}
