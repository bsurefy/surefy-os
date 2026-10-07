// SPDX-License-Identifier: AGPL-3.0-only
import { useQuery } from '@tanstack/react-query'
import { useTranslations } from 'next-intl'

import { dataControlQueries } from '@/api/dataControl'
import { useCurrentOrgId } from '@surefy/web-core/access'
import { getErrorMessage, isApiError } from '@surefy/web-core/errors'

/** Where the data is stored and how long each kind is kept. */
export function useRetentionSectionController() {
  const t = useTranslations('settings.dataPrivacy.retention')
  const tErrors = useTranslations('errors')
  const orgId = useCurrentOrgId()
  const { data, isPending, error, refetch } = useQuery(dataControlQueries.retention(orgId))

  return {
    retention: data,
    isLoading: isPending,
    errorMessage: error ? getErrorMessage(error, tErrors) : null,
    errorReference: isApiError(error) ? error.requestId : undefined,
    refetch: () => void refetch(),
    t,
  }
}
