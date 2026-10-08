// SPDX-License-Identifier: AGPL-3.0-only
import { useQuery } from '@tanstack/react-query'
import { useTranslations } from 'next-intl'

import { guardQueries } from '@/api/guard'
import { PERMISSIONS } from '@surefy/contracts'
import { useCan, useCurrentOrgId } from '@surefy/web-core/access'
import { getErrorMessage, isApiError } from '@surefy/web-core/errors'

/** Guard › Defaults: loads the organization's defaults for the form. */
export function useGuardDefaultsController() {
  const t = useTranslations('guard.defaults')
  const tErrors = useTranslations('errors')
  const orgId = useCurrentOrgId()
  const canManage = useCan(PERMISSIONS.GUARD_MANAGE)
  const { data, isPending, error, refetch } = useQuery(guardQueries.defaults(orgId))

  return {
    t,
    settings: data,
    canManage,
    isLoading: isPending,
    errorMessage: error ? getErrorMessage(error, tErrors) : null,
    errorReference: isApiError(error) ? error.requestId : undefined,
    refetch: () => void refetch(),
  }
}
